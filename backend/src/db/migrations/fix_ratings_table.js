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
        console.log('Ensuring ratings table exists...');

        await client.query(`
            CREATE TABLE IF NOT EXISTS ratings (
                rating_id SERIAL PRIMARY KEY,
                ride_id INT NOT NULL REFERENCES rides(ride_id),
                rated_by INT NOT NULL REFERENCES users(user_id),
                rated_user INT NOT NULL REFERENCES users(user_id),
                rating INT NOT NULL CHECK (rating BETWEEN 1 AND 5),
                review TEXT,
                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                UNIQUE (ride_id, rated_by, rated_user)
            );
        `);

        console.log('ratings table ensured successfully!');
    } catch (err) {
        console.error('Migration failed:', err.message);
    } finally {
        client.release();
        await pool.end();
    }
}

migrate();
