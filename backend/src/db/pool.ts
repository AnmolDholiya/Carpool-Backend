import { Pool } from 'pg';
import { getConfig } from '../config/config';

const config = getConfig();

export const pool = new Pool({
  connectionString: config.databaseUrl,
  ssl: config.databaseUrl.includes('localhost') || config.databaseUrl.includes('127.0.0.1')
    ? false
    : { rejectUnauthorized: false }
});


