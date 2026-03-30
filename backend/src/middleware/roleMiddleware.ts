import type { NextFunction, Request, Response } from 'express';
import type { AuthedRequest } from './authMiddleware';

export function requireAdmin(req: Request, res: Response, next: NextFunction) {
  const authedReq = req as AuthedRequest;
  if (!authedReq.user) {
    return res.status(401).json({ message: 'Unauthenticated' });
  }

  if (authedReq.user.role !== 'ADMIN') {
    return res.status(403).json({ message: 'Forbidden: admin only' });
  }

  return next();
}


