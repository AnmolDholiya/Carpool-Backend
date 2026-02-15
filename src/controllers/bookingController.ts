import type { Request, Response } from 'express';

export async function createBooking(_req: Request, res: Response) {
  res.status(501).json({ message: 'Not implemented: createBooking' });
}

export async function cancelBooking(_req: Request, res: Response) {
  res.status(501).json({ message: 'Not implemented: cancelBooking' });
}


