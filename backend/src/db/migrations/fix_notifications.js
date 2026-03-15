const { Pool } = require('pg');
const fs = require('fs');
const path = require('path');

function getConfig() {
    const configPath = path.resolve(process.cwd(), 'config.json');
    const raw = fs.readFileSync(configPath, 'utf8');
    return JSON.parse(raw.replace(/^\uFEFF/, '').trimStart());
}

const config = getConfig();

const pool = new Pool({
    connectionString: config.databaseUrl
});

async function migrate() {
    const client = await pool.connect();
    try {
        console.log('Starting notifications migration...');

        await client.query(`
            CREATE TABLE IF NOT EXISTS notifications (
                notification_id SERIAL PRIMARY KEY,
                user_id INT NOT NULL REFERENCES users(user_id) ON DELETE CASCADE,
                type VARCHAR(50) NOT NULL,
                message TEXT NOT NULL,
                is_read BOOLEAN DEFAULT FALSE,
                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
            );
        `);

        console.log('notifications table ensured successfully!');
    } catch (err) {
        console.error('Migration failed:', err.message);
    } finally {
        client.release();
        await pool.end();
    }
}

migrate();
