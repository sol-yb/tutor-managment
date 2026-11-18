import { Router } from 'express';
import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import { z } from 'zod';
import { env } from '../config/env.js';
import { prisma } from '../lib/prisma.js';

const router = Router();
const loginSchema = z.object({ email: z.string().email(), password: z.string().min(8) });

router.post('/login', async (request, response, next) => {
  try {
    const input = loginSchema.parse(request.body);
    const user = await prisma.user.findUnique({ where: { email: input.email.toLowerCase() } });
    if (!user || user.status !== 'ACTIVE' || !(await bcrypt.compare(input.password, user.passwordHash))) {
      return response.status(401).json({ error: 'Invalid email or password' });
    }
    const accessToken = jwt.sign({ userId: user.id, role: user.role }, env.JWT_ACCESS_SECRET, { expiresIn: '15m' });
    return response.json({ accessToken, user: { id: user.id, email: user.email, fullName: user.fullName, role: user.role } });
  } catch (error) {
    return next(error);
  }
});

export default router;
