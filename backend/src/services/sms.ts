import { env } from '../config/env.js';

export async function sendSms(to: string, message: string) {
  if (!env.SMS_API_URL || !env.SMS_API_TOKEN) return false;
  const response = await fetch(env.SMS_API_URL, {
    method: 'POST',
    headers: { Authorization: `Bearer ${env.SMS_API_TOKEN}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ to, message, from: env.SMS_FROM }),
  });
  if (!response.ok) throw new Error('SMS provider request failed');
  return true;
}
