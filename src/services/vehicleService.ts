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

export async function getUserVehicles(userId: number) {
    const result = await pool.query(
        `SELECT * FROM vehicles WHERE user_id = $1 ORDER BY created_at DESC`,
        [userId]
    );
    return result.rows;
}

export async function deleteVehicle(userId: number, vehicleId: number) {
    const result = await pool.query(
        `DELETE FROM vehicles WHERE vehicle_id = $1 AND user_id = $2 RETURNING *`,
        [vehicleId, userId]
    );
    return result.rowCount !== 0;
}


