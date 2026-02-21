const { Pool } = require('pg');
const fs = require('fs');
const path = require('path');

async function inspectConstraints() {
    let raw = fs.readFileSync(path.resolve(__dirname, 'config.json'), 'utf8');
    raw = raw.replace(/^\uFEFF/, '').trimStart();
    const config = JSON.parse(raw);

    const pool = new Pool({
        connectionString: config.databaseUrl,
    });

    try {
        console.log('--- RIDE 17 CURRENT STATE ---');
        const ride = await pool.query("SELECT * FROM rides WHERE ride_id = 17");
        console.log(JSON.stringify(ride.rows, null, 2));

        console.log('\n--- CHECK CONSTRAINTS ON RIDES TABLE ---');
        const constraints = await pool.query(`
            SELECT 
                conname as name, 
                pg_get_constraintdef(oid) as definition
            FROM pg_constraint 
            WHERE conrelid = 'rides'::regclass AND contype = 'c'
        `);
        console.log(JSON.stringify(constraints.rows, null, 2));

    } catch (err) {
        console.error('Error:', err);
    } finally {
        await pool.end();
    }
}

inspectConstraints();
