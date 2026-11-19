import { randomBytes, createHash } from 'node:crypto';
import { Router } from 'express';
import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import { z } from 'zod';
import { env } from '../config/env.js';
import { prisma } from '../lib/prisma.js';
import { requireAuth, type AuthRequest } from '../middleware/auth.js';
import { HttpError } from '../middleware/error.js';
import { sendEmail } from '../emails/email.js';

const router = Router();
const refreshSecret = env.JWT_REFRESH_SECRET ?? env.JWT_ACCESS_SECRET;
const passwordSchema = z.string().min(12).regex(/[A-Z]/).regex(/[a-z]/).regex(/[0-9]/);
const tokenHash = (token: string) => createHash('sha256').update(token).digest('hex');

const registerSchema = z.object({
  fullName: z.string().trim().min(2).max(120),
  email: z.string().trim().email().transform((value) => value.toLowerCase()),
  password: passwordSchema,
  phone: z.string().trim().optional(),
  role: z.enum(['FAMILY', 'TUTOR']),
});

function accessToken(user: { id: string; role: string }) {
  return jwt.sign({ userId: user.id, role: user.role }, env.JWT_ACCESS_SECRET, { expiresIn: '15m' });
}

async function issueRefreshSession(response: any, userId: string) {
  const token = randomBytes(48).toString('hex');
  await prisma.refreshSession.create({
    data: { userId, tokenHash: tokenHash(token), expiresAt: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000) },
  });
  response.cookie('refresh_token', token, {
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'lax',
    maxAge: 7 * 24 * 60 * 60 * 1000,
  });
  return token;
}

router.post('/register', async (request, response, next) => {
  try {
    const input = registerSchema.parse(request.body);
    const passwordHash = await bcrypt.hash(input.password, 12);
    const verification = randomBytes(32).toString('hex');
    const user = await prisma.$transaction(async (tx) => {
      const created = await tx.user.create({
        data: { email: input.email, fullName: input.fullName, phone: input.phone, passwordHash, role: input.role },
      });
      if (input.role === 'FAMILY') await tx.family.create({ data: { userId: created.id } });
      if (input.role === 'TUTOR') await tx.tutor.create({ data: { userId: created.id } });
      await tx.emailVerificationToken.create({
        data: { userId: created.id, tokenHash: tokenHash(verification), expiresAt: new Date(Date.now() + 24 * 60 * 60 * 1000) },
      });
      return created;
    });
    await issueRefreshSession(response, user.id);
    await sendEmail(input.email, 'Verify your Melihik Tutor email', `${env.BACKEND_URL}/api/v1/auth/verify-email/confirm?token=${verification}`);
    response.status(201).json({
      success: true,
      message: 'Registration successful',
      data: { accessToken: accessToken(user), user: { id: user.id, email: user.email, fullName: user.fullName, role: user.role } },
    });
  } catch (error) {
    next(error);
  }
});

router.post('/login', async (request, response, next) => {
  try {
    const input = z.object({ email: z.string().email(), password: z.string().min(8) }).parse(request.body);
    const user = await prisma.user.findUnique({ where: { email: input.email.toLowerCase() } });
    if (!user || user.status !== 'ACTIVE' || !(await bcrypt.compare(input.password, user.passwordHash))) {
      throw new HttpError(401, 'Invalid email or password');
    }
    await issueRefreshSession(response, user.id);
    response.json({
      success: true,
      message: 'Login successful',
      data: { accessToken: accessToken(user), user: { id: user.id, email: user.email, fullName: user.fullName, role: user.role } },
    });
  } catch (error) {
    next(error);
  }
});

router.post('/refresh', async (request, response, next) => {
  try {
    const token = request.cookies.refresh_token as string | undefined;
    if (!token) throw new HttpError(401, 'Refresh session required');
    const session = await prisma.refreshSession.findUnique({ where: { tokenHash: tokenHash(token) } });
    if (!session || session.revokedAt || session.expiresAt <= new Date()) throw new HttpError(401, 'Refresh session invalid');
    const user = await prisma.user.findUnique({ where: { id: session.userId } });
    if (!user || user.status !== 'ACTIVE') throw new HttpError(401, 'Account unavailable');
    await prisma.refreshSession.update({ where: { id: session.id }, data: { revokedAt: new Date() } });
    await issueRefreshSession(response, user.id);
    response.json({ success: true, message: 'Session refreshed', data: { accessToken: accessToken(user) } });
  } catch (error) {
    next(error);
  }
});

router.post('/logout', async (request, response, next) => {
  try {
    const token = request.cookies.refresh_token as string | undefined;
    if (token) await prisma.refreshSession.updateMany({ where: { tokenHash: tokenHash(token), revokedAt: null }, data: { revokedAt: new Date() } });
    response.clearCookie('refresh_token');
    response.json({ success: true, message: 'Logged out', data: null });
  } catch (error) {
    next(error);
  }
});

router.get('/me', requireAuth, async (request: AuthRequest, response, next) => {
  try {
    const user = await prisma.user.findUnique({
      where: { id: request.auth!.userId },
      select: { id: true, email: true, fullName: true, phone: true, role: true, status: true, emailVerifiedAt: true },
    });
    if (!user) throw new HttpError(404, 'User not found');
    response.json({ success: true, message: 'Profile retrieved', data: user });
  } catch (error) {
    next(error);
  }
});

router.post('/password-reset/request', async (request, response, next) => {
  try {
    const { email } = z.object({ email: z.string().email() }).parse(request.body);
    const user = await prisma.user.findUnique({ where: { email: email.toLowerCase() } });
    if (user) {
      const token = randomBytes(32).toString('hex');
      await prisma.passwordResetToken.create({ data: { userId: user.id, tokenHash: tokenHash(token), expiresAt: new Date(Date.now() + 60 * 60 * 1000) } });
      await sendEmail(user.email, 'Reset your Melihik Tutor password', `${env.FRONTEND_ORIGIN}/reset-password?token=${token}`);
    }
    response.json({ success: true, message: 'If the account exists, reset instructions were sent', data: null });
  } catch (error) {
    next(error);
  }
});

router.post('/password-reset/confirm', async (request, response, next) => {
  try {
    const input = z.object({ token: z.string().min(32), password: passwordSchema }).parse(request.body);
    const reset = await prisma.passwordResetToken.findUnique({ where: { tokenHash: tokenHash(input.token) } });
    if (!reset || reset.usedAt || reset.expiresAt <= new Date()) throw new HttpError(400, 'Reset token is invalid or expired');
    const passwordHash = await bcrypt.hash(input.password, 12);
    await prisma.$transaction([
      prisma.user.update({ where: { id: reset.userId }, data: { passwordHash } }),
      prisma.passwordResetToken.update({ where: { id: reset.id }, data: { usedAt: new Date() } }),
      prisma.refreshSession.updateMany({ where: { userId: reset.userId, revokedAt: null }, data: { revokedAt: new Date() } }),
    ]);
    response.json({ success: true, message: 'Password reset successful', data: null });
  } catch (error) {
    next(error);
  }
});

router.post('/verify-email/confirm', async (request, response, next) => {
  try {
    const input = z.object({ token: z.string().min(32) }).parse(request.body);
    const hash = tokenHash(input.token);
    const verification = await prisma.emailVerificationToken.findUnique({ where: { tokenHash: hash } });
    if (!verification || verification.usedAt || verification.expiresAt <= new Date()) throw new HttpError(400, 'Verification token is invalid or expired');
    await prisma.$transaction([
      prisma.emailVerificationToken.update({ where: { id: verification.id }, data: { usedAt: new Date() } }),
      prisma.user.update({ where: { id: verification.userId }, data: { emailVerifiedAt: new Date() } }),
    ]);
    response.json({ success: true, message: 'Email verified', data: null });
  } catch (error) {
    next(error);
  }
});

router.post('/verify-email/resend', requireAuth, async (request: AuthRequest, response, next) => {
  try {
    const user = await prisma.user.findUnique({ where: { id: request.auth!.userId } });
    if (!user) throw new HttpError(404, 'User not found');
    if (user.emailVerifiedAt) return response.json({ success: true, message: 'Email already verified', data: null });
    await prisma.emailVerificationToken.updateMany({ where: { userId: user.id, usedAt: null }, data: { usedAt: new Date() } });
    const token = randomBytes(32).toString('hex');
    await prisma.emailVerificationToken.create({ data: { userId: user.id, tokenHash: tokenHash(token), expiresAt: new Date(Date.now() + 24 * 60 * 60 * 1000) } });
    await sendEmail(user.email, 'Verify your Melihik Tutor email', `${env.FRONTEND_ORIGIN}/verify-email?token=${token}`);
    response.json({ success: true, message: 'Verification email sent', data: null });
  } catch (error) { next(error); }
});

export default router;
