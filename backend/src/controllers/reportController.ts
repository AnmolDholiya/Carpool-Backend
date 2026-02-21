import type { Request, Response } from 'express';

export async function createReport(_req: Request, res: Response) {
  res.status(501).json({ message: 'Not implemented: createReport' });
}


