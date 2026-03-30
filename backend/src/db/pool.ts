import { Pool } from 'pg';
import { getConfig } from '../config/config';

const config = getConfig();

// Global bypass for self-signed certificates (Standard fix for specific hosting environments)
process.env.NODE_TLS_REJECT_UNAUTHORIZED = '0';

console.log('--- DB POOL INIT (VERSION 1.2) ---');
if (config.databaseUrl) {
  // Only mask the password part between the colon and the @ symbol
  const maskedUrl = config.databaseUrl.replace(/(?<=:)[^:@]+(?=@)/, '****');
  console.log(`[DB] Using Connection String: ${maskedUrl}`);
}

export const pool = new Pool({
  connectionString: config.databaseUrl,
  ssl: {
    rejectUnauthorized: false
  }
});

pool.on('connect', () => {
  console.log('[DB] New client connected to the pool');
});

pool.on('error', (err) => {
  console.error('[DB] Unexpected error on idle client', err);
});


