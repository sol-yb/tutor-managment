import nodemailer from 'nodemailer';
import { env } from '../config/env.js';

export async function sendEmail(to: string, subject: string, text: string) {
  if (!env.SMTP_HOST || !env.SMTP_PORT || !env.EMAIL_FROM) return false;
  const transport = nodemailer.createTransport({
    host: env.SMTP_HOST,
    port: env.SMTP_PORT,
    secure: env.SMTP_PORT === 465,
    auth: env.SMTP_USER ? { user: env.SMTP_USER, pass: env.SMTP_PASSWORD } : undefined,
  });
  await transport.sendMail({ from: env.EMAIL_FROM, to, subject, text });
  return true;
}
