const { Pool } = require('pg');
const pool = new Pool({
    connectionString: "postgres://postgres:5634@localhost:5432/carpooling_db"
});

async function migrate() {
    try {
        console.log('Starting template migration...');

        await pool.query(`
            ALTER TABLE ride_template 
            ADD COLUMN IF NOT EXISTS source_lat DOUBLE PRECISION,
            ADD COLUMN IF NOT EXISTS source_lng DOUBLE PRECISION,
            ADD COLUMN IF NOT EXISTS dest_lat DOUBLE PRECISION,
            ADD COLUMN IF NOT EXISTS dest_lng DOUBLE PRECISION,
            ADD COLUMN IF NOT EXISTS ride_time TIME,
            ADD COLUMN IF NOT EXISTS vehicle_id INTEGER REFERENCES vehicles(vehicle_id) ON DELETE SET NULL,
            ADD COLUMN IF NOT EXISTS booking_type VARCHAR(10) DEFAULT 'INSTANT' CHECK (booking_type IN ('INSTANT', 'APPROVAL')),
            ADD COLUMN IF NOT EXISTS route_polyline TEXT;
        `);

        console.log('Updated ride_template table successfully.');
    } catch (err) {
        console.error('Migration failed:', err);
    } finally {
        await pool.end();
    }
}

migrate();
