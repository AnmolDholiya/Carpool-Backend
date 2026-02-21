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
        console.log('Adding id_card_photo column to users table...');
        await client.query(`
            ALTER TABLE users
            ADD COLUMN IF NOT EXISTS id_card_photo TEXT;
        `);
        console.log('id_card_photo column added successfully!');
    } catch (err) {
        console.error('Migration failed:', err.message);
    } finally {
        client.release();
        await pool.end();
    }
}

migrate();
