const { Pool } = require('pg');
const fs = require('fs');
const path = require('path');

try {
    let raw = fs.readFileSync(path.resolve(__dirname, 'config.json'), 'utf8');
    raw = raw.replace(/^\uFEFF/, '').trimStart();
    const config = JSON.parse(raw);

    const pool = new Pool({
        connectionString: config.databaseUrl,
    });

    async function check() {
        try {
            const query = `SELECT * FROM (
        SELECT 
          r.*, 
          u.full_name as driver_name, 
          u.profile_photo as profile_image,
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
        (source_distance < 10 AND dest_distance < 10)
        OR EXISTS (
          SELECT 1 FROM stops s 
          WHERE s.parent_id = sub.ride_id 
            AND s.parent_type = 'RIDE'
            AND (6371 * acos(LEAST(GREATEST(cos(radians($1)) * cos(radians(s.latitude)) * cos(radians(s.longitude) - radians($2)) + sin(radians($1)) * sin(radians(s.latitude)), -1), 1))) < 10
        )
      )
      ORDER BY (source_distance + dest_distance) ASC`;

            const res = await pool.query(query, [21.1702, 72.8311, 22.5997, 72.8205, 1, null]);
            console.log('--- SUCCESS ---');
            console.log('Rows found:', res.rows.length);
        } catch (err) {
            console.log('--- ERROR ---');
            console.log(err.message);
            if (err.hint) console.log('HINT:', err.hint);
        } finally {
            await pool.end();
        }
    }

    check();
} catch (err) {
    console.log('INIT_ERROR', err.message);
}
