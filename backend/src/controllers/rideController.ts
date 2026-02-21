import type { Response } from 'express';
import type { AuthedRequest } from '../middleware/authMiddleware';
import { pool } from '../db/pool';
import { sendCancellationEmail } from '../services/emailService';

export async function createRide(req: AuthedRequest, res: Response) {
  const userId = req.user?.userId;

  if (!userId) {
    return res.status(401).json({ message: 'Unauthorized' });
  }

  try {
    // Check if user is a verified driver
    const userResult = await pool.query(
      'SELECT license_status FROM users WHERE user_id = $1',
      [userId]
    );

    if (userResult.rowCount === 0) {
      return res.status(404).json({ message: 'User not found' });
    }

    const licenseStatus = userResult.rows[0].license_status;
    if (licenseStatus !== 'VERIFIED') {
      return res.status(403).json({
        message: 'Your driving license is not verified yet. Please wait for admin approval before publishing rides.'
      });
    }

    const {
      source, destination, source_lat, source_lng, dest_lat, dest_lng,
      ride_date, ride_time, total_seats, base_price, route_polyline, stops,
      vehicle_id, booking_type
    } = req.body;

    let finalVehicleId = vehicle_id;

    if (!finalVehicleId) {
      // Find user's vehicle
      const vehicleResult = await pool.query(
        'SELECT vehicle_id FROM vehicles WHERE user_id = $1 LIMIT 1',
        [userId]
      );

      if (vehicleResult.rowCount === 0) {
        return res.status(400).json({ message: 'You must add a vehicle before you can offer a ride.' });
      }
      finalVehicleId = vehicleResult.rows[0].vehicle_id;
    }

    const client = await pool.connect();
    try {
      await client.query('BEGIN');

      // Check for vehicle overlap (4-hour safety window)
      const overlapResult = await client.query(
        `SELECT ride_time, ride_date FROM rides 
         WHERE vehicle_id = $1 
           AND status IN ('ACTIVE', 'STARTED')
           AND ABS(EXTRACT(EPOCH FROM ((ride_date + ride_time) - ($2::date + $3::time)))) < 14400
         LIMIT 1`,
        [finalVehicleId, ride_date, ride_time]
      );

      if (overlapResult.rowCount && overlapResult.rowCount > 0) {
        await client.query('ROLLBACK');
        return res.status(400).json({
          message: `This vehicle is already engaged in another ride at ${overlapResult.rows[0].ride_time}. Please select a different time or vehicle.`
        });
      }

      const rideInsertResult = await client.query(
        `INSERT INTO rides (
          driver_id, vehicle_id, source, destination, 
          source_lat, source_lng, dest_lat, dest_lng, 
          ride_date, ride_time, total_seats, available_seats, 
          base_price, route_polyline, status, total_stops, booking_type
        ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $11, $12, $13, 'ACTIVE', $14, $15)
        RETURNING ride_id`,
        [
          userId, finalVehicleId, source, destination,
          source_lat, source_lng, dest_lat, dest_lng,
          ride_date, ride_time, total_seats, base_price, route_polyline,
          stops ? stops.length : 0,
          booking_type || 'INSTANT'
        ]
      );

      const rideId = rideInsertResult.rows[0].ride_id;

      if (stops && Array.isArray(stops)) {
        for (const stop of stops) {
          await client.query(
            `INSERT INTO stops (
              parent_type, parent_id, city_name, 
              latitude, longitude, stop_order, stop_price
            ) VALUES ('RIDE', $1, $2, $3, $4, $5, $6)`,
            [rideId, stop.city_name, stop.latitude, stop.longitude, stop.stop_order, stop.stop_price]
          );
        }
      }

      await client.query('COMMIT');
      res.status(201).json({ message: 'Ride created successfully!', rideId });

    } catch (error) {
      await client.query('ROLLBACK');
      throw error;
    } finally {
      client.release();
    }
  } catch (error) {
    console.error('Error creating ride:', error);
    res.status(500).json({ message: 'Internal server error' });
  }
}

export async function searchRides(req: AuthedRequest, res: Response) {
  const {
    source_lat, source_lng, dest_lat, dest_lng,
    ride_date, seats_needed,
    source_city, dest_city
  } = req.query;

  if (!source_lat || !source_lng || !dest_lat || !dest_lng) {
    return res.status(400).json({ message: 'Pickup and drop-off coordinates are required.' });
  }

  try {
    const s_lat = parseFloat(source_lat as string);
    const s_lng = parseFloat(source_lng as string);
    const d_lat = parseFloat(dest_lat as string);
    const d_lng = parseFloat(dest_lng as string);
    const needed = parseInt(seats_needed as string) || 1;
    const s_city = source_city ? String(source_city).toLowerCase() : null;
    const d_city = dest_city ? String(dest_city).toLowerCase() : null;

    // Proximity search logic + Text-based City Matching
    // We look for rides where:
    // 1. (Starting point matches coords OR city name)
    // AND
    // 2. (Ending point matches coords OR city name)
    //
    // Note: We prioritize coordinate matches ideally, but for now a simple boolean OR is fine.

    const ridesResult = await pool.query(
      `SELECT * FROM (
        SELECT 
          r.*, 
          u.full_name as driver_name, 
          u.profile_photo as profile_image,
          u.phone as driver_phone,
          u.created_at as driver_join_date,
          (SELECT COALESCE(AVG(rating), 0) FROM ratings WHERE rated_user = u.user_id) as driver_rating,
          (SELECT COUNT(*) FROM ratings WHERE rated_user = u.user_id) as driver_rating_count,
          '' as vehicle_make, 
          v.model as vehicle_model, 
          v.vehicle_number as license_plate,
          (6371 * acos(LEAST(GREATEST(cos(radians($1)) * cos(radians(r.source_lat)) * cos(radians(r.source_lng) - radians($2)) + sin(radians($1)) * sin(radians(r.source_lat)), -1), 1))) AS source_distance,
          (6371 * acos(LEAST(GREATEST(cos(radians($3)) * cos(radians(r.dest_lat)) * cos(radians(r.dest_lng) - radians($4)) + sin(radians($3)) * sin(radians(r.dest_lat)), -1), 1))) AS dest_distance
        FROM rides r
        JOIN users u ON r.driver_id = u.user_id
        JOIN vehicles v ON r.vehicle_id = v.vehicle_id
        WHERE r.status = 'ACTIVE'
          AND r.available_seats >= $5
          AND ($6::date IS NULL OR r.ride_date = $6)
      ) sub
      WHERE (
        (
            (source_distance < 15) OR 
            ($7::text IS NOT NULL AND (
                LOWER(source) LIKE '%' || $7 || '%' OR 
                $7 LIKE '%' || LOWER(source) || '%'
            )) OR
            EXISTS (
                SELECT 1 FROM stops s 
                WHERE s.parent_id = sub.ride_id 
                AND s.parent_type = 'RIDE'
                AND (
                    (6371 * acos(LEAST(GREATEST(cos(radians($1)) * cos(radians(s.latitude)) * cos(radians(s.longitude) - radians($2)) + sin(radians($1)) * sin(radians(s.latitude)), -1), 1))) < 15
                    OR 
                    ($7::text IS NOT NULL AND (
                        LOWER(s.city_name) LIKE '%' || $7 || '%' OR 
                        $7 LIKE '%' || LOWER(s.city_name) || '%'
                    ))
                )
            )
        )
        AND 
        (
            (dest_distance < 15) OR 
            ($8::text IS NOT NULL AND (
                LOWER(destination) LIKE '%' || $8 || '%' OR 
                $8 LIKE '%' || LOWER(destination) || '%'
            )) OR
            EXISTS (
                SELECT 1 FROM stops s 
                WHERE s.parent_id = sub.ride_id 
                AND s.parent_type = 'RIDE'
                AND (
                    (6371 * acos(LEAST(GREATEST(cos(radians($3)) * cos(radians(s.latitude)) * cos(radians(s.longitude) - radians($4)) + sin(radians($3)) * sin(radians(s.latitude)), -1), 1))) < 15
                    OR 
                    ($8::text IS NOT NULL AND (
                        LOWER(s.city_name) LIKE '%' || $8 || '%' OR 
                        $8 LIKE '%' || LOWER(s.city_name) || '%'
                    ))
                )
            )
        )
      )
      ORDER BY (source_distance + dest_distance) ASC`,
      [s_lat, s_lng, d_lat, d_lng, needed, ride_date || null, s_city, d_city]
    );

    console.log('Search Results Sample:', ridesResult.rows[0]);

    // For each ride, also fetch its stops to show the full route
    const ridesWithStops = await Promise.all(ridesResult.rows.map(async (ride) => {
      const stopsResult = await pool.query(
        'SELECT * FROM stops WHERE parent_id = $1 AND parent_type = \'RIDE\' ORDER BY stop_order ASC',
        [ride.ride_id]
      );
      return { ...ride, stops: stopsResult.rows };
    }));

    res.json(ridesWithStops);
  } catch (error: any) {
    console.error('Error searching rides:', error);
    console.error('Database Error details:', error.message);
    console.error('Request params:', req.query);
    res.status(500).json({ message: 'Internal server error' });
  }
}

export async function getRideById(_req: AuthedRequest, res: Response) {
  res.status(501).json({ message: 'Not implemented: getRideById' });
}

export async function getMyRides(req: AuthedRequest, res: Response) {
  const userId = req.user?.userId;
  if (!userId) {
    return res.status(401).json({ message: 'Unauthorized' });
  }

  try {
    const rides = await pool.query(
      `SELECT r.*, v.model as vehicle_model, v.vehicle_number 
       FROM rides r 
       JOIN vehicles v ON r.vehicle_id = v.vehicle_id
       WHERE r.driver_id = $1 AND r.status = 'ACTIVE'
       ORDER BY r.ride_date DESC, r.ride_time DESC`,
      [userId]
    );

    res.json(rides.rows);
  } catch (error) {
    console.error('Error fetching my rides:', error);
    res.status(500).json({ message: 'Internal server error' });
  }
}

export async function completeRide(req: AuthedRequest, res: Response) {
  const userId = req.user?.userId;
  if (!userId) {
    return res.status(401).json({ message: 'Unauthorized' });
  }

  const { id } = req.params;

  const client = await pool.connect();
  try {
    await client.query('BEGIN');

    // 1. Lock and verify the ride
    const rideResult = await client.query(
      `SELECT r.*, u.full_name as driver_name
       FROM rides r JOIN users u ON r.driver_id = u.user_id
       WHERE r.ride_id = $1 FOR UPDATE OF r`,
      [id]
    );

    if (rideResult.rowCount === 0) {
      await client.query('ROLLBACK');
      return res.status(404).json({ message: 'Ride not found' });
    }

    const ride = rideResult.rows[0];

    if (Number(ride.driver_id) !== Number(userId)) {
      await client.query('ROLLBACK');
      return res.status(403).json({ message: 'Only the driver can complete this ride' });
    }

    if (ride.status !== 'ACTIVE' && ride.status !== 'STARTED') {
      await client.query('ROLLBACK');
      return res.status(400).json({ message: `Ride is already ${ride.status.toLowerCase()}` });
    }

    // 2. Update ride status to COMPLETED
    await client.query(
      "UPDATE rides SET status = 'COMPLETED' WHERE ride_id = $1",
      [id]
    );

    // 3. Mark CONFIRMED bookings as COMPLETED
    await client.query(
      "UPDATE bookings SET booking_status = 'COMPLETED' WHERE ride_id = $1 AND booking_status = 'CONFIRMED'",
      [id]
    );

    // 4. Cancel any still-PENDING bookings (ride is over, no more approvals possible)
    await client.query(
      "UPDATE bookings SET booking_status = 'CANCELLED' WHERE ride_id = $1 AND booking_status = 'PENDING'",
      [id]
    );

    // 5. Fetch all completed passengers for notifications
    const passengersResult = await client.query(
      `SELECT b.booking_id, b.rider_id, u.email, u.full_name
       FROM bookings b
       JOIN users u ON b.rider_id = u.user_id
       WHERE b.ride_id = $1 AND b.booking_status = 'COMPLETED'`,
      [id]
    );

    // 6. Send in-app notifications to each passenger (non-fatal)
    try {
      for (const passenger of passengersResult.rows) {
        await client.query(
          `INSERT INTO notifications (user_id, type, message)
           VALUES ($1, 'RIDE_COMPLETED', $2)`,
          [
            passenger.rider_id,
            `Your ride from ${ride.source} to ${ride.destination} on ${new Date(ride.ride_date).toLocaleDateString()} has been completed. Please take a moment to rate your driver!`
          ]
        );
      }
    } catch (notifErr) {
      console.error('Failed to insert notifications (non-fatal):', notifErr);
    }

    await client.query('COMMIT');

    // 7. Fire-and-forget: send completion emails to all passengers
    setImmediate(async () => {
      try {
        const { sendRideCompletionEmail } = await import('../services/emailService');
        for (const passenger of passengersResult.rows) {
          await sendRideCompletionEmail(passenger.email, {
            name: passenger.full_name,
            source: ride.source,
            destination: ride.destination,
            date: ride.ride_date,
            driverName: ride.driver_name,
          });
        }
      } catch (err) {
        console.error('Failed to send ride completion emails:', err);
      }
    });

    res.json({
      message: 'Ride completed successfully',
      completedPassengers: passengersResult.rows.map(p => p.rider_id),
      rideId: Number(id),
    });

  } catch (error) {
    await client.query('ROLLBACK');
    console.error('Error completing ride:', error);
    res.status(500).json({ message: 'Internal server error' });
  } finally {
    client.release();
  }
}

export async function cancelRide(req: AuthedRequest, res: Response) {
  const userId = req.user?.userId;
  if (!userId) {
    return res.status(401).json({ message: 'Unauthorized' });
  }

  const { id } = req.params;
  const { reason } = req.body;

  const client = await pool.connect();
  try {
    await client.query('BEGIN');

    // 1. Verify ride exists and belongs to user
    const rideResult = await client.query(
      'SELECT driver_id, status FROM rides WHERE ride_id = $1 FOR UPDATE',
      [id]
    );

    if (rideResult.rowCount === 0) {
      await client.query('ROLLBACK');
      return res.status(404).json({ message: 'Ride not found' });
    }

    const ride = rideResult.rows[0];

    if (ride.driver_id !== userId) {
      await client.query('ROLLBACK');
      return res.status(403).json({ message: 'Only the driver can cancel this ride' });
    }

    if (ride.status === 'CANCELLED') {
      await client.query('ROLLBACK');
      return res.status(400).json({ message: 'Ride is already cancelled' });
    }

    if (ride.status === 'COMPLETED') {
      await client.query('ROLLBACK');
      return res.status(400).json({ message: 'Cannot cancel a completed ride' });
    }

    // 2. Update ride status
    await client.query(
      `UPDATE rides SET 
        status = 'CANCELLED', 
        cancelled_by = $1, 
        cancellation_reason = $2, 
        cancelled_at = CURRENT_TIMESTAMP 
       WHERE ride_id = $3`,
      [userId, reason || 'No reason provided', id]
    );

    // 3. Update all active bookings to CANCELLED
    await client.query(
      "UPDATE bookings SET booking_status = 'CANCELLED' WHERE ride_id = $1 AND booking_status IN ('PENDING', 'CONFIRMED')",
      [id]
    );

    await client.query('COMMIT');

    // 4. Notify all affected passengers (asynchronous)
    (async () => {
      try {
        const passengersResult = await pool.query(
          `SELECT u.email, u.full_name, u.user_id, r.source, r.destination, r.ride_date
           FROM bookings b
           JOIN users u ON b.rider_id = u.user_id
           JOIN rides r ON b.ride_id = r.ride_id
           WHERE b.ride_id = $1 AND b.booking_status = 'CANCELLED'`,
          [id]
        );

        for (const passenger of passengersResult.rows) {
          // Send Email
          await sendCancellationEmail(passenger.email, {
            name: passenger.full_name,
            type: 'RIDE',
            details: `${passenger.source} to ${passenger.destination}`,
            date: passenger.ride_date,
            reason: reason || 'No reason provided'
          });

          // In-app Notification
          await pool.query(
            `INSERT INTO notifications (user_id, type, message)
             VALUES ($1, 'RIDE_CANCELLED', $2)`,
            [
              passenger.user_id,
              `Your ride from ${passenger.source} to ${passenger.destination} on ${new Date(passenger.ride_date).toLocaleDateString()} has been cancelled by the driver.`
            ]
          );
        }
      } catch (err) {
        console.error('Failed to send ride cancellation notifications:', err);
      }
    })();

    res.json({ message: 'Ride cancelled successfully' });
  } catch (error) {
    await client.query('ROLLBACK');
    console.error('Error cancelling ride:', error);
    res.status(500).json({ message: 'Internal server error' });
  } finally {
    client.release();
  }
}

export async function getTodayRides(req: any, res: Response) {
  try {
    const today = new Date().toISOString().split('T')[0];
    const result = await pool.query(
      `SELECT 
        r.*, 
        u.full_name as driver_name, 
        u.profile_photo as profile_image,
        u.phone as driver_phone,
        u.created_at as driver_join_date,
        (SELECT COALESCE(AVG(rating), 0) FROM ratings WHERE rated_user = u.user_id) as driver_rating,
        (SELECT COUNT(*) FROM ratings WHERE rated_user = u.user_id) as driver_rating_count,
        v.model as vehicle_model
       FROM rides r
       JOIN users u ON r.driver_id = u.user_id
       JOIN vehicles v ON r.vehicle_id = v.vehicle_id
       WHERE r.ride_date = $1 AND r.status = 'ACTIVE'
       ORDER BY r.ride_time ASC`,
      [today]
    );
    res.json(result.rows);
  } catch (err) {
    console.error('Error fetching today rides:', err);
    res.status(500).json({ message: 'Internal server error' });
  }
}
export async function startRide(req: AuthedRequest, res: Response) {
  const userId = req.user?.userId;
  if (!userId) {
    return res.status(401).json({ message: 'Unauthorized' });
  }

  const { id } = req.params;

  const client = await pool.connect();
  try {
    await client.query('BEGIN');

    // 1. Verify that the requester is the driver of the ride
    const rideResult = await client.query(
      'SELECT r.*, u.full_name as driver_name FROM rides r JOIN users u ON r.driver_id = u.user_id WHERE r.ride_id = $1 FOR UPDATE',
      [id]
    );

    if (rideResult.rowCount === 0) {
      await client.query('ROLLBACK');
      return res.status(404).json({ message: 'Ride not found.' });
    }

    const ride = rideResult.rows[0];
    console.log(`[DEBUG_START_RIDE] userId: ${userId} (${typeof userId}), driver_id: ${ride.driver_id} (${typeof ride.driver_id})`);

    if (Number(ride.driver_id) !== Number(userId)) {
      console.log(`[DEBUG_START_RIDE] Authorization failed: ${ride.driver_id} !== ${userId}`);
      await client.query('ROLLBACK');
      return res.status(403).json({ message: 'Only the driver can start the ride.' });
    }

    // 2. Fetch all confirmed passengers
    const bookingsResult = await client.query(
      "SELECT rider_id FROM bookings WHERE ride_id = $1 AND booking_status = 'CONFIRMED'",
      [id]
    );

    // 3. Update ride status to 'STARTED'
    console.log(`[DEBUG_START_RIDE] Updating ride ${id} to STARTED`);
    await client.query(
      "UPDATE rides SET status = 'STARTED' WHERE ride_id = $1",
      [id]
    );

    // 4. Insert notifications for each passenger
    const passengers = bookingsResult.rows;
    for (const passenger of passengers) {
      await client.query(
        "INSERT INTO notifications (user_id, type, message) VALUES ($1, 'RIDE_STARTED', $2)",
        [
          passenger.rider_id,
          `Your driver ${ride.driver_name} has started the ride from ${ride.source} to ${ride.destination}. Track it live now!`
        ]
      );
    }

    await client.query('COMMIT');
    res.json({ message: 'Ride started and passengers notified.' });

  } catch (error) {
    await client.query('ROLLBACK');
    console.error('Error starting ride:', error);
    res.status(500).json({ message: 'Internal server error' });
  } finally {
    client.release();
  }
}
