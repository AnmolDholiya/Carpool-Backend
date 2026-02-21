const { Pool } = require('pg');
const fs = require('fs');
const path = require('path');
const { createWorker } = require('tesseract.js');

function getConfig() {
    const configPath = path.resolve(process.cwd(), 'config.json');
    const raw = fs.readFileSync(configPath, 'utf8');
    return JSON.parse(raw.replace(/^\uFEFF/, '').trimStart());
}

const config = getConfig();
const pool = new Pool({ connectionString: config.databaseUrl });

const STUDENT_ID_REGEX = /D?\d{2}[A-Z]{2,4}\d{3}/gi;

async function main() {
    const client = await pool.connect();
    try {
        const result = await client.query(
            `SELECT user_id, email, id_card_photo, id_card_status FROM users WHERE id_card_photo IS NOT NULL ORDER BY created_at DESC`
        );

        if (result.rows.length === 0) {
            console.log('No users have id_card_photo stored.');
            return;
        }

        console.log('\n--- Running OCR with Updated Logic ---');

        for (const user of result.rows) {
            if (user.id_card_status === 'VERIFIED') {
                console.log(`[${user.user_id}] Already VERIFIED, skipping.`);
                continue;
            }

            const domain = user.email.split('@')[1]?.toLowerCase();
            const emailPrefix = user.email.split('@')[0]?.toLowerCase();

            if (!domain?.includes('charusat')) {
                console.log(`[${user.user_id}] Not a Charusat email, skipping.`);
                continue;
            }

            if (domain === 'charusat.ac.in') {
                await client.query(`UPDATE users SET id_card_status='PENDING' WHERE user_id=$1`, [user.user_id]);
                console.log(`[${user.user_id}] ac.in → set PENDING`);
                continue;
            }

            if (domain === 'charusat.edu.in') {
                const absPath = path.resolve(process.cwd(), user.id_card_photo);
                console.log(`[${user.user_id}] OCR Path: ${absPath}`);

                if (!fs.existsSync(absPath)) {
                    console.log(`  ❌ File not found!`);
                    continue;
                }

                const worker = await createWorker('eng');
                try {
                    const { data: { text } } = await worker.recognize(absPath);
                    const rawText = text.toUpperCase();

                    const upperPrefix = emailPrefix.toUpperCase();
                    const bare = upperPrefix.startsWith('D') ? upperPrefix.slice(1) : upperPrefix;
                    const expectedIds = [bare, `D${bare}`];

                    const foundIds = (text.match(STUDENT_ID_REGEX) || []).map(m => m.toUpperCase());

                    const matched = foundIds.some(id => expectedIds.includes(id)) ||
                        expectedIds.some(id => rawText.includes(id));

                    console.log(`  Expected: ${JSON.stringify(expectedIds)}`);
                    console.log(`  Found via regex: ${JSON.stringify(foundIds)}`);
                    console.log(`  Match found: ${matched}`);

                    if (matched) {
                        await client.query(`UPDATE users SET id_card_status='VERIFIED', id_card_verified_at=NOW() WHERE user_id=$1`, [user.user_id]);
                        console.log(`  ✅ VERIFIED`);
                    } else {
                        await client.query(`UPDATE users SET id_card_status='PENDING' WHERE user_id=$1`, [user.user_id]);
                        console.log(`  ⏳ PENDING (mismatch)`);
                    }
                } finally {
                    await worker.terminate();
                }
            }
        }
    } finally {
        client.release();
        await pool.end();
    }
}

main().catch(console.error);
