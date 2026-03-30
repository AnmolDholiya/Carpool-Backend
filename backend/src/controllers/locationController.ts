import type { Request, Response } from 'express';

export async function addLocationPoint(_req: Request, res: Response) {
  res.status(501).json({ message: 'Not implemented: addLocationPoint' });
}

export async function listLocationPoints(_req: Request, res: Response) {
  res.status(501).json({ message: 'Not implemented: listLocationPoints' });
}


