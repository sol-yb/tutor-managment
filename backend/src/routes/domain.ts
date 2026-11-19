import { mkdirSync, readFileSync } from 'node:fs';
import { createHmac, timingSafeEqual } from 'node:crypto';
import { join, extname } from 'node:path';
import multer from 'multer';
import { Prisma } from '@prisma/client';
import { Router } from 'express';
import { z } from 'zod';
import { env } from '../config/env.js';
import { prisma } from '../lib/prisma.js';
import { requireAuth, requireRole, type AuthRequest } from '../middleware/auth.js';
import { HttpError } from '../middleware/error.js';
import { auditLog } from '../services/audit.js';
import { sendSms } from '../services/sms.js';
import PDFDocument from 'pdfkit';
import { putPrivateObject, getPrivateObject } from '../services/storage.js';

const router = Router();

function routeParam(request: { params: Record<string, string | string[]> }, name: string) {
  const value = request.params[name];
  if (typeof value !== 'string') throw new HttpError(400, `Invalid ${name}`);
  return value;
}

function pagination(request: AuthRequest) {
  const page = Math.max(1, Number(request.query.page ?? 1));
  const pageSize = Math.min(100, Math.max(1, Number(request.query.pageSize ?? 20)));
  return { page, pageSize, skip: (page - 1) * pageSize };
}

function verifyChapaSignature(request: { body: unknown; header(name: string): string | undefined }) {
  const secret = env.CHAPA_WEBHOOK_SECRET ?? env.CHAPA_SECRET_KEY;
  if (!secret) return false;
  const expected = createHmac('sha256', secret).update(JSON.stringify(request.body)).digest('hex');
  const signatures = [
    request.header('x-chapa-signature'),
    request.header('chapa-signature'),
  ].filter((value): value is string => Boolean(value));
  return signatures.some((signature) => {
    try {
      const supplied = Buffer.from(signature, 'hex');
      const calculated = Buffer.from(expected, 'hex');
      return supplied.length === calculated.length && timingSafeEqual(supplied, calculated);
    } catch {
      return false;
    }
  });
}

const documentUpload = multer({
  storage: multer.diskStorage({
    destination: (_request, _file, callback) => {
      const destination = join(process.cwd(), 'private', 'tutor-documents');
      mkdirSync(destination, { recursive: true });
      callback(null, destination);
    },
    filename: (_request, file, callback) => {
      callback(null, `${Date.now()}-${Math.random().toString(36).slice(2)}${extname(file.originalname).toLowerCase()}`);
    },
  }),
  limits: { fileSize: 10 * 1024 * 1024 },
  fileFilter: (_request, file, callback) => callback(null, ['application/pdf', 'image/jpeg', 'image/png'].includes(file.mimetype)),
});

router.get('/subjects', async (_request, response, next) => {
  try {
    const subjects = await prisma.subject.findMany({ where: { active: true }, orderBy: { name: 'asc' } });
    response.json({ success: true, message: 'Subjects retrieved', data: subjects });
  } catch (error) { next(error); }
});

router.get('/grade-levels', async (_request, response, next) => {
  try {
    const levels = await prisma.gradeLevel.findMany({ orderBy: { name: 'asc' } });
    response.json({ success: true, message: 'Grade levels retrieved', data: levels });
  } catch (error) { next(error); }
});

router.get('/tutors', async (request: AuthRequest, response, next) => {
  try {
    const p = pagination(request);
    const search = typeof request.query.search === 'string' ? request.query.search : '';
    const city = typeof request.query.city === 'string' ? request.query.city : '';
    const where: any = {
      applicationStatus: 'APPROVED',
      user: { status: 'ACTIVE' },
      ...(city ? { city: { contains: city, mode: 'insensitive' } } : {}),
      ...(search ? { OR: [
        { biography: { contains: search, mode: 'insensitive' } },
        { user: { fullName: { contains: search, mode: 'insensitive' } } },
      ] } : {}),
    };
    const [items, total] = await Promise.all([
      prisma.tutor.findMany({ where, skip: p.skip, take: p.pageSize, include: { user: { select: { fullName: true } }, subjects: { include: { subject: true } } } }),
      prisma.tutor.count({ where }),
    ]);
    response.json({ success: true, message: 'Tutors retrieved', data: { items, pagination: { page: p.page, pageSize: p.pageSize, total } } });
  } catch (error) { next(error); }
});

router.get('/tutors/:id', async (request, response, next) => {
  try {
    const tutor = await prisma.tutor.findFirst({
      where: { id: routeParam(request, 'id'), applicationStatus: 'APPROVED', user: { status: 'ACTIVE' } },
      include: { user: { select: { fullName: true, emailVerifiedAt: true } }, qualifications: true, subjects: { include: { subject: true } }, availability: true, reviews: { where: { approved: true } } },
    });
    if (!tutor) throw new HttpError(404, 'Approved tutor not found');
    response.json({ success: true, message: 'Tutor retrieved', data: tutor });
  } catch (error) { next(error); }
});

router.post('/payments/chapa/webhook', async (request, response, next) => {
  try {
    if (!env.CHAPA_SECRET_KEY) throw new HttpError(503, 'Chapa payment is not configured');
    if (!verifyChapaSignature(request)) throw new HttpError(401, 'Invalid or missing webhook signature');
    const txRef = typeof request.body?.tx_ref === 'string'
      ? request.body.tx_ref
      : typeof request.body?.trx_ref === 'string' ? request.body.trx_ref : '';
    if (!txRef) throw new HttpError(400, 'Missing transaction reference');
    const verifyResponse = await fetch(`${env.CHAPA_BASE_URL}/transaction/verify/${encodeURIComponent(txRef)}`, {
      headers: { Authorization: `Bearer ${env.CHAPA_SECRET_KEY}` },
    });
    const verified = await verifyResponse.json() as {
      status?: string;
      data?: { status?: string; amount?: string; currency?: string; tx_ref?: string; mode?: string };
    };
    if (!verifyResponse.ok || verified.status !== 'success' || verified.data?.status !== 'success') {
      return response.status(200).json({ success: true, message: 'Webhook acknowledged; transaction not successful', data: null });
    }
    await prisma.$transaction(async (tx) => {
      const payment = await tx.payment.findUnique({ where: { chapaReference: txRef } });
      if (!payment) throw new HttpError(404, 'Payment not found');
      if (payment.status === 'PAID') return;
      if (verified.data?.tx_ref && verified.data.tx_ref !== payment.chapaReference) throw new HttpError(400, 'Transaction reference mismatch');
      if (verified.data?.currency && verified.data.currency !== payment.currency) throw new HttpError(400, 'Transaction currency mismatch');
      if (verified.data?.amount && new Prisma.Decimal(verified.data.amount).cmp(payment.amount) !== 0) throw new HttpError(400, 'Transaction amount mismatch');
      await tx.payment.update({ where: { id: payment.id }, data: { status: 'PAID', paidAt: new Date() } });
      const setting = await tx.systemSetting.findUnique({ where: { key: 'platform.commissionRate' } });
      const rate = new Prisma.Decimal(setting?.value ?? '15');
      await tx.platformCommission.create({ data: { paymentId: payment.id, amount: payment.amount.mul(rate).div(100), rate } });
    });
    response.status(200).json({ success: true, message: 'Webhook processed', data: null });
  } catch (error) { next(error); }
});

router.get('/payments/chapa/callback', async (request, response, next) => {
  try {
    const txRef = typeof request.query.tx_ref === 'string' ? request.query.tx_ref : '';
    if (!txRef) throw new HttpError(400, 'Missing transaction reference');
    if (!env.CHAPA_SECRET_KEY) throw new HttpError(503, 'Chapa payment is not configured');
    const payment = await prisma.payment.findUnique({ where: { chapaReference: txRef } });
    if (!payment) throw new HttpError(404, 'Payment not found');
    if (payment.status === 'PAID') return response.json({ success: true, message: 'Payment already verified', data: { status: 'PAID' } });
    const verifyResponse = await fetch(`${env.CHAPA_BASE_URL}/transaction/verify/${encodeURIComponent(txRef)}`, {
      headers: { Authorization: `Bearer ${env.CHAPA_SECRET_KEY}` },
    });
    const result = await verifyResponse.json() as { status?: string; data?: { status?: string; amount?: string; currency?: string; tx_ref?: string } };
    if (!verifyResponse.ok || result.status !== 'success' || result.data?.status !== 'success') {
      await prisma.payment.update({ where: { id: payment.id }, data: { status: 'FAILED' } });
      throw new HttpError(400, 'Payment could not be verified');
    }
    if (result.data?.tx_ref !== payment.chapaReference) throw new HttpError(400, 'Transaction reference mismatch');
    if (result.data?.currency !== payment.currency) throw new HttpError(400, 'Transaction currency mismatch');
    if (result.data?.amount && new Prisma.Decimal(result.data.amount).cmp(payment.amount) !== 0) throw new HttpError(400, 'Transaction amount mismatch');
    await prisma.$transaction(async (tx) => {
      await tx.payment.update({ where: { id: payment.id }, data: { status: 'PAID', paidAt: new Date() } });
      const setting = await tx.systemSetting.findUnique({ where: { key: 'platform.commissionRate' } });
      const rate = new Prisma.Decimal(setting?.value ?? '15');
      await tx.platformCommission.create({ data: { paymentId: payment.id, amount: payment.amount.mul(rate).div(100), rate } });
    });
    response.json({ success: true, message: 'Payment verified', data: { status: 'PAID' } });
  } catch (error) { next(error); }
});

router.use(requireAuth);

router.get('/family/profile', requireRole('FAMILY'), async (request: AuthRequest, response, next) => {
  try {
    const family = await prisma.family.findUnique({ where: { userId: request.auth!.userId }, include: { user: true, students: { include: { subjects: { include: { subject: true } }, gradeLevel: true } } } });
    response.json({ success: true, message: 'Family profile retrieved', data: family });
  } catch (error) { next(error); }
});

router.put('/family/profile', requireRole('FAMILY'), async (request: AuthRequest, response, next) => {
  try {
    const input = z.object({ fullName: z.string().min(2).optional(), phone: z.string().optional(), address: z.string().optional(), city: z.string().optional(), subCity: z.string().optional() }).parse(request.body);
    const family = await prisma.family.findUniqueOrThrow({ where: { userId: request.auth!.userId } });
    await prisma.$transaction([
      ...(input.fullName || input.phone ? [prisma.user.update({ where: { id: request.auth!.userId }, data: { fullName: input.fullName, phone: input.phone } })] : []),
      prisma.family.update({ where: { id: family.id }, data: { address: input.address, city: input.city, subCity: input.subCity } }),
    ]);
    response.json({ success: true, message: 'Family profile updated', data: null });
  } catch (error) { next(error); }
});

router.get('/family/students', requireRole('FAMILY'), async (request: AuthRequest, response, next) => {
  try {
    const family = await prisma.family.findUniqueOrThrow({ where: { userId: request.auth!.userId } });
    const students = await prisma.student.findMany({ where: { familyId: family.id }, include: { gradeLevel: true, subjects: { include: { subject: true } } } });
    response.json({ success: true, message: 'Students retrieved', data: students });
  } catch (error) { next(error); }
});

router.post('/family/students', requireRole('FAMILY'), async (request: AuthRequest, response, next) => {
  try {
    const input = z.object({
      fullName: z.string().min(2), dateOfBirth: z.string().datetime().optional(), gradeLevelId: z.string().optional(),
      schoolName: z.string().optional(), gender: z.string().optional(), learningGoals: z.string().optional(),
      academicChallenges: z.string().optional(), subjectIds: z.array(z.string()).default([]),
    }).parse(request.body);
    const family = await prisma.family.findUniqueOrThrow({ where: { userId: request.auth!.userId } });
    const student = await prisma.student.create({
      data: {
        familyId: family.id, fullName: input.fullName, dateOfBirth: input.dateOfBirth ? new Date(input.dateOfBirth) : undefined,
        gradeLevelId: input.gradeLevelId, schoolName: input.schoolName, gender: input.gender,
        learningGoals: input.learningGoals, academicChallenges: input.academicChallenges,
        subjects: { create: input.subjectIds.map((subjectId) => ({ subjectId })) },
      },
    });
    response.status(201).json({ success: true, message: 'Student created', data: student });
  } catch (error) { next(error); }
});

router.get('/family/students/:id', requireRole('FAMILY'), async (request: AuthRequest, response, next) => {
  try {
    const family = await prisma.family.findUniqueOrThrow({ where: { userId: request.auth!.userId } });
    const student = await prisma.student.findFirst({ where: { id: routeParam(request, 'id'), familyId: family.id }, include: { gradeLevel: true, subjects: { include: { subject: true } }, progressReports: true } });
    if (!student) throw new HttpError(404, 'Student not found');
    response.json({ success: true, message: 'Student retrieved', data: student });
  } catch (error) { next(error); }
});

router.put('/family/students/:id', requireRole('FAMILY'), async (request: AuthRequest, response, next) => {
  try {
    const input = z.object({ fullName: z.string().min(2).optional(), gradeLevelId: z.string().nullable().optional(), schoolName: z.string().optional(), learningGoals: z.string().optional(), academicChallenges: z.string().optional() }).parse(request.body);
    const family = await prisma.family.findUniqueOrThrow({ where: { userId: request.auth!.userId } });
    const current = await prisma.student.findFirst({ where: { id: routeParam(request, 'id'), familyId: family.id } });
    if (!current) throw new HttpError(404, 'Student not found');
    const student = await prisma.student.update({ where: { id: current.id }, data: input });
    response.json({ success: true, message: 'Student updated', data: student });
  } catch (error) { next(error); }
});

router.delete('/family/students/:id', requireRole('FAMILY'), async (request: AuthRequest, response, next) => {
  try {
    const family = await prisma.family.findUniqueOrThrow({ where: { userId: request.auth!.userId } });
    const current = await prisma.student.findFirst({ where: { id: routeParam(request, 'id'), familyId: family.id } });
    if (!current) throw new HttpError(404, 'Student not found');
    await prisma.student.delete({ where: { id: current.id } });
    response.json({ success: true, message: 'Student deleted', data: null });
  } catch (error) { next(error); }
});

router.get('/tutor/profile', requireRole('TUTOR'), async (request: AuthRequest, response, next) => {
  try {
    const tutor = await prisma.tutor.findUnique({ where: { userId: request.auth!.userId }, include: { user: true, qualifications: true, documents: true, subjects: { include: { subject: true } }, availability: true } });
    response.json({ success: true, message: 'Tutor profile retrieved', data: tutor });
  } catch (error) { next(error); }
});

router.put('/tutor/profile', requireRole('TUTOR'), async (request: AuthRequest, response, next) => {
  try {
    const input = z.object({
      fullName: z.string().optional(), phone: z.string().optional(), dateOfBirth: z.string().datetime().optional(),
      address: z.string().optional(), city: z.string().optional(), subCity: z.string().optional(), biography: z.string().optional(),
      teachingMethodology: z.string().optional(), experienceYears: z.number().int().min(0).optional(),
      hourlyRate: z.number().positive().optional(), preferredLocation: z.string().optional(), subjectIds: z.array(z.string()).optional(),
    }).parse(request.body);
    const tutor = await prisma.tutor.findUniqueOrThrow({ where: { userId: request.auth!.userId } });
    await prisma.$transaction(async (tx) => {
      await tx.user.update({ where: { id: request.auth!.userId }, data: { fullName: input.fullName, phone: input.phone } });
      await tx.tutor.update({
        where: { id: tutor.id },
        data: {
          dateOfBirth: input.dateOfBirth ? new Date(input.dateOfBirth) : undefined, address: input.address, city: input.city, subCity: input.subCity,
          biography: input.biography, teachingMethodology: input.teachingMethodology, experienceYears: input.experienceYears,
          hourlyRate: input.hourlyRate, preferredLocation: input.preferredLocation,
        },
      });
      if (input.subjectIds) {
        await tx.tutorSubject.deleteMany({ where: { tutorId: tutor.id } });
        await tx.tutorSubject.createMany({ data: input.subjectIds.map((subjectId) => ({ tutorId: tutor.id, subjectId })) });
      }
    });
    response.json({ success: true, message: 'Tutor profile updated', data: null });
  } catch (error) { next(error); }
});

router.post('/tutor/application/submit', requireRole('TUTOR'), async (request: AuthRequest, response, next) => {
  try {
    const tutor = await prisma.tutor.findUniqueOrThrow({ where: { userId: request.auth!.userId } });
    await prisma.$transaction([
      prisma.tutor.update({ where: { id: tutor.id }, data: { applicationStatus: 'SUBMITTED' } }),
      prisma.tutorApplication.create({ data: { tutorId: tutor.id, status: 'SUBMITTED', submittedAt: new Date() } }),
    ]);
    response.json({ success: true, message: 'Tutor application submitted', data: null });
  } catch (error) { next(error); }
});

router.post('/tutor/documents', requireRole('TUTOR'), documentUpload.single('document'), async (request: AuthRequest, response, next) => {
  try {
    const type = z.enum(['CERTIFICATE', 'TRANSCRIPT', 'IDENTITY', 'CV', 'OTHER']).parse(request.body.type);
    if (!request.file) throw new HttpError(400, 'A PDF or image document is required');
    const tutor = await prisma.tutor.findUniqueOrThrow({ where: { userId: request.auth!.userId } });
    const document = await prisma.tutorDocument.create({
      data: { tutorId: tutor.id, type, fileName: request.file.originalname, storageKey: request.file.filename, mimeType: request.file.mimetype, fileSize: request.file.size },
    });
    await putPrivateObject(request.file.filename, readFileSync(request.file.path), request.file.mimetype);
    response.status(201).json({ success: true, message: 'Document uploaded', data: document });
  } catch (error) { next(error); }
});

router.get('/tutor/documents/:id/download', requireRole('TUTOR', 'SYSTEM_ADMIN'), async (request: AuthRequest, response, next) => {
  try {
    const document = await prisma.tutorDocument.findUnique({ where: { id: routeParam(request, 'id') } });
    if (!document) throw new HttpError(404, 'Document not found');
    if (request.auth!.role === 'TUTOR') {
      const tutor = await prisma.tutor.findUnique({ where: { userId: request.auth!.userId } });
      if (tutor?.id !== document.tutorId) throw new HttpError(403, 'Access denied');
    }
    const stored = await getPrivateObject(document.storageKey);
    const file = stored ?? readFileSync(join(process.cwd(), 'private', 'tutor-documents', document.storageKey));
    response.setHeader('Content-Type', document.mimeType);
    response.setHeader('Content-Disposition', `inline; filename="${document.fileName}"`);
    response.send(file);
  } catch (error) { next(error); }
});

router.post('/admin/subjects', requireRole('SYSTEM_ADMIN'), async (request, response, next) => {
  try {
    const input = z.object({ name: z.string().min(2), active: z.boolean().optional() }).parse(request.body);
    const subject = await prisma.subject.create({ data: input });
    response.status(201).json({ success: true, message: 'Subject created', data: subject });
  } catch (error) { next(error); }
});

router.put('/admin/tutor-applications/:id/status', requireRole('SYSTEM_ADMIN'), async (request: AuthRequest, response, next) => {
  try {
    const input = z.object({ status: z.enum(['UNDER_REVIEW', 'ADDITIONAL_INFORMATION_REQUIRED', 'APPROVED', 'REJECTED', 'SUSPENDED']), reason: z.string().optional() }).parse(request.body);
    const application = await prisma.tutorApplication.findUnique({ where: { id: routeParam(request, 'id') } });
    if (!application) throw new HttpError(404, 'Application not found');
    await prisma.$transaction([
      prisma.tutorApplication.update({ where: { id: application.id }, data: { status: input.status, reviewReason: input.reason, reviewedAt: new Date() } }),
      prisma.tutor.update({ where: { id: application.tutorId }, data: { applicationStatus: input.status } }),
      prisma.tutorApplicationHistory.create({ data: { applicationId: application.id, status: input.status, reason: input.reason, changedById: request.auth!.userId } }),
    ]);
    await auditLog({ userId: request.auth!.userId, action: 'UPDATE_APPLICATION_STATUS', entity: 'TutorApplication', entityId: application.id, metadata: { status: input.status }, ipAddress: request.ip });
    response.json({ success: true, message: 'Tutor application status updated', data: null });
  } catch (error) { next(error); }
});

router.get('/admin/tutor-applications', requireRole('SYSTEM_ADMIN'), async (request: AuthRequest, response, next) => {
  try {
    const p = pagination(request);
    const status = typeof request.query.status === 'string' ? request.query.status : undefined;
    const where = status ? { status: status as any } : {};
    const [items, total] = await Promise.all([
      prisma.tutorApplication.findMany({ where, skip: p.skip, take: p.pageSize, include: { tutor: { include: { user: true, qualifications: true, documents: true } } }, orderBy: { createdAt: 'desc' } }),
      prisma.tutorApplication.count({ where }),
    ]);
    response.json({ success: true, message: 'Applications retrieved', data: { items, pagination: { page: p.page, pageSize: p.pageSize, total } } });
  } catch (error) { next(error); }
});

router.get('/admin/dashboard', requireRole('SYSTEM_ADMIN'), async (_request, response, next) => {
  try {
    const [families, students, tutors, approvedTutors, requests, engagements, lessons, payments] = await Promise.all([
      prisma.family.count(), prisma.student.count(), prisma.tutor.count(), prisma.tutor.count({ where: { applicationStatus: 'APPROVED' } }),
      prisma.tutoringRequest.count(), prisma.tutoringEngagement.count({ where: { status: 'ACTIVE' } }), prisma.lesson.count(),
      prisma.payment.aggregate({ _sum: { amount: true }, where: { status: 'PAID' } }),
    ]);
    response.json({ success: true, message: 'Dashboard retrieved', data: { families, students, tutors, approvedTutors, requests, engagements, lessons, collectedAmount: payments._sum.amount?.toString() ?? '0' } });
  } catch (error) { next(error); }
});

router.post('/requests', requireRole('FAMILY'), async (request: AuthRequest, response, next) => {
  try {
    const input = z.object({
      studentId: z.string(), subjectId: z.string(), gradeLevelId: z.string().optional(),
      type: z.enum(['REGULAR', 'INTENSIVE', 'EXAM_PREPARATION', 'HOMEWORK_SUPPORT']),
      goals: z.string().optional(), preferredLocation: z.string().optional(), preferredStart: z.string().datetime().optional(),
    }).parse(request.body);
    const family = await prisma.family.findUniqueOrThrow({ where: { userId: request.auth!.userId } });
    const student = await prisma.student.findFirst({ where: { id: input.studentId, familyId: family.id } });
    if (!student) throw new HttpError(404, 'Student not found');
    const created = await prisma.tutoringRequest.create({
      data: { familyId: family.id, studentId: input.studentId, subjectId: input.subjectId, gradeLevelId: input.gradeLevelId, type: input.type, status: 'SUBMITTED', goals: input.goals, preferredLocation: input.preferredLocation, preferredStart: input.preferredStart ? new Date(input.preferredStart) : null, createdById: request.auth!.userId },
    });
    response.status(201).json({ success: true, message: 'Tutoring request submitted', data: created });
  } catch (error) { next(error); }
});

router.get('/requests', async (request: AuthRequest, response, next) => {
  try {
    let where: any = {};
    if (request.auth!.role === 'FAMILY') {
      const family = await prisma.family.findUnique({ where: { userId: request.auth!.userId } });
      where = { familyId: family?.id };
    } else if (request.auth!.role === 'TUTOR') {
      const tutor = await prisma.tutor.findUnique({ where: { userId: request.auth!.userId } });
      where = { assignments: { some: { tutorId: tutor?.id } } };
    }
    const p = pagination(request);
    const [items, total] = await Promise.all([
      prisma.tutoringRequest.findMany({ where, skip: p.skip, take: p.pageSize, include: { student: true, subject: true, gradeLevel: true, assignments: { include: { tutor: { include: { user: true } } } } }, orderBy: { createdAt: 'desc' } }),
      prisma.tutoringRequest.count({ where }),
    ]);
    response.json({ success: true, message: 'Requests retrieved', data: { items, pagination: { page: p.page, pageSize: p.pageSize, total } } });
  } catch (error) { next(error); }
});

router.post('/admin/requests/:id/assign', requireRole('SYSTEM_ADMIN'), async (request, response, next) => {
  try {
    const input = z.object({ tutorId: z.string() }).parse(request.body);
    const tutor = await prisma.tutor.findFirst({ where: { id: input.tutorId, applicationStatus: 'APPROVED', user: { status: 'ACTIVE' } } });
    if (!tutor) throw new HttpError(400, 'Tutor is not approved');
    const requestRecord = await prisma.tutoringRequest.findUnique({ where: { id: routeParam(request, 'id') } });
    if (!requestRecord) throw new HttpError(404, 'Request not found');
    const assignment = await prisma.tutorAssignment.create({ data: { requestId: requestRecord.id, tutorId: tutor.id, status: 'PROPOSED' } });
    await prisma.tutoringRequest.update({ where: { id: requestRecord.id }, data: { status: 'MATCHING' } });
    response.status(201).json({ success: true, message: 'Tutor assignment created', data: assignment });
  } catch (error) { next(error); }
});

router.put('/assignments/:id/status', requireRole('TUTOR'), async (request: AuthRequest, response, next) => {
  try {
    const input = z.object({ status: z.enum(['ACCEPTED', 'DECLINED']) }).parse(request.body);
    const tutor = await prisma.tutor.findUniqueOrThrow({ where: { userId: request.auth!.userId } });
    const assignment = await prisma.tutorAssignment.findFirst({ where: { id: routeParam(request, 'id'), tutorId: tutor.id } });
    if (!assignment) throw new HttpError(404, 'Assignment not found');
    await prisma.tutorAssignment.update({ where: { id: assignment.id }, data: { status: input.status === 'ACCEPTED' ? 'ACTIVE' : 'DECLINED', respondedAt: new Date() } });
    response.json({ success: true, message: 'Assignment status updated', data: null });
  } catch (error) { next(error); }
});

router.post('/admin/assignments/:id/activate', requireRole('SYSTEM_ADMIN'), async (request, response, next) => {
  try {
    const assignment = await prisma.tutorAssignment.findUnique({ where: { id: routeParam(request, 'id') }, include: { request: true } });
    if (!assignment || assignment.status !== 'ACTIVE') throw new HttpError(400, 'Assignment must be accepted by the tutor');
    const engagement = await prisma.$transaction(async (tx) => {
      const created = await tx.tutoringEngagement.create({ data: { requestId: assignment.requestId, assignmentId: assignment.id, tutorId: assignment.tutorId, studentId: assignment.request.studentId, status: 'ACTIVE' } });
      await tx.tutoringRequest.update({ where: { id: assignment.requestId }, data: { status: 'ASSIGNED' } });
      return created;
    });
    response.status(201).json({ success: true, message: 'Engagement activated', data: engagement });
  } catch (error) { next(error); }
});

router.post('/engagements/:id/lessons', requireRole('TUTOR'), async (request: AuthRequest, response, next) => {
  try {
    const input = z.object({ scheduledStart: z.string().datetime(), scheduledEnd: z.string().datetime(), location: z.string().optional() }).parse(request.body);
    const tutor = await prisma.tutor.findUniqueOrThrow({ where: { userId: request.auth!.userId } });
    const engagement = await prisma.tutoringEngagement.findFirst({ where: { id: routeParam(request, 'id'), tutorId: tutor.id } });
    if (!engagement) throw new HttpError(404, 'Engagement not found');
    const start = new Date(input.scheduledStart);
    const end = new Date(input.scheduledEnd);
    if (end <= start) throw new HttpError(400, 'Lesson end must be after its start');
    const conflict = await prisma.lesson.findFirst({ where: { status: { not: 'CANCELLED' }, scheduledStart: { lt: end }, scheduledEnd: { gt: start }, engagement: { tutorId: tutor.id } } });
    if (conflict) throw new HttpError(409, 'Tutor already has an overlapping lesson');
    const lesson = await prisma.lesson.create({ data: { engagementId: engagement.id, scheduledStart: start, scheduledEnd: end, location: input.location } });
    response.status(201).json({ success: true, message: 'Lesson scheduled', data: lesson });
  } catch (error) { next(error); }
});

router.get('/engagements/:id/lessons', async (request: AuthRequest, response, next) => {
  try {
    const engagement = await prisma.tutoringEngagement.findUnique({ where: { id: routeParam(request, 'id') }, include: { request: true } });
    if (!engagement) throw new HttpError(404, 'Engagement not found');
    if (request.auth!.role === 'TUTOR') {
      const tutor = await prisma.tutor.findUnique({ where: { userId: request.auth!.userId } });
      if (tutor?.id !== engagement.tutorId) throw new HttpError(403, 'Access denied');
    } else if (request.auth!.role === 'FAMILY') {
      const family = await prisma.family.findUnique({ where: { userId: request.auth!.userId } });
      if (family?.id !== engagement.request.familyId) throw new HttpError(403, 'Access denied');
    }
    const lessons = await prisma.lesson.findMany({ where: { engagementId: engagement.id }, include: { attendance: true, note: true, homework: true }, orderBy: { scheduledStart: 'asc' } });
    response.json({ success: true, message: 'Lessons retrieved', data: lessons });
  } catch (error) { next(error); }
});

router.put('/lessons/:id/attendance', requireRole('TUTOR'), async (request: AuthRequest, response, next) => {
  try {
    const input = z.object({ status: z.enum(['PRESENT', 'ABSENT', 'LATE', 'EXCUSED']), note: z.string().optional() }).parse(request.body);
    const tutor = await prisma.tutor.findUniqueOrThrow({ where: { userId: request.auth!.userId } });
    const lesson = await prisma.lesson.findFirst({ where: { id: routeParam(request, 'id'), engagement: { tutorId: tutor.id } } });
    if (!lesson) throw new HttpError(404, 'Lesson not found');
    const attendance = await prisma.attendance.upsert({ where: { lessonId: lesson.id }, update: { status: input.status, note: input.note }, create: { lessonId: lesson.id, status: input.status, note: input.note } });
    await prisma.lesson.update({ where: { id: lesson.id }, data: { status: 'COMPLETED' } });
    response.json({ success: true, message: 'Attendance recorded', data: attendance });
  } catch (error) { next(error); }
});

router.post('/engagements/:id/progress', requireRole('TUTOR'), async (request: AuthRequest, response, next) => {
  try {
    const input = z.object({ title: z.string().min(2), summary: z.string().min(2), strengths: z.string().optional(), improvements: z.string().optional() }).parse(request.body);
    const tutor = await prisma.tutor.findUniqueOrThrow({ where: { userId: request.auth!.userId } });
    const engagement = await prisma.tutoringEngagement.findFirst({ where: { id: routeParam(request, 'id'), tutorId: tutor.id } });
    if (!engagement) throw new HttpError(404, 'Engagement not found');
    const report = await prisma.progressReport.create({ data: { studentId: engagement.studentId, tutorId: tutor.id, title: input.title, summary: input.summary, strengths: input.strengths, improvements: input.improvements } });
    response.status(201).json({ success: true, message: 'Progress report created', data: report });
  } catch (error) { next(error); }
});

router.get('/notifications', async (request: AuthRequest, response, next) => {
  try {
    const p = pagination(request);
    const [items, total] = await Promise.all([
      prisma.notification.findMany({ where: { userId: request.auth!.userId }, skip: p.skip, take: p.pageSize, orderBy: { createdAt: 'desc' } }),
      prisma.notification.count({ where: { userId: request.auth!.userId } }),
    ]);
    response.json({ success: true, message: 'Notifications retrieved', data: { items, pagination: { page: p.page, pageSize: p.pageSize, total } } });
  } catch (error) { next(error); }
});

router.post('/support/tickets', async (request: AuthRequest, response, next) => {
  try {
    const input = z.object({ category: z.enum(['PAYMENT_PROBLEM', 'TUTOR_COMPLAINT', 'FAMILY_COMPLAINT', 'SCHEDULE_ISSUE', 'TECHNICAL_ISSUE', 'OTHER']), subject: z.string().min(2), description: z.string().min(10) }).parse(request.body);
    const family = request.auth!.role === 'FAMILY' ? await prisma.family.findUnique({ where: { userId: request.auth!.userId } }) : null;
    const ticket = await prisma.supportTicket.create({ data: { createdById: request.auth!.userId, familyId: family?.id, category: input.category, subject: input.subject, description: input.description } });
    response.status(201).json({ success: true, message: 'Support ticket created', data: ticket });
  } catch (error) { next(error); }
});

router.get('/support/tickets', async (request: AuthRequest, response, next) => {
  try {
    const where = request.auth!.role === 'SYSTEM_ADMIN' ? {} : { createdById: request.auth!.userId };
    const tickets = await prisma.supportTicket.findMany({ where, include: { messages: true }, orderBy: { createdAt: 'desc' } });
    response.json({ success: true, message: 'Support tickets retrieved', data: tickets });
  } catch (error) { next(error); }
});

router.post('/reviews', requireRole('FAMILY'), async (request: AuthRequest, response, next) => {
  try {
    const input = z.object({ engagementId: z.string(), tutorId: z.string(), overall: z.number().int().min(1).max(5), teachingQuality: z.number().int().min(1).max(5), punctuality: z.number().int().min(1).max(5), communication: z.number().int().min(1).max(5), improvement: z.number().int().min(1).max(5), feedback: z.string().optional() }).parse(request.body);
    const family = await prisma.family.findUniqueOrThrow({ where: { userId: request.auth!.userId } });
    const engagement = await prisma.tutoringEngagement.findFirst({ where: { id: input.engagementId, tutorId: input.tutorId, status: 'COMPLETED', request: { familyId: family.id } } });
    if (!engagement) throw new HttpError(400, 'Review requires a completed engagement');
    const review = await prisma.review.create({ data: { familyId: family.id, tutorId: input.tutorId, engagementId: engagement.id, overall: input.overall, teachingQuality: input.teachingQuality, punctuality: input.punctuality, communication: input.communication, improvement: input.improvement, feedback: input.feedback } });
    response.status(201).json({ success: true, message: 'Review submitted', data: review });
  } catch (error) { next(error); }
});

router.post('/payments/initialize', requireRole('FAMILY'), async (request: AuthRequest, response, next) => {
  try {
    const input = z.object({ amount: z.number().positive(), currency: z.string().default('ETB'), engagementId: z.string().optional(), email: z.string().email().optional(), firstName: z.string().optional(), lastName: z.string().optional() }).parse(request.body);
    if (!env.CHAPA_SECRET_KEY) throw new HttpError(503, 'Chapa payment is not configured');
    const family = await prisma.family.findUnique({ where: { userId: request.auth!.userId }, include: { user: true } });
    if (!family) throw new HttpError(404, 'Family not found');
    if (input.engagementId) {
      const engagement = await prisma.tutoringEngagement.findFirst({ where: { id: input.engagementId, request: { familyId: family.id } } });
      if (!engagement) throw new HttpError(403, 'Engagement not found');
    }
    const txRef = `melihik-${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;
    const payment = await prisma.payment.create({ data: { familyId: family.id, engagementId: input.engagementId, amount: input.amount, currency: input.currency, method: 'CHAPA', status: 'PENDING', chapaReference: txRef } });
    const resultResponse = await fetch(`${env.CHAPA_BASE_URL}/transaction/initialize`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${env.CHAPA_SECRET_KEY}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        amount: input.amount.toFixed(2), currency: input.currency, tx_ref: txRef,
        email: input.email ?? family.user.email,
        first_name: input.firstName ?? family.user.fullName.split(' ')[0],
        last_name: input.lastName ?? (family.user.fullName.split(' ').slice(1).join(' ') || 'Family'),
        callback_url: `${process.env.BACKEND_URL ?? 'http://localhost:3000'}/api/v1/payments/chapa/callback`,
        return_url: `${env.FRONTEND_ORIGIN}/family/payments`,
      }),
    });
    const result = await resultResponse.json() as { status?: string; data?: { checkout_url?: string } };
    if (!resultResponse.ok || result.status !== 'success' || !result.data?.checkout_url) {
      await prisma.payment.update({ where: { id: payment.id }, data: { status: 'FAILED' } });
      throw new HttpError(502, 'Payment gateway initialization failed');
    }
    response.status(201).json({ success: true, message: 'Payment initialized', data: { paymentId: payment.id, checkoutUrl: result.data.checkout_url } });
  } catch (error) { next(error); }
});

router.get('/family/payments', requireRole('FAMILY'), async (request: AuthRequest, response, next) => {
  try {
    const family = await prisma.family.findUniqueOrThrow({ where: { userId: request.auth!.userId } });
    const payments = await prisma.payment.findMany({ where: { familyId: family.id }, include: { invoice: true, commission: true }, orderBy: { createdAt: 'desc' } });
    response.json({ success: true, message: 'Payments retrieved', data: payments });
  } catch (error) { next(error); }
});

router.post('/lessons/:id/homework', requireRole('TUTOR'), async (request: AuthRequest, response, next) => {
  try {
    const input = z.object({ title: z.string().min(2), description: z.string().optional(), dueAt: z.string().datetime().optional() }).parse(request.body);
    const tutor = await prisma.tutor.findUniqueOrThrow({ where: { userId: request.auth!.userId } });
    const lesson = await prisma.lesson.findFirst({ where: { id: routeParam(request, 'id'), engagement: { tutorId: tutor.id } } });
    if (!lesson) throw new HttpError(404, 'Lesson not found');
    const homework = await prisma.homework.create({ data: { lessonId: lesson.id, title: input.title, description: input.description, dueAt: input.dueAt ? new Date(input.dueAt) : null } });
    response.status(201).json({ success: true, message: 'Homework created', data: homework });
  } catch (error) { next(error); }
});

router.post('/conversations', async (request: AuthRequest, response, next) => {
  try {
    const input = z.object({ participantId: z.string() }).parse(request.body);
    const participant = await prisma.user.findUnique({ where: { id: input.participantId } });
    if (!participant) throw new HttpError(404, 'Participant not found');
    const existing = await prisma.conversation.findFirst({
      where: { participants: { every: { userId: { in: [request.auth!.userId, participant.id] } } } },
      include: { participants: true },
    });
    const conversation = existing ?? await prisma.conversation.create({
      data: { participants: { create: [{ userId: request.auth!.userId }, { userId: participant.id }] } },
    });
    response.status(existing ? 200 : 201).json({ success: true, message: 'Conversation ready', data: conversation });
  } catch (error) { next(error); }
});

router.get('/conversations', async (request: AuthRequest, response, next) => {
  try {
    const conversations = await prisma.conversation.findMany({
      where: { participants: { some: { userId: request.auth!.userId } } },
      include: { participants: { include: { user: { select: { id: true, fullName: true, role: true } } } }, messages: { orderBy: { sentAt: 'desc' }, take: 1 } },
      orderBy: { createdAt: 'desc' },
    });
    response.json({ success: true, message: 'Conversations retrieved', data: conversations });
  } catch (error) { next(error); }
});

router.post('/conversations/:id/messages', async (request: AuthRequest, response, next) => {
  try {
    const input = z.object({ content: z.string().trim().min(1).max(5000) }).parse(request.body);
    const conversationId = routeParam(request, 'id');
    const participant = await prisma.conversationParticipant.findUnique({ where: { conversationId_userId: { conversationId, userId: request.auth!.userId } } });
    if (!participant) throw new HttpError(403, 'Access denied');
    const message = await prisma.message.create({ data: { conversationId, senderId: request.auth!.userId, content: input.content } });
    response.status(201).json({ success: true, message: 'Message sent', data: message });
  } catch (error) { next(error); }
});

router.get('/conversations/:id/messages', async (request: AuthRequest, response, next) => {
  try {
    const conversationId = routeParam(request, 'id');
    const participant = await prisma.conversationParticipant.findUnique({ where: { conversationId_userId: { conversationId, userId: request.auth!.userId } } });
    if (!participant) throw new HttpError(403, 'Access denied');
    const p = pagination(request);
    const messages = await prisma.message.findMany({ where: { conversationId }, include: { sender: { select: { id: true, fullName: true, role: true } } }, skip: p.skip, take: p.pageSize, orderBy: { sentAt: 'asc' } });
    response.json({ success: true, message: 'Messages retrieved', data: messages });
  } catch (error) { next(error); }
});

router.put('/support/tickets/:id/status', requireRole('SYSTEM_ADMIN'), async (request, response, next) => {
  try {
    const input = z.object({ status: z.enum(['OPEN', 'IN_PROGRESS', 'WAITING_FOR_RESPONSE', 'RESOLVED', 'CLOSED']), assignedToId: z.string().optional() }).parse(request.body);
    const ticket = await prisma.supportTicket.update({ where: { id: routeParam(request, 'id') }, data: { status: input.status, assignedToId: input.assignedToId } });
    response.json({ success: true, message: 'Support ticket updated', data: ticket });
  } catch (error) { next(error); }
});

router.post('/support/tickets/:id/messages', async (request: AuthRequest, response, next) => {
  try {
    const input = z.object({ content: z.string().trim().min(1).max(5000) }).parse(request.body);
    const ticket = await prisma.supportTicket.findUnique({ where: { id: routeParam(request, 'id') } });
    if (!ticket) throw new HttpError(404, 'Support ticket not found');
    if (request.auth!.role !== 'SYSTEM_ADMIN' && ticket.createdById !== request.auth!.userId) throw new HttpError(403, 'Access denied');
    const message = await prisma.supportMessage.create({ data: { ticketId: ticket.id, senderId: request.auth!.userId, content: input.content } });
    response.status(201).json({ success: true, message: 'Support response added', data: message });
  } catch (error) { next(error); }
});

router.get('/tutor/earnings', requireRole('TUTOR'), async (request: AuthRequest, response, next) => {
  try {
    const tutor = await prisma.tutor.findUniqueOrThrow({ where: { userId: request.auth!.userId } });
    const [earnings, payouts, total] = await Promise.all([
      prisma.tutorEarning.findMany({ where: { tutorId: tutor.id }, orderBy: { earnedAt: 'desc' } }),
      prisma.tutorPayout.findMany({ where: { tutorId: tutor.id }, orderBy: { createdAt: 'desc' } }),
      prisma.tutorEarning.aggregate({ where: { tutorId: tutor.id }, _sum: { amount: true } }),
    ]);
    response.json({ success: true, message: 'Earnings retrieved', data: { earnings, payouts, total: total._sum.amount?.toString() ?? '0' } });
  } catch (error) { next(error); }
});

router.get('/family/progress', requireRole('FAMILY'), async (request: AuthRequest, response, next) => {
  try {
    const family = await prisma.family.findUniqueOrThrow({ where: { userId: request.auth!.userId } });
    const reports = await prisma.progressReport.findMany({ where: { student: { familyId: family.id } }, include: { student: true, tutor: { include: { user: true } } }, orderBy: { createdAt: 'desc' } });
    response.json({ success: true, message: 'Student progress retrieved', data: reports });
  } catch (error) { next(error); }
});

router.get('/admin/reports/summary', requireRole('SYSTEM_ADMIN'), async (_request, response, next) => {
  try {
    const [payments, commissions, outstanding, failed, popular] = await Promise.all([
      prisma.payment.aggregate({ where: { status: 'PAID' }, _sum: { amount: true } }),
      prisma.platformCommission.aggregate({ _sum: { amount: true } }),
      prisma.payment.aggregate({ where: { status: 'PENDING' }, _sum: { amount: true } }),
      prisma.payment.count({ where: { status: 'FAILED' } }),
      prisma.tutoringRequest.groupBy({ by: ['subjectId'], _count: { _all: true }, orderBy: { _count: { subjectId: 'desc' } }, take: 10 }),
    ]);
    response.json({
      success: true,
      message: 'Reports retrieved',
      data: {
        collected: payments._sum.amount?.toString() ?? '0',
        commissions: commissions._sum.amount?.toString() ?? '0',
        outstanding: outstanding._sum.amount?.toString() ?? '0',
        failedTransactions: failed,
        popularSubjectIds: popular.map((item) => ({ subjectId: item.subjectId, requests: item._count._all })),
      },
    });
  } catch (error) { next(error); }
});

router.get('/admin/tutor-applications/:id/history', requireRole('SYSTEM_ADMIN'), async (request, response, next) => {
  try {
    const application = await prisma.tutorApplication.findUnique({ where: { id: routeParam(request, 'id') }, include: { history: { orderBy: { createdAt: 'desc' } } } });
    if (!application) throw new HttpError(404, 'Application not found');
    response.json({ success: true, message: 'Application history retrieved', data: application.history });
  } catch (error) { next(error); }
});

router.put('/admin/settings/:key', requireRole('SYSTEM_ADMIN'), async (request, response, next) => {
  try {
    const input = z.object({ value: z.string().min(1) }).parse(request.body);
    const setting = await prisma.systemSetting.upsert({ where: { key: routeParam(request, 'key') }, update: { value: input.value }, create: { key: routeParam(request, 'key'), value: input.value } });
    response.json({ success: true, message: 'Setting updated', data: setting });
  } catch (error) { next(error); }
});

router.get('/tutor/availability', requireRole('TUTOR'), async (request: AuthRequest, response, next) => {
  try {
    const tutor = await prisma.tutor.findUniqueOrThrow({ where: { userId: request.auth!.userId } });
    const availability = await prisma.tutorAvailability.findMany({ where: { tutorId: tutor.id }, orderBy: [{ dayOfWeek: 'asc' }, { startTime: 'asc' }] });
    response.json({ success: true, message: 'Availability retrieved', data: availability });
  } catch (error) { next(error); }
});

router.put('/tutor/availability', requireRole('TUTOR'), async (request: AuthRequest, response, next) => {
  try {
    const input = z.object({ slots: z.array(z.object({
      dayOfWeek: z.number().int().min(0).max(6),
      startTime: z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/),
      endTime: z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/),
    })).max(100) }).parse(request.body);
    const tutor = await prisma.tutor.findUniqueOrThrow({ where: { userId: request.auth!.userId } });
    await prisma.$transaction(async (tx) => {
      await tx.tutorAvailability.deleteMany({ where: { tutorId: tutor.id } });
      await tx.tutorAvailability.createMany({ data: input.slots.map((slot) => ({ tutorId: tutor.id, ...slot })) });
    });
    await auditLog({ userId: request.auth!.userId, action: 'UPDATE_AVAILABILITY', entity: 'TutorAvailability', metadata: { count: input.slots.length }, ipAddress: request.ip });
    response.json({ success: true, message: 'Availability updated', data: null });
  } catch (error) { next(error); }
});

router.post('/terms/accept', async (request: AuthRequest, response, next) => {
  try {
    const input = z.object({ documentId: z.string(), ipAddress: z.string().optional() }).parse(request.body);
    const document = await prisma.termsDocument.findUnique({ where: { id: input.documentId } });
    if (!document) throw new HttpError(404, 'Terms document not found');
    await prisma.termsAcceptance.upsert({
      where: { userId_termsDocumentId: { userId: request.auth!.userId, termsDocumentId: document.id } },
      update: { acceptedAt: new Date(), ipAddress: input.ipAddress ?? request.ip },
      create: { userId: request.auth!.userId, termsDocumentId: document.id, ipAddress: input.ipAddress ?? request.ip },
    });
    await auditLog({ userId: request.auth!.userId, action: 'ACCEPT_TERMS', entity: 'TermsDocument', entityId: document.id, metadata: { version: document.version }, ipAddress: request.ip });
    response.status(201).json({ success: true, message: 'Terms accepted', data: null });
  } catch (error) { next(error); }
});

router.post('/homework/:id/submissions', requireRole('FAMILY'), async (request: AuthRequest, response, next) => {
  try {
    const input = z.object({ studentId: z.string(), content: z.string().optional() }).parse(request.body);
    const family = await prisma.family.findUniqueOrThrow({ where: { userId: request.auth!.userId } });
    const student = await prisma.student.findFirst({ where: { id: input.studentId, familyId: family.id } });
    if (!student) throw new HttpError(403, 'Student not found');
    const submission = await prisma.homeworkSubmission.create({ data: { homeworkId: routeParam(request, 'id'), studentId: student.id, content: input.content } });
    response.status(201).json({ success: true, message: 'Homework submitted', data: submission });
  } catch (error) { next(error); }
});

router.put('/homework/submissions/:id/grade', requireRole('TUTOR'), async (request: AuthRequest, response, next) => {
  try {
    const input = z.object({ grade: z.string().min(1), feedback: z.string().optional() }).parse(request.body);
    const tutor = await prisma.tutor.findUniqueOrThrow({ where: { userId: request.auth!.userId } });
    const submission = await prisma.homeworkSubmission.findFirst({
      where: { id: routeParam(request, 'id'), homework: { lesson: { engagement: { tutorId: tutor.id } } } },
    });
    if (!submission) throw new HttpError(404, 'Submission not found');
    const updated = await prisma.homeworkSubmission.update({ where: { id: submission.id }, data: { grade: input.grade, feedback: input.feedback } });
    response.json({ success: true, message: 'Submission graded', data: updated });
  } catch (error) { next(error); }
});

router.post('/engagements/:id/series', requireRole('TUTOR'), async (request: AuthRequest, response, next) => {
  try {
    const input = z.object({
      title: z.string().min(2),
      startAt: z.string().datetime(),
      endAt: z.string().datetime(),
      recurrenceRule: z.string().min(1).max(500),
      timezone: z.string().default('UTC'),
    }).parse(request.body);
    const tutor = await prisma.tutor.findUniqueOrThrow({ where: { userId: request.auth!.userId } });
    const engagement = await prisma.tutoringEngagement.findFirst({ where: { id: routeParam(request, 'id'), tutorId: tutor.id } });
    if (!engagement) throw new HttpError(404, 'Engagement not found');
    const series = await prisma.lessonSeries.create({ data: { engagementId: engagement.id, title: input.title, startAt: new Date(input.startAt), endAt: new Date(input.endAt), recurrenceRule: input.recurrenceRule, timezone: input.timezone } });
    response.status(201).json({ success: true, message: 'Recurring lesson series created', data: series });
  } catch (error) { next(error); }
});

router.post('/admin/tutor-payouts', requireRole('SYSTEM_ADMIN'), async (request: AuthRequest, response, next) => {
  try {
    const input = z.object({ tutorId: z.string(), amount: z.number().positive(), status: z.enum(['PENDING', 'PROCESSING', 'PAID', 'FAILED']).default('PENDING') }).parse(request.body);
    const tutor = await prisma.tutor.findUnique({ where: { id: input.tutorId } });
    if (!tutor) throw new HttpError(404, 'Tutor not found');
    const payout = await prisma.$transaction(async (tx) => {
      const created = await tx.tutorPayout.create({ data: { tutorId: tutor.id, amount: input.amount, status: input.status, processedAt: input.status === 'PAID' ? new Date() : null } });
      await tx.auditLog.create({ data: { userId: request.auth!.userId, action: 'CREATE_TUTOR_PAYOUT', entity: 'TutorPayout', entityId: created.id, metadata: JSON.stringify({ amount: input.amount }) } });
      return created;
    });

    router.post('/admin/sms/test', requireRole('SYSTEM_ADMIN'), async (request, response, next) => {
      try {
        const input = z.object({ to: z.string().min(5), message: z.string().min(1).max(160) }).parse(request.body);
        const sent = await sendSms(input.to, input.message);
        if (!sent) throw new HttpError(503, 'SMS provider is not configured');
        response.json({ success: true, message: 'SMS sent', data: null });
      } catch (error) { next(error); }
    });

    router.get('/admin/reports/payments.csv', requireRole('SYSTEM_ADMIN'), async (_request, response, next) => {
      try {
        const payments = await prisma.payment.findMany({ include: { family: { include: { user: true } } }, orderBy: { createdAt: 'desc' } });
        const rows = [
          'id,createdAt,amount,currency,status,method,familyEmail',
          ...payments.map((payment) => [
            payment.id,
            payment.createdAt.toISOString(),
            payment.amount.toString(),
            payment.currency,
            payment.status,
            payment.method,
            `"${payment.family.user.email.replaceAll('"', '""')}"`,
          ].join(',')),
        ];
        response.setHeader('Content-Type', 'text/csv');
        response.setHeader('Content-Disposition', 'attachment; filename="payments.csv"');
        response.send(rows.join('\n'));
      } catch (error) { next(error); }
    });

    router.get('/admin/reports/payments.pdf', requireRole('SYSTEM_ADMIN'), async (_request, response, next) => {
      try {
        const payments = await prisma.payment.findMany({ include: { family: { include: { user: true } } }, orderBy: { createdAt: 'desc' }, take: 500 });
        response.setHeader('Content-Type', 'application/pdf');
        response.setHeader('Content-Disposition', 'attachment; filename="payments.pdf"');
        const document = new PDFDocument({ margin: 36 });
        document.pipe(response);
        document.fontSize(18).text('Melihik Tutor - Payment Report');
        document.moveDown();
        payments.forEach((payment) => {
          document.fontSize(10).text(`${payment.createdAt.toISOString()} | ${payment.family.user.email} | ${payment.amount} ${payment.currency} | ${payment.status}`);
        });
        document.end();
      } catch (error) { next(error); }
    });
    response.status(201).json({ success: true, message: 'Tutor payout created', data: payout });
  } catch (error) { next(error); }
});

export default router;
