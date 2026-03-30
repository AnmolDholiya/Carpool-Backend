const { Pool } = require('pg');
const pool = new Pool({
    connectionString: "postgres://postgres:5634@localhost:5432/carpooling_db"
});

async function migrate() {
    try {

        console.log('Starting migration...');

        // Add booking_type to rides
        await pool.query(`
      ALTER TABLE rides 
      ADD COLUMN IF NOT EXISTS booking_type VARCHAR(10) DEFAULT 'INSTANT' 
      CHECK (booking_type IN ('INSTANT', 'APPROVAL'));
    `);
        console.log('Added booking_type to rides.');

        // Update booking_status constraint
        // First drop the old constraint if we can find it, or just try to add new values
        // In Postgres, it's easier to drop and recreate or just alter if it's a domain/type, 
        // but here it's a CHECK constraint.

        await pool.query(`
      ALTER TABLE bookings 
      DROP CONSTRAINT IF EXISTS bookings_booking_status_check;
    `);

        await pool.query(`
      ALTER TABLE bookings 
      ADD CONSTRAINT bookings_booking_status_check 
      CHECK (booking_status IN ('CONFIRMED', 'CANCELLED', 'COMPLETED', 'PENDING', 'REJECTED'));
    `);
        console.log('Updated booking_status constraint.');

        await pool.query(`
      CREATE TABLE IF NOT EXISTS notifications (
        notification_id SERIAL PRIMARY KEY,
        user_id INT NOT NULL REFERENCES users(user_id) ON DELETE CASCADE,
        type VARCHAR(50) NOT NULL,
        message TEXT NOT NULL,
        is_read BOOLEAN DEFAULT FALSE,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      );
    `);
        console.log('Created notifications table.');

        console.log('Migration completed successfully.');
    } catch (err) {
        console.error('Migration failed:', err);
    } finally {
        await pool.end();
    }
}

migrate();
