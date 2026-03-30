import { pool } from '../db/pool';

export async function createVehicle(userId: number, input: {
    vehicle_number: string;
    model: string;
    seats: number;
}) {
    const result = await pool.query(
        `INSERT INTO vehicles (user_id, vehicle_number, model, seats)
     VALUES ($1, $2, $3, $4)
     RETURNING *`,
        [userId, input.vehicle_number, input.model, input.seats]
    );
    return result.rows[0];
}

export async function getUserVehicles(userId: number, rideDate?: string, rideTime?: string) {
    let query = `SELECT * FROM vehicles v WHERE user_id = $1`;
    const params: any[] = [userId];

    if (rideDate && rideTime) {
        query += ` AND NOT EXISTS (
            SELECT 1 FROM rides r 
            WHERE r.vehicle_id = v.vehicle_id 
              AND r.status IN ('ACTIVE', 'STARTED')
              AND ABS(EXTRACT(EPOCH FROM ((r.ride_date + r.ride_time) - ($2::date + $3::time)))) < 14400
        )`;
        params.push(rideDate, rideTime);
    }

    query += ` ORDER BY created_at DESC`;

    const result = await pool.query(query, params);
    return result.rows;
}

export async function deleteVehicle(userId: number, vehicleId: number) {
    const result = await pool.query(
        `DELETE FROM vehicles WHERE vehicle_id = $1 AND user_id = $2 RETURNING *`,
        [vehicleId, userId]
    );
    return result.rowCount !== 0;
}


