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
        const res = await pool.query("SELECT ride_id, status FROM rides WHERE ride_id = 17");
        if (res.rows.length > 0) {
            console.log(`RESULT_ID: ${res.rows[0].ride_id}`);
            console.log(`RESULT_STATUS: ${res.rows[0].status}`);
        } else {
            console.log('RESULT_NOT_FOUND');
        }

    } catch (err) {
        console.error('Error:', err);
    } finally {
        await pool.end();
    }
}

checkRide();
