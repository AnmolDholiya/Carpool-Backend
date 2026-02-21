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

async function run() {
    const client = await pool.connect();
    try {
        // Show all users with their id_card_photo and id_card_status
        const result = await client.query(
            `SELECT user_id, email, id_card_photo, id_card_status FROM users ORDER BY created_at DESC LIMIT 20`
        );
        console.log('\n--- User ID Card Status ---');
        result.rows.forEach(u => {
            console.log(`[${u.user_id}] ${u.email} | photo: ${u.id_card_photo || 'NONE'} | status: ${u.id_card_status || 'NULL'}`);
        });
        console.log('---------------------------\n');
        console.log('To re-trigger OCR for a user, run:');
        console.log('  node src/db/migrations/retrigger_ocr.js <user_id>');
    } finally {
        client.release();
        await pool.end();
    }
}

run().catch(console.error);
