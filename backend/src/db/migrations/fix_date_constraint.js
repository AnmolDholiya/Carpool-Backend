const { Pool } = require('pg');
const fs = require('fs');
const path = require('path');

function getConfig() {
    const configPath = path.resolve(process.cwd(), 'config.json');
    const raw = fs.readFileSync(configPath, 'utf8');
    return JSON.parse(raw.replace(/^\uFEFF/, '').trimStart());
}

const config = getConfig();
const pool = new Pool({ connectionString: config.databaseUrl });

async function migrate() {
    const client = await pool.connect();
    try {
        console.log('Dropping rides_ride_date_check constraint...');

        // Find all check constraints on rides that involve ride_date
        const result = await client.query(`
            SELECT conname 
            FROM pg_constraint 
            WHERE conrelid = 'rides'::regclass 
              AND contype = 'c' 
              AND conname LIKE '%ride_date%'
        `);

        if (result.rows.length === 0) {
            console.log('No ride_date constraint found - already removed or named differently.');
        }

        for (const row of result.rows) {
            await client.query(`ALTER TABLE rides DROP CONSTRAINT IF EXISTS "${row.conname}"`);
            console.log(`Dropped constraint: ${row.conname}`);
        }

        // Also drop by known name in case it's indexed differently
        await client.query(`ALTER TABLE rides DROP CONSTRAINT IF EXISTS rides_ride_date_check`);

        console.log('Done! Ride date constraint removed. Date validation is now frontend-only.');
    } catch (err) {
        console.error('Migration failed:', err.message);
    } finally {
        client.release();
        await pool.end();
    }
}

migrate();
