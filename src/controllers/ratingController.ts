import type { Response } from 'express';
import type { AuthedRequest } from '../middleware/authMiddleware';
import { pool } from '../db/pool';

// POST /api/ratings  — passenger submits a rating for the driver after a completed ride
export async function submitRating(req: AuthedRequest, res: Response) {
  const passengerId = req.user?.userId;
  if (!passengerId) return res.status(401).json({ message: 'Unauthorized' });

  const { ride_id, rating, review } = req.body;

  if (!ride_id || !rating) {
    return res.status(400).json({ message: 'ride_id and rating are required' });
  }
  if (rating < 1 || rating > 5) {
    return res.status(400).json({ message: 'Rating must be between 1 and 5' });
  }

  const client = await pool.connect();
  try {
    // 1. Verify the ride is COMPLETED and the user was a passenger (CONFIRMED/COMPLETED booking)
    const rideCheck = await client.query(
      `SELECT r.ride_id, r.driver_id, r.source, r.destination, r.ride_date,
              b.booking_status, u.full_name AS driver_name, u.email AS driver_email
       FROM rides r
       JOIN bookings b ON b.ride_id = r.ride_id AND b.rider_id = $1
       JOIN users u ON u.user_id = r.driver_id
       WHERE r.ride_id = $2 AND r.status = 'COMPLETED'`,
      [passengerId, ride_id]
    );

    if (rideCheck.rowCount === 0) {
      return res.status(404).json({ message: 'Completed ride not found or you were not a passenger' });
    }

    const rideData = rideCheck.rows[0];

    // 2. Check if the passenger already rated this ride
    const existing = await client.query(
      `SELECT rating_id FROM ratings WHERE ride_id = $1 AND rated_by = $2`,
      [ride_id, passengerId]
    );

    if ((existing.rowCount ?? 0) > 0) {
      return res.status(409).json({ message: 'You have already rated this ride' });
    }

    // 3. Insert the rating
    await client.query(
      `INSERT INTO ratings (ride_id, rated_by, rated_user, rating, review)
       VALUES ($1, $2, $3, $4, $5)`,
      [ride_id, passengerId, rideData.driver_id, rating, review || null]
    );

    // 4. Notify driver in-app
    try {
      const passengerRes = await client.query(
        `SELECT full_name FROM users WHERE user_id = $1`, [passengerId]
      );
      const passengerName = passengerRes.rows[0]?.full_name || 'A passenger';

      await client.query(
        `INSERT INTO notifications (user_id, type, message) VALUES ($1, 'NEW_REVIEW', $2)`,
        [rideData.driver_id, `${passengerName} rated your ride from ${rideData.source?.split(',')[0]} to ${rideData.destination?.split(',')[0]} — ${rating} ⭐`]
      );
    } catch (notifErr) {
      console.error('Notification insert failed (non-fatal):', notifErr);
    }

    res.status(201).json({ message: 'Rating submitted successfully' });

    // 5. Fire-and-forget email to driver
    setImmediate(async () => {
      try {
        const { sendReviewNotificationEmail } = await import('../services/emailService');
        const passengerRes = await pool.query(`SELECT full_name FROM users WHERE user_id = $1`, [passengerId]);
        const passengerName = passengerRes.rows[0]?.full_name || 'A passenger';

        await sendReviewNotificationEmail(rideData.driver_email, {
          driverName: rideData.driver_name,
          passengerName,
          rating,
          review: review || null,
          source: rideData.source,
          destination: rideData.destination,
          date: rideData.ride_date,
        });
      } catch (emailErr) {
        console.error('Failed to send review email (non-fatal):', emailErr);
      }
    });

  } catch (error) {
    console.error('Error submitting rating:', error);
    res.status(500).json({ message: 'Internal server error' });
  } finally {
    client.release();
  }
}

// POST /api/ratings/passenger — driver submits a rating for a passenger after a completed ride
export async function submitPassengerRating(req: AuthedRequest, res: Response) {
  const driverId = req.user?.userId;
  if (!driverId) return res.status(401).json({ message: 'Unauthorized' });

  const { ride_id, passenger_id, rating, review } = req.body;

  if (!ride_id || !passenger_id || !rating) {
    return res.status(400).json({ message: 'ride_id, passenger_id and rating are required' });
  }
  if (rating < 1 || rating > 5) {
    return res.status(400).json({ message: 'Rating must be between 1 and 5' });
  }

  const client = await pool.connect();
  try {
    // 1. Verify the ride is COMPLETED, the user was the driver, and the target was a passenger
    const rideCheck = await client.query(
      `SELECT r.ride_id, r.source, r.destination, r.ride_date,
              b.booking_status, u.full_name AS passenger_name, u.email AS passenger_email, r.driver_id
       FROM rides r
       JOIN bookings b ON b.ride_id = r.ride_id AND b.rider_id = $2
       JOIN users u ON u.user_id = $2
       WHERE r.ride_id = $1 AND r.driver_id = $3 AND r.status = 'COMPLETED' AND b.booking_status = 'COMPLETED'`,
      [ride_id, passenger_id, driverId]
    );

    if (rideCheck.rowCount === 0) {
      return res.status(404).json({ message: 'Completed ride not found or target was not a confirmed passenger' });
    }

    const { passenger_name, passenger_email, source, destination, ride_date } = rideCheck.rows[0];

    // 2. Check if the driver already rated this passenger for this ride
    const existing = await client.query(
      `SELECT rating_id FROM ratings WHERE ride_id = $1 AND rated_by = $2 AND rated_user = $3`,
      [ride_id, driverId, passenger_id]
    );

    if ((existing.rowCount ?? 0) > 0) {
      return res.status(409).json({ message: 'You have already rated this passenger for this ride' });
    }

    // 3. Insert the rating
    await client.query(
      `INSERT INTO ratings (ride_id, rated_by, rated_user, rating, review)
       VALUES ($1, $2, $3, $4, $5)`,
      [ride_id, driverId, passenger_id, rating, review || null]
    );

    // 4. Notify passenger in-app
    try {
      const driverRes = await client.query(
        `SELECT full_name FROM users WHERE user_id = $1`, [driverId]
      );
      const driverName = driverRes.rows[0]?.full_name || 'Your driver';

      await client.query(
        `INSERT INTO notifications (user_id, type, message) VALUES ($1, 'NEW_REVIEW', $2)`,
        [passenger_id, `${driverName} rated you for the ride from ${source?.split(',')[0]} to ${destination?.split(',')[0]} — ${rating} ⭐`]
      );
    } catch (notifErr) {
      console.error('Notification insert failed (non-fatal):', notifErr);
    }

    res.status(201).json({ message: 'Passenger rating submitted successfully' });

    // 5. Fire-and-forget email (optional, keeping consistent with submitRating)
    setImmediate(async () => {
      try {
        const { sendReviewNotificationEmail } = await import('../services/emailService');
        const driverRes = await pool.query(`SELECT full_name FROM users WHERE user_id = $1`, [driverId]);
        const driverName = driverRes.rows[0]?.full_name || 'Your driver';

        await sendReviewNotificationEmail(passenger_email, {
          driverName: passenger_name, // service expects receiver name as first arg usually, but here it's passenger
          passengerName: driverName,
          rating,
          review: review || null,
          source: source,
          destination: destination,
          date: ride_date,
        });
      } catch (emailErr) {
        console.error('Failed to send review email (non-fatal):', emailErr);
      }
    });

  } catch (error) {
    console.error('Error submitting passenger rating:', error);
    res.status(500).json({ message: 'Internal server error' });
  } finally {
    client.release();
  }
}

// GET /api/ratings/ride-passengers/:rideId — get all confirmed passengers for a ride (for driver to rate)
export async function getRidePassengers(req: AuthedRequest, res: Response) {
  const driverId = req.user?.userId;
  if (!driverId) return res.status(401).json({ message: 'Unauthorized' });

  const { rideId } = req.params;

  try {
    const result = await pool.query(
      `SELECT u.user_id, u.full_name, u.profile_photo, b.booking_status,
              EXISTS(SELECT 1 FROM ratings WHERE ride_id = $1 AND rated_by = $2 AND rated_user = u.user_id) as has_rated
       FROM users u
       JOIN bookings b ON b.rider_id = u.user_id
       JOIN rides r ON r.ride_id = b.ride_id
       WHERE b.ride_id = $1 AND r.driver_id = $2 AND b.booking_status IN ('CONFIRMED', 'COMPLETED')`,
      [rideId, driverId]
    );

    res.json(result.rows);
  } catch (err) {
    console.error('Error fetching ride passengers:', err);
    res.status(500).json({ message: 'Internal server error' });
  }
}

// GET /api/ratings/check?ride_id=X&target_user_id=Y — check if current user already rated a specific user for a ride
export async function checkRating(req: AuthedRequest, res: Response) {
  const userId = req.user?.userId;
  if (!userId) return res.status(401).json({ message: 'Unauthorized' });

  const { ride_id, target_user_id } = req.query;
  if (!ride_id) return res.status(400).json({ message: 'ride_id is required' });

  try {
    let query = `SELECT rating_id, rating, review FROM ratings WHERE ride_id = $1 AND rated_by = $2`;
    let params = [ride_id, userId];

    if (target_user_id) {
      query += ` AND rated_user = $3`;
      params.push(target_user_id as any);
    }

    const result = await pool.query(query, params);
    res.json({ hasRated: (result.rowCount ?? 0) > 0, existing: result.rows[0] || null });
  } catch (err) {
    res.status(500).json({ message: 'Internal server error' });
  }
}

// GET /api/ratings/user/:userId — get all ratings for any user (driver or passenger)
export async function getUserRatings(req: AuthedRequest, res: Response) {
  const { userId } = req.params;
  try {
    const result = await pool.query(
      `SELECT r.rating_id, r.rating, r.review, r.created_at,
              u.full_name AS reviewer_name, u.profile_photo AS reviewer_photo,
              ri.source, ri.destination, ri.ride_date
       FROM ratings r
       JOIN users u ON u.user_id = r.rated_by
       JOIN rides ri ON ri.ride_id = r.ride_id
       WHERE r.rated_user = $1
       ORDER BY r.created_at DESC`,
      [userId]
    );

    const avgResult = await pool.query(
      `SELECT ROUND(AVG(rating)::numeric, 1) AS avg_rating, COUNT(*) AS total
       FROM ratings WHERE rated_user = $1`,
      [userId]
    );

    res.json({
      ratings: result.rows,
      averageRating: parseFloat(avgResult.rows[0].avg_rating) || 0,
      totalRatings: parseInt(avgResult.rows[0].total),
    });
  } catch (err) {
    console.error('Error fetching user ratings:', err);
    res.status(500).json({ message: 'Internal server error' });
  }
}
