import request from 'supertest';
import { describe, expect, it } from 'vitest';
import { app } from './app.js';

describe('Melihik Tutor API', () => {
  it('returns a healthy status', async () => {
    const response = await request(app).get('/health');
    expect(response.status).toBe(200);
    expect(response.body.success).toBe(true);
  });

  it('returns public subjects', async () => {
    const response = await request(app).get('/api/v1/subjects');
    expect(response.status).toBe(200);
    expect(response.body.success).toBe(true);
  });

  it('rejects protected routes without a token', async () => {
    const response = await request(app).get('/api/v1/family/profile');
    expect(response.status).toBe(401);
  });

  it('rejects invalid webhook signatures', async () => {
    const response = await request(app)
      .post('/api/v1/payments/chapa/webhook')
      .set('x-chapa-signature', 'invalid')
      .send({ tx_ref: 'test-reference', status: 'success' });
    expect([401, 503]).toContain(response.status);
  });

  it('rejects family routes for unauthenticated users', async () => {
    const response = await request(app).get('/api/v1/family/students');
    expect(response.status).toBe(401);
  });
});
