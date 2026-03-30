import type { Response } from 'express';
import { pool } from '../db/pool';
import { sendCancellationEmail } from '../services/emailService';
import type { AuthedRequest } from '../middleware/authMiddleware';

export async function createBooking(req: AuthedRequest, res: Response) {
  const riderId = req.user?.userId;
  if (!riderId) {
    return res.status(401).json({ message: 'Unauthorized' });
  }

  const { ride_id, seats_booked, amount, payment_method } = req.body;

  if (!ride_id || !seats_booked || !amount) {
    return res.status(400).json({ message: 'Ride ID, seats, and amount are required.' });
  }

  const client = await pool.connect();
  try {
    await client.query('BEGIN');

    // 1. Check if ride exists and has enough seats
    const rideResult = await client.query(
      'SELECT available_seats, driver_id, booking_type FROM rides WHERE ride_id = $1 FOR UPDATE',
      [ride_id]
    );

    if (rideResult.rowCount === 0) {
      await client.query('ROLLBACK');
      return res.status(404).json({ message: 'Ride not found.' });
    }

    const ride = rideResult.rows[0];

    if (ride.driver_id === riderId) {
      await client.query('ROLLBACK');
      return res.status(400).json({ message: 'You cannot book your own ride.' });
    }

    if (ride.available_seats < seats_booked) {
      await client.query('ROLLBACK');
      return res.status(400).json({ message: 'Not enough seats available.' });
    }

    const isApprovalBased = ride.booking_type === 'APPROVAL';
    const initialStatus = isApprovalBased ? 'PENDING' : 'CONFIRMED';

    // 2. Create booking
    const bookingResult = await client.query(
      `INSERT INTO bookings (
        ride_id, rider_id, seats_booked, amount, 
        payment_method, payment_status, booking_status
      ) VALUES ($1, $2, $3, $4, $5, 'PENDING', $6)
      RETURNING booking_id`,
      [ride_id, riderId, seats_booked, amount, payment_method || 'CARD', initialStatus]
    );

    // 3. Update available seats ONLY if instant booking
    if (!isApprovalBased) {
      await client.query(
        'UPDATE rides SET available_seats = available_seats - $1 WHERE ride_id = $2',
        [seats_booked, ride_id]
      );
    }

    await client.query('COMMIT');

    // Notify driver (asynchronous)
    (async () => {
      try {
        const infoResult = await pool.query(
          `SELECT 
            u1.email as driver_email, 
            u2.full_name as rider_name, 
            u2.phone as rider_phone,
            r.source, 
            r.destination, 
            r.ride_date
           FROM rides r
           JOIN users u1 ON r.driver_id = u1.user_id
           JOIN users u2 ON u2.user_id = $1
           WHERE r.ride_id = $2`,
          [riderId, ride_id]
        );

        if (infoResult.rowCount && infoResult.rowCount > 0) {
          const info = infoResult.rows[0];
          const { sendBookingNotification } = require('../services/emailService');

          const notificationSubject = isApprovalBased ? 'Ride Request' : 'New Booking';
          const notificationType = isApprovalBased ? 'REQUEST' : 'BOOKING';

          await sendBookingNotification(info.driver_email, {
            riderName: info.rider_name,
            riderPhone: info.rider_phone,
            seats: seats_booked,
            source: info.source,
            destination: info.destination,
            rideDate: info.ride_date,
            type: notificationType
          });
        }
      } catch (err) {
        console.error('Failed to send booking notification:', err);
      }
    })();

    res.status(201).json({
      message: isApprovalBased ? 'Request sent to driver!' : 'Booking created successfully!',
      bookingId: bookingResult.rows[0].booking_id,
      status: initialStatus
    });

  } catch (error) {
    await client.query('ROLLBACK');
    console.error('Error creating booking:', error);
    res.status(500).json({ message: 'Internal server error' });
  } finally {
    client.release();
  }
}

export async function handleBookingAction(req: AuthedRequest, res: Response) {
  const userId = req.user?.userId;
  if (!userId) {
    return res.status(401).json({ message: 'Unauthorized' });
  }

  const { id } = req.params; // booking_id
  const { action } = req.body; // 'APPROVE' or 'REJECT'

  if (!['APPROVE', 'REJECT'].includes(action)) {
    return res.status(400).json({ message: 'Invalid action.' });
  }

  const client = await pool.connect();
  try {
    await client.query('BEGIN');

    // 1. Verify that the requester is the driver of the ride
    const bookingResult = await client.query(
      `SELECT b.*, r.driver_id, r.available_seats 
       FROM bookings b 
       JOIN rides r ON b.ride_id = r.ride_id 
       WHERE b.booking_id = $1 FOR UPDATE`,
      [id]
    );

    if (bookingResult.rowCount === 0) {
      await client.query('ROLLBACK');
      return res.status(404).json({ message: 'Booking not found.' });
    }

    const booking = bookingResult.rows[0];

    if (booking.driver_id !== userId) {
      await client.query('ROLLBACK');
      return res.status(403).json({ message: 'Only the driver can approve/reject requests.' });
    }

    if (booking.booking_status !== 'PENDING') {
      await client.query('ROLLBACK');
      return res.status(400).json({ message: `Cannot ${action.toLowerCase()} a booking that is ${booking.booking_status.toLowerCase()}.` });
    }

    if (action === 'APPROVE') {
      // Check if seats are still available
      if (booking.available_seats < booking.seats_booked) {
        await client.query('ROLLBACK');
        return res.status(400).json({ message: 'Not enough seats available left on this ride.' });
      }

      // Update booking status
      await client.query(
        "UPDATE bookings SET booking_status = 'CONFIRMED' WHERE booking_id = $1",
        [id]
      );

      // Decrement seats
      await client.query(
        'UPDATE rides SET available_seats = available_seats - $1 WHERE ride_id = $2',
        [booking.seats_booked, booking.ride_id]
      );
    } else {
      // REJECT
      await client.query(
        "UPDATE bookings SET booking_status = 'REJECTED' WHERE booking_id = $1",
        [id]
      );
    }

    await client.query('COMMIT');

    // Notify rider (asynchronous)
    (async () => {
      try {
        const infoResult = await pool.query(
          `SELECT 
            u.email as rider_email, 
            u.full_name as rider_name,
            r.source, 
            r.destination,
            r.ride_date
           FROM bookings b
           JOIN users u ON b.rider_id = u.user_id
           JOIN rides r ON b.ride_id = r.ride_id
           WHERE b.booking_id = $1`,
          [id]
        );

        if (infoResult.rowCount && infoResult.rowCount > 0) {
          const info = infoResult.rows[0];
          const { sendBookingStatusEmail } = require('../services/emailService');
          await sendBookingStatusEmail(info.rider_email, {
            riderName: info.rider_name,
            rideDetails: `${info.source} to ${info.destination}`,
            status: action === 'APPROVE' ? 'CONFIRMED' : 'REJECTED',
            rideDate: info.ride_date
          });
        }
      } catch (err) {
        console.error('Failed to send status update notification:', err);
      }
    })();

    res.json({ message: `Booking ${action === 'APPROVE' ? 'approved' : 'rejected'} successfully.` });

  } catch (error) {
    await client.query('ROLLBACK');
    console.error('Error handling booking action:', error);
    res.status(500).json({ message: 'Internal server error' });
  } finally {
    client.release();
  }
}

export async function cancelBooking(req: AuthedRequest, res: Response) {
  const userId = req.user?.userId;
  if (!userId) {
    return res.status(401).json({ message: 'Unauthorized' });
  }

  const { id } = req.params; // booking_id

  const client = await pool.connect();
  try {
    await client.query('BEGIN');

    // 1. Find booking and verify ownership (rider or driver)
    const bookingResult = await client.query(
      `SELECT b.*, r.driver_id 
       FROM bookings b 
       JOIN rides r ON b.ride_id = r.ride_id 
       WHERE b.booking_id = $1 FOR UPDATE`,
      [id]
    );

    if (bookingResult.rowCount === 0) {
      await client.query('ROLLBACK');
      return res.status(404).json({ message: 'Booking not found.' });
    }

    const booking = bookingResult.rows[0];

    if (booking.rider_id !== userId && booking.driver_id !== userId) {
      await client.query('ROLLBACK');
      return res.status(403).json({ message: 'Unauthorized to cancel this booking.' });
    }

    if (booking.booking_status === 'CANCELLED') {
      await client.query('ROLLBACK');
      return res.status(400).json({ message: 'Booking is already cancelled.' });
    }

    // 2. Update booking status
    await client.query(
      "UPDATE bookings SET booking_status = 'CANCELLED' WHERE booking_id = $1",
      [id]
    );

    // 3. Revert seats in ride
    await client.query(
      'UPDATE rides SET available_seats = available_seats + $1 WHERE ride_id = $2',
      [booking.seats_booked, booking.ride_id]
    );

    await client.query('COMMIT');

    // 4. Notify the driver (asynchronous)
    (async () => {
      try {
        const infoResult = await pool.query(
          `SELECT 
            u1.email as driver_email, 
            u1.full_name as driver_name,
            u1.user_id as driver_id,
            u2.full_name as rider_name, 
            r.source, 
            r.destination, 
            r.ride_date
           FROM rides r
           JOIN users u1 ON r.driver_id = u1.user_id
           JOIN users u2 ON u2.user_id = $1
           WHERE r.ride_id = $2`,
          [booking.rider_id, booking.ride_id]
        );

        if (infoResult.rowCount && infoResult.rowCount > 0) {
          const info = infoResult.rows[0];

          // Send Email
          await sendCancellationEmail(info.driver_email, {
            name: info.driver_name,
            type: 'BOOKING',
            details: `${info.source} to ${info.destination}`,
            date: info.ride_date,
            reason: 'Passenger cancelled their booking.'
          });

          // In-app Notification
          await pool.query(
            `INSERT INTO notifications (user_id, type, message)
             VALUES ($1, 'BOOKING_CANCELLED', $2)`,
            [
              info.driver_id,
              `${info.rider_name} has cancelled their booking for your ride from ${info.source} to ${info.destination} on ${new Date(info.ride_date).toLocaleDateString()}.`
            ]
          );
        }
      } catch (err) {
        console.error('Failed to send booking cancellation notification:', err);
      }
    })();

    res.json({ message: 'Booking cancelled successfully.' });

  } catch (error) {
    await client.query('ROLLBACK');
    console.error('Error cancelling booking:', error);
    res.status(500).json({ message: 'Internal server error' });
  } finally {
    client.release();
  }
}

export async function getMyBookings(req: AuthedRequest, res: Response) {
  const userId = req.user?.userId;
  if (!userId) {
    return res.status(401).json({ message: 'Unauthorized' });
  }

  try {
    const bookings = await pool.query(
      `SELECT b.*, r.source, r.destination, r.ride_date, r.ride_time, 
              u.full_name as driver_name, u.profile_photo as driver_photo
       FROM bookings b
       JOIN rides r ON b.ride_id = r.ride_id
       JOIN users u ON r.driver_id = u.user_id
       WHERE b.rider_id = $1
       ORDER BY b.created_at DESC`,
      [userId]
    );

    // Map to the format frontend expects (item.ride_details)
    const formatted = bookings.rows.map(b => ({
      ...b,
      ride_details: {
        source: b.source,
        destination: b.destination,
        ride_date: b.ride_date,
        ride_time: b.ride_time
      },
      status: b.booking_status
    }));

    res.json(formatted);
  } catch (error) {
    console.error('Error fetching my bookings:', error);
    res.status(500).json({ message: 'Internal server error' });
  }
}


