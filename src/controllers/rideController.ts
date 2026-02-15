import type { Response } from 'express';
import type { AuthedRequest } from '../middleware/authMiddleware';
import { pool } from '../db/pool';

export async function createRide(req: AuthedRequest, res: Response) {
  const userId = req.user?.userId;

  if (!userId) {
    return res.status(401).json({ message: 'Unauthorized' });
  }

  try {
    const {
      source, destination, source_lat, source_lng, dest_lat, dest_lng,
      ride_date, ride_time, total_seats, base_price, route_polyline, stops,
      vehicle_id
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

      const rideInsertResult = await client.query(
        `INSERT INTO rides (
          driver_id, vehicle_id, source, destination, 
          source_lat, source_lng, dest_lat, dest_lng, 
          ride_date, ride_time, total_seats, available_seats, 
          base_price, route_polyline, status, total_stops
        ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $11, $12, $13, 'ACTIVE', $14)
        RETURNING ride_id`,
        [
          userId, finalVehicleId, source, destination,
          source_lat, source_lng, dest_lat, dest_lng,
          ride_date, ride_time, total_seats, base_price, route_polyline,
          stops ? stops.length : 0
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
    ride_date, seats_needed
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

    // Proximity search logic:
    // We look for rides where:
    // 1. Starting point is within 10km of s_lat, s_lng
    // AND
    // 2. Ending point is within 10km of d_lat, d_lng
    // OR
    // 3. Any intermediate stop matches either of the above... (simplified for now but we'll include it)

    const ridesResult = await pool.query(
      `SELECT 
        r.*, 
        u.full_name as driver_name, 
        u.profile_image,
        v.make as vehicle_make, 
        v.model as vehicle_model, 
        v.license_plate,
        (6371 * acos(cos(radians($1)) * cos(radians(r.source_lat)) * cos(radians(r.source_lng) - radians($2)) + sin(radians($1)) * sin(radians(r.source_lat)))) AS source_distance,
        (6371 * acos(cos(radians($3)) * cos(radians(r.dest_lat)) * cos(radians(r.dest_lng) - radians($4)) + sin(radians($3)) * sin(radians(r.dest_lat)))) AS dest_distance
      FROM rides r
      JOIN users u ON r.driver_id = u.user_id
      JOIN vehicles v ON r.vehicle_id = v.vehicle_id
      WHERE r.status = 'ACTIVE'
        AND r.available_seats >= $5
        AND ($6::date IS NULL OR r.ride_date = $6)
        AND (
          -- Close to source and destination
          ((6371 * acos(cos(radians($1)) * cos(radians(r.source_lat)) * cos(radians(r.source_lng) - radians($2)) + sin(radians($1)) * sin(radians(r.source_lat)))) < 10
           AND (6371 * acos(cos(radians($3)) * cos(radians(r.dest_lat)) * cos(radians(r.dest_lng) - radians($4)) + sin(radians($3)) * sin(radians(r.dest_lat)))) < 10)
          
          OR EXISTS (
            SELECT 1 FROM stops s 
            WHERE s.parent_id = r.ride_id 
              AND s.parent_type = 'RIDE'
              AND (6371 * acos(cos(radians($1)) * cos(radians(s.latitude)) * cos(radians(s.longitude) - radians($2)) + sin(radians($1)) * sin(radians(s.latitude)))) < 10
          )
        )
      ORDER BY (source_distance + dest_distance) ASC`,
      [s_lat, s_lng, d_lat, d_lng, needed, ride_date || null]
    );

    // For each ride, also fetch its stops to show the full route
    const ridesWithStops = await Promise.all(ridesResult.rows.map(async (ride) => {
      const stopsResult = await pool.query(
        'SELECT * FROM stops WHERE parent_id = $1 AND parent_type = \'RIDE\' ORDER BY stop_order ASC',
        [ride.ride_id]
      );
      return { ...ride, stops: stopsResult.rows };
    }));

    res.json(ridesWithStops);
  } catch (error) {
    console.error('Error searching rides:', error);
    res.status(500).json({ message: 'Internal server error' });
  }
}

export async function getRideById(_req: AuthedRequest, res: Response) {
  res.status(501).json({ message: 'Not implemented: getRideById' });
}


