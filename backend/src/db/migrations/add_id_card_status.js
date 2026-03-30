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
        console.log('Adding id_card_status columns to users table...');
        await client.query(`
            ALTER TABLE users
            ADD COLUMN IF NOT EXISTS id_card_status VARCHAR(15)
                CHECK (id_card_status IN ('PENDING', 'VERIFIED', 'REJECTED'));
        `);
        await client.query(`
            ALTER TABLE users
            ADD COLUMN IF NOT EXISTS id_card_verified_at TIMESTAMP;
        `);
        console.log('id_card_status and id_card_verified_at columns added!');
    } catch (err) {
        console.error('Migration failed:', err.message);
    } finally {
        client.release();
        await pool.end();
    }
}

migrate();
