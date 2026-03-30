const { Pool } = require('pg');
const fs = require('fs');
const path = require('path');

async function fixConstraints() {
    let raw = fs.readFileSync(path.resolve(__dirname, 'config.json'), 'utf8');
    raw = raw.replace(/^\uFEFF/, '').trimStart();
    const config = JSON.parse(raw);

    const pool = new Pool({
        connectionString: config.databaseUrl,
    });

    try {
        console.log('--- FINDING STATUS CONSTRAINT ---');
        const constraints = await pool.query(`
            SELECT 
                conname as name, 
                pg_get_constraintdef(oid) as definition
            FROM pg_constraint 
            WHERE conrelid = 'rides'::regclass AND contype = 'c'
        `);

        let statusConstraintName = null;
        for (const c of constraints.rows) {
            console.log(`Constraint: ${c.name} -> ${c.definition}`);
            if (c.definition.includes('status')) {
                statusConstraintName = c.name;
            }
        }

        if (statusConstraintName) {
            console.log(`\n--- FIXING CONSTRAINT ${statusConstraintName} ---`);
            // Drop the old constraint
            await pool.query(`ALTER TABLE rides DROP CONSTRAINT ${statusConstraintName}`);
            // Add new constraint with 'STARTED'
            await pool.query(`
                ALTER TABLE rides 
                ADD CONSTRAINT rides_status_check 
                CHECK (status IN ('ACTIVE', 'COMPLETED', 'CANCELLED', 'STARTED'))
            `);
            console.log('Constraint updated successfully.');

            // Now try to force start ride 17
            console.log('\n--- RETRYING FORCE START FOR RIDE 17 ---');
            const res = await pool.query("UPDATE rides SET status = 'STARTED' WHERE ride_id = 17 RETURNING status");
            console.log('Update success! New status:', res.rows[0].status);
        } else {
            console.log('Status constraint not found.');
        }

    } catch (err) {
        console.error('Error:', err);
    } finally {
        await pool.end();
    }
}

fixConstraints();
