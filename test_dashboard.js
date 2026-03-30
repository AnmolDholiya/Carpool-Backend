const axios = require('axios');
const fs = require('fs');

async function testDashboard() {
    // We don't have the token easily, but we can check the DB directly for user 37's dashboard data
    const { Pool } = require('pg');
    const path = require('path');
    let raw = fs.readFileSync(path.resolve(__dirname, 'config.json'), 'utf8');
    raw = raw.replace(/^\uFEFF/, '').trimStart();
    const config = JSON.parse(raw);
    const pool = new Pool({ connectionString: config.databaseUrl });

    try {
        const userId = 37; // Assuming this is the user from the screenshot (driver of ride 17)

        const upcomingRidesDriverResult = await pool.query(
            `SELECT r.*, v.model as vehicle_model, v.vehicle_number 
           FROM rides r 
           JOIN vehicles v ON r.vehicle_id = v.vehicle_id
           WHERE r.driver_id = $1 AND r.ride_date >= CURRENT_DATE AND r.status IN ('ACTIVE', 'STARTED')
           ORDER BY r.ride_date ASC, r.ride_time ASC LIMIT 5`,
            [userId]
        );

        console.log('Upcoming Rides for User 37:');
        upcomingRidesDriverResult.rows.forEach(r => {
            console.log(`ID: ${r.ride_id}, Status: ${r.status}, Source: ${r.source}`);
        });

    } catch (err) {
        console.error(err);
    } finally {
        await pool.end();
    }
}

testDashboard();
