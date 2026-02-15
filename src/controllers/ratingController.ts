import type { Request, Response } from 'express';

export async function createRating(_req: Request, res: Response) {
  res.status(501).json({ message: 'Not implemented: createRating' });
}


