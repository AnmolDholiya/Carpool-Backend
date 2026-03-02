/**
 * Migration: Fix email_verifications table
 * Error: column "otp" of relation "email_verifications" does not exist
 *
 * Run with: node fix_email_verifications.js
 */

const { Pool } = require('pg');
const fs = require('fs');
const path = require('path');

// Load config
function getConfig() {
    if (process.env.DATABASE_URL) {
        return { connectionString: process.env.DATABASE_URL, ssl: { rejectUnauthorized: false } };
    }
    const raw = fs.readFileSync(path.resolve(__dirname, 'config.json'), 'utf8');
    const cfg = JSON.parse(raw.replace(/^\uFEFF/, ''));
    return { connectionString: cfg.databaseUrl };
}

const pool = new Pool(getConfig());

async function run() {
    const client = await pool.connect();
    try {
        console.log('Checking email_verifications table...');

        // Check existing columns
        const colCheck = await client.query(`
      SELECT column_name FROM information_schema.columns
      WHERE table_name = 'email_verifications'
    `);
        const existingCols = colCheck.rows.map(r => r.column_name);
        console.log('Existing columns:', existingCols);

        if (existingCols.length === 0) {
            // Table doesn't exist at all — create it
            console.log('Table does not exist. Creating...');
            await client.query(`
        CREATE TABLE email_verifications (
          id SERIAL PRIMARY KEY,
          user_id INTEGER NOT NULL,
          otp VARCHAR(10) NOT NULL,
          used BOOLEAN DEFAULT FALSE,
          expires_at TIMESTAMP NOT NULL,
          created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
          CONSTRAINT fk_user FOREIGN KEY(user_id)
            REFERENCES users(user_id) ON DELETE CASCADE
        )
      `);
            console.log('✅ Table created successfully.');
        } else {
            // Table exists — add missing columns
            if (!existingCols.includes('otp')) {
                console.log('Adding missing column: otp');
                await client.query(`ALTER TABLE email_verifications ADD COLUMN otp VARCHAR(10) NOT NULL DEFAULT '000000'`);
                console.log('✅ otp column added.');
            }
            if (!existingCols.includes('used')) {
                console.log('Adding missing column: used');
                await client.query(`ALTER TABLE email_verifications ADD COLUMN used BOOLEAN DEFAULT FALSE`);
                console.log('✅ used column added.');
            }
            if (!existingCols.includes('expires_at')) {
                console.log('Adding missing column: expires_at');
                await client.query(`ALTER TABLE email_verifications ADD COLUMN expires_at TIMESTAMP NOT NULL DEFAULT NOW() + INTERVAL '10 minutes'`);
                console.log('✅ expires_at column added.');
            }
            if (!existingCols.includes('created_at')) {
                console.log('Adding missing column: created_at');
                await client.query(`ALTER TABLE email_verifications ADD COLUMN created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP`);
                console.log('✅ created_at column added.');
            }
            console.log('✅ All missing columns added.');
        }

        // Verify final state
        const verify = await client.query(`
      SELECT column_name, data_type FROM information_schema.columns
      WHERE table_name = 'email_verifications'
      ORDER BY ordinal_position
    `);
        console.log('\nFinal table columns:');
        verify.rows.forEach(r => console.log(`  - ${r.column_name} (${r.data_type})`));

    } catch (err) {
        console.error('Migration failed:', err);
        process.exit(1);
    } finally {
        client.release();
        await pool.end();
    }
}

run();
