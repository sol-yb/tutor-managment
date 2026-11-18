import type { NextFunction, Request, Response } from 'express';
import jwt from 'jsonwebtoken';
import { env } from '../config/env.js';

export type AuthRequest = Request & { auth?: { userId: string; role: string } };

export function requireAuth(request: AuthRequest, response: Response, next: NextFunction) {
  const token = request.headers.authorization?.replace(/^Bearer\s+/i, '');
  if (!token) return response.status(401).json({ error: 'Authentication required' });
  try {
    request.auth = jwt.verify(token, env.JWT_ACCESS_SECRET) as { userId: string; role: string };
    return next();
  } catch {
    return response.status(401).json({ error: 'Invalid or expired access token' });
  }
}

export function requireRole(...roles: string[]) {
  return (request: AuthRequest, response: Response, next: NextFunction) => {
    if (!request.auth || !roles.includes(request.auth.role)) return response.status(403).json({ error: 'Insufficient permissions' });
    return next();
  };
}
