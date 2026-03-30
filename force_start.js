const { Pool } = require('pg');
const fs = require('fs');
const path = require('path');

async function forceStartRide(rideId) {
    let raw = fs.readFileSync(path.resolve(__dirname, 'config.json'), 'utf8');
    raw = raw.replace(/^\uFEFF/, '').trimStart();
    const config = JSON.parse(raw);

    const pool = new Pool({
        connectionString: config.databaseUrl,
    });

    try {
        console.log(`--- FORCING RIDE ${rideId} TO STARTED ---`);
        const res = await pool.query("UPDATE rides SET status = 'STARTED' WHERE ride_id = $1 RETURNING *", [rideId]);
        console.log('Update result:', JSON.stringify(res.rows, null, 2));

    } catch (err) {
        console.error('Error:', err);
    } finally {
        await pool.end();
    }
}

forceStartRide(17);
