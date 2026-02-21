const { Pool } = require('pg');
const fs = require('fs');
const path = require('path');

function getConfig() {
    const configPath = path.resolve(process.cwd(), 'config.json');
    const raw = fs.readFileSync(configPath, 'utf8');
    return JSON.parse(raw.replace(/^\uFEFF/, '').trimStart());
}

const config = getConfig();

const pool = new Pool({
    connectionString: config.databaseUrl
});

async function migrate() {
    const client = await pool.connect();
    try {
        console.log('Starting migration...');
        await client.query('BEGIN');

        // Add missing columns to rides table (already done but safe to repeat)
        await client.query(`
      ALTER TABLE rides 
      ADD COLUMN IF NOT EXISTS source_lat DOUBLE PRECISION,
      ADD COLUMN IF NOT EXISTS source_lng DOUBLE PRECISION,
      ADD COLUMN IF NOT EXISTS dest_lat DOUBLE PRECISION,
      ADD COLUMN IF NOT EXISTS dest_lng DOUBLE PRECISION,
      ADD COLUMN IF NOT EXISTS route_polyline TEXT;
    `);

        // Increase address column lengths
        console.log('Increasing address column lengths...');
        await client.query(`ALTER TABLE rides ALTER COLUMN source TYPE TEXT;`);
        await client.query(`ALTER TABLE rides ALTER COLUMN destination TYPE TEXT;`);
        await client.query(`ALTER TABLE stops ALTER COLUMN city_name TYPE TEXT;`);
        await client.query(`ALTER TABLE ride_template ALTER COLUMN source TYPE TEXT;`);
        await client.query(`ALTER TABLE ride_template ALTER COLUMN destination TYPE TEXT;`);

        // Update status constraint to include 'STARTED'
        const constraintResult = await client.query(`
      SELECT conname 
      FROM pg_constraint 
      WHERE conrelid = 'rides'::regclass AND contype = 'c' AND conname LIKE '%status%';
    `);

        for (const row of constraintResult.rows) {
            await client.query(`ALTER TABLE rides DROP CONSTRAINT IF EXISTS ${row.conname}`);
        }

        await client.query(`
      ALTER TABLE rides 
      ADD CONSTRAINT rides_status_check 
      CHECK (status IN ('ACTIVE', 'CANCELLED', 'STARTED', 'COMPLETED'));
    `);

        await client.query('COMMIT');
        console.log('Migration completed successfully!');
    } catch (err) {
        if (client) await client.query('ROLLBACK');
        console.error('Migration failed:', err);
    } finally {
        if (client) client.release();
        await pool.end();
    }
}

migrate();
