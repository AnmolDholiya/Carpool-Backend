const { Pool } = require('pg');
const fs = require('fs');
const path = require('path');

async function checkRide() {
    let raw = fs.readFileSync(path.resolve(__dirname, 'config.json'), 'utf8');
    raw = raw.replace(/^\uFEFF/, '').trimStart();
    const config = JSON.parse(raw);

    const pool = new Pool({
        connectionString: config.databaseUrl,
    });

    try {
        console.log('--- SCANNING RIDES ---');
        const rides = await pool.query(`
            SELECT ride_id, source, destination, status, source_lat, source_lng, dest_lat, dest_lng, driver_id 
            FROM rides 
            WHERE source ILIKE '%Surat%' OR status = 'STARTED'
            ORDER BY created_at DESC
        `);
        console.log(JSON.stringify(rides.rows, null, 2));

    } catch (err) {
        console.error('Error:', err);
    } finally {
        await pool.end();
    }
}

checkRide();
