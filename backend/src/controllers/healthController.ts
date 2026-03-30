import type { Request, Response } from 'express';
import { pool } from '../db/pool';

export async function health(_req: Request, res: Response) {
  await pool.query('SELECT 1');
  res.json({ status: 'ok' });
}


