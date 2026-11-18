import 'dotenv/config';
import bcrypt from 'bcryptjs';
import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

async function main() {
  const adminEmail = process.env.ADMIN_EMAIL;
  const adminPassword = process.env.ADMIN_PASSWORD;
  if (!adminEmail || !adminPassword || adminPassword.length < 12) {
    throw new Error('ADMIN_EMAIL and ADMIN_PASSWORD (minimum 12 characters) are required for seeding');
  }

  const passwordHash = await bcrypt.hash(adminPassword, 12);
  await prisma.user.upsert({
    where: { email: adminEmail.toLowerCase() },
    update: {},
    create: { email: adminEmail.toLowerCase(), passwordHash, fullName: 'System Administrator', role: 'SYSTEM_ADMIN' },
  });

  await prisma.subject.createMany({
    data: ['Mathematics', 'English', 'Physics', 'Chemistry', 'Biology'].map((name) => ({ name })),
    skipDuplicates: true,
  });
  await prisma.gradeLevel.createMany({
    data: ['Primary', 'Middle School', 'Secondary School', 'Preparatory'].map((name) => ({ name })),
    skipDuplicates: true,
  });
  await prisma.systemSetting.createMany({
    data: [
      { key: 'platform.name', value: 'Melihik Tutor' },
      { key: 'platform.currency', value: 'ETB' },
      { key: 'platform.defaultLessonDurationMinutes', value: '60' },
      { key: 'platform.commissionRate', value: '15.00' },
    ],
    skipDuplicates: true,
  });
}

main().catch((error) => { console.error(error); process.exitCode = 1; }).finally(() => prisma.$disconnect());
