const { Pool } = require('pg');
const fs = require('fs');
const path = require('path');

async function runMigration() {
    let raw = fs.readFileSync(path.resolve(__dirname, 'config.json'), 'utf8');
    raw = raw.replace(/^\uFEFF/, '').trimStart();
    const config = JSON.parse(raw);

    const pool = new Pool({
        connectionString: config.databaseUrl,
    });

    try {
        console.log('Starting migration...');

        // Add missing columns to rides table
        await pool.query(`
      ALTER TABLE rides 
      ADD COLUMN IF NOT EXISTS source_lat NUMERIC(10,6),
      ADD COLUMN IF NOT EXISTS source_lng NUMERIC(10,6),
      ADD COLUMN IF NOT EXISTS dest_lat NUMERIC(10,6),
      ADD COLUMN IF NOT EXISTS dest_lng NUMERIC(10,6),
      ADD COLUMN IF NOT EXISTS route_polyline TEXT
    `);

        console.log('Migration completed successfully: Added missing columns to "rides" table.');
    } catch (err) {
        console.error('Migration failed:', err);
    } finally {
        await pool.end();
    }
}

runMigration();
