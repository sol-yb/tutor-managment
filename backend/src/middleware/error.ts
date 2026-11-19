import type { NextFunction, Request, Response } from 'express';
import { ZodError } from 'zod';
import { Prisma } from '@prisma/client';

export class HttpError extends Error {
  constructor(public status: number, message: string) {
    super(message);
  }
}

export function notFound(_request: Request, response: Response) {
  response.status(404).json({ success: false, message: 'Route not found', data: null });
}

export function errorHandler(error: unknown, _request: Request, response: Response, _next: NextFunction) {
  if (error instanceof ZodError) {
    return response.status(400).json({ success: false, message: 'Validation failed', data: error.flatten() });
  }
  if (error instanceof HttpError) {
    return response.status(error.status).json({ success: false, message: error.message, data: null });
  }
  if (error instanceof Prisma.PrismaClientKnownRequestError) {
    if (error.code === 'P2002') return response.status(409).json({ success: false, message: 'Record already exists', data: null });
    if (error.code === 'P2025') return response.status(404).json({ success: false, message: 'Record not found', data: null });
  }
  console.error(error);
  return response.status(500).json({ success: false, message: 'Internal server error', data: null });
}
