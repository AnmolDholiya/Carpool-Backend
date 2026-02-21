import { Pool } from 'pg';
import { getConfig } from '../config/config';

const config = getConfig();

export const pool = new Pool({
  connectionString: config.databaseUrl,
});


