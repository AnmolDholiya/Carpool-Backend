const { Pool } = require('pg');
const fs = require('fs');
const path = require('path');

function getConfig() {
    const configPath = path.resolve(process.cwd(), 'config.json');
    const raw = fs.readFileSync(configPath, 'utf8');
    return JSON.parse(raw.replace(/^\uFEFF/, '').trimStart());
}

const pool = new Pool({ connectionString: getConfig().databaseUrl });

async function main() {
    const { rows } = await pool.query(
        `SELECT user_id, email, id_card_photo, id_card_status FROM users WHERE id_card_photo IS NOT NULL ORDER BY created_at DESC`
    );

    console.log('user_id | email | id_card_photo | id_card_status');
    rows.forEach(r => {
        const prefix = r.email.split('@')[0].toUpperCase();
        const bare = prefix.startsWith('D') ? prefix.slice(1) : prefix;
        console.log(`${r.user_id} | ${r.email} | ${r.id_card_photo} | ${r.id_card_status}`);
        console.log(`   email_prefix: "${prefix}" | bare: "${bare}" | expected IDs: ["${bare}", "D${bare}"]`);
    });

    await pool.end();
}
main().catch(console.error);
