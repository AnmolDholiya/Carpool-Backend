// migrate_schema.js
// Run this ONCE on your Render database to apply missing schema columns
// Usage: DATABASE_URL=<your_render_db_url> node migrate_schema.js

const { Pool } = require('pg');

const pool = new Pool({
    connectionString: process.env.DATABASE_URL,
    ssl: { rejectUnauthorized: false },
});

async function migrate() {
    const client = await pool.connect();
    try {
        console.log('Starting schema migration...');

        // 1. Add email_verified to users (missing from schema.sql)
        await client.query(`
      ALTER TABLE users
      ADD COLUMN IF NOT EXISTS email_verified BOOLEAN DEFAULT FALSE;
    `);
        console.log('✅ Added email_verified column');

        // 2. Allow NULL phone (Google users don't have a phone)
        await client.query(`
      ALTER TABLE users
      ALTER COLUMN phone DROP NOT NULL;
    `);
        console.log('✅ Made phone column nullable (for Google OAuth users)');

        // 3. Allow NULL password (Google users don't have a password)
        await client.query(`
      ALTER TABLE users
      ALTER COLUMN password DROP NOT NULL;
    `);
        console.log('✅ Made password column nullable (for Google OAuth users)');

        // 4. Ensure notifications table exists
        await client.query(`
      CREATE TABLE IF NOT EXISTS notifications (
        notification_id SERIAL PRIMARY KEY,
        user_id INT NOT NULL REFERENCES users(user_id) ON DELETE CASCADE,
        type VARCHAR(50) NOT NULL,
        message TEXT NOT NULL,
        is_read BOOLEAN DEFAULT FALSE,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      );
    `);
        console.log('✅ Ensured notifications table exists');

        // 5. Ensure email_verifications table exists
        await client.query(`
      CREATE TABLE IF NOT EXISTS email_verifications (
        id SERIAL PRIMARY KEY,
        user_id INTEGER NOT NULL,
        otp VARCHAR(10) NOT NULL,
        used BOOLEAN DEFAULT FALSE,
        expires_at TIMESTAMP NOT NULL,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        CONSTRAINT fk_user FOREIGN KEY(user_id) REFERENCES users(user_id) ON DELETE CASCADE
      );
    `);
        console.log('✅ Ensured email_verifications table exists');

        // 6. Add booking_type to rides if missing
        await client.query(`
      ALTER TABLE rides
      ADD COLUMN IF NOT EXISTS booking_type VARCHAR(10) DEFAULT 'INSTANT'
        CHECK (booking_type IN ('INSTANT', 'APPROVAL'));
    `);
        console.log('✅ Ensured booking_type column exists on rides');

        // 7. Update bookings status constraint to include PENDING, REJECTED
        await client.query(`
      ALTER TABLE bookings DROP CONSTRAINT IF EXISTS bookings_booking_status_check;
    `);
        await client.query(`
      ALTER TABLE bookings
      ADD CONSTRAINT bookings_booking_status_check
        CHECK (booking_status IN ('CONFIRMED', 'CANCELLED', 'COMPLETED', 'PENDING', 'REJECTED'));
    `);
        console.log('✅ Updated booking_status constraint');

        console.log('\n🎉 Migration completed successfully!');
    } catch (err) {
        console.error('❌ Migration failed:', err.message);
        process.exit(1);
    } finally {
        client.release();
        await pool.end();
    }
}

migrate();
