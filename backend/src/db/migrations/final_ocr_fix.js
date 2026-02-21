const { Pool } = require('pg');
const fs = require('fs');
const path = require('path');
const { createWorker } = require('tesseract.js');

function getConfig() {
    const configPath = path.resolve(process.cwd(), 'config.json');
    const raw = fs.readFileSync(configPath, 'utf8');
    return JSON.parse(raw.replace(/^\uFEFF/, '').trimStart());
}

const pool = new Pool({ connectionString: getConfig().databaseUrl });

async function main() {
    const client = await pool.connect();
    try {
        const result = await client.query(
            `SELECT user_id, email, id_card_photo FROM users WHERE id_card_photo IS NOT NULL`
        );

        for (const user of result.rows) {
            console.log(`\n=== Processing User ${user.user_id} (${user.email}) ===`);
            const absPath = path.resolve(process.cwd(), user.id_card_photo);
            if (!fs.existsSync(absPath)) {
                console.log('File not found.');
                continue;
            }

            const worker = await createWorker('eng');
            const { data: { text } } = await worker.recognize(absPath);
            await worker.terminate();

            const rawText = text.toUpperCase();
            console.log('RAW TEXT START:');
            console.log(text);
            console.log('RAW TEXT END.');

            const prefix = user.email.split('@')[0].toUpperCase();
            const bare = prefix.startsWith('D') ? prefix.slice(1) : prefix;
            const possibilities = [bare, `D${bare}`];

            // Robust check: replace common OCR misreads in raw text
            const normalizedText = rawText
                .replace(/O/g, '0')
                .replace(/I/g, '1')
                .replace(/\|/g, '1')
                .replace(/S/g, '5');

            const normalizedPossibilities = possibilities.map(p =>
                p.replace(/O/g, '0').replace(/I/g, '1').replace(/S/g, '5')
            );

            console.log(`Possibilities: ${JSON.stringify(possibilities)}`);
            console.log(`Normalized Possibilities: ${JSON.stringify(normalizedPossibilities)}`);

            let matched = possibilities.some(p => rawText.includes(p));
            if (!matched) {
                matched = normalizedPossibilities.some(p => normalizedText.includes(p));
                if (matched) console.log('Matched via normalization!');
            }

            if (matched) {
                await client.query(`UPDATE users SET id_card_status='VERIFIED', id_card_verified_at=NOW() WHERE user_id=$1`, [user.user_id]);
                console.log('✅ VERIFIED');
            } else {
                await client.query(`UPDATE users SET id_card_status='PENDING' WHERE user_id=$1`, [user.user_id]);
                console.log('⏳ PENDING (mismatch)');
            }
        }
    } finally {
        client.release();
        await pool.end();
    }
}
main().catch(console.error);
