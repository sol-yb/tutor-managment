import cookieParser from 'cookie-parser';
import cors from 'cors';
import express from 'express';
import helmet from 'helmet';
import morgan from 'morgan';
import rateLimit from 'express-rate-limit';
import swaggerJsdoc from 'swagger-jsdoc';
import swaggerUi from 'swagger-ui-express';
import { env } from './config/env.js';
import authRoutes from './routes/auth.js';
import domainRoutes from './routes/domain.js';
import { errorHandler, notFound } from './middleware/error.js';

export const app = express();
app.use(helmet());
app.use(cors({ origin: env.FRONTEND_ORIGIN, credentials: true }));
app.use(express.json({ limit: '1mb' }));
app.use(cookieParser());
app.use(morgan(process.env.NODE_ENV === 'production' ? 'combined' : 'dev'));
app.use('/api/v1/auth', rateLimit({ windowMs: 15 * 60 * 1000, limit: 30 }), authRoutes);

const swaggerSpec = swaggerJsdoc({
  definition: {
    openapi: '3.0.0',
    info: { title: 'Melihik Tutor API', version: '1.0.0' },
    servers: [{ url: '/api/v1' }],
    components: {
      securitySchemes: {
        bearerAuth: { type: 'http', scheme: 'bearer', bearerFormat: 'JWT' },
      },
    },
    security: [{ bearerAuth: [] }],
    paths: {
      '/health': { get: { summary: 'Health check', security: [], responses: { 200: { description: 'Healthy' } } } },
      '/auth/register': { post: { summary: 'Register family or tutor', security: [] } },
      '/auth/login': { post: { summary: 'Login', security: [] } },
      '/auth/refresh': { post: { summary: 'Rotate refresh session', security: [] } },
      '/subjects': { get: { summary: 'List subjects', security: [] } },
      '/tutors': { get: { summary: 'Search approved tutors', security: [] } },
      '/family/students': { get: { summary: 'List family students' }, post: { summary: 'Create student' } },
      '/requests': { get: { summary: 'List visible requests' }, post: { summary: 'Create tutoring request' } },
      '/notifications': { get: { summary: 'List notifications' } },
    },
  },
  apis: [],
});
app.use('/api/docs', swaggerUi.serve, swaggerUi.setup(swaggerSpec));
app.use('/api/v1', domainRoutes);
app.get('/health', (_request, response) => response.json({ success: true, message: 'Healthy', data: { status: 'ok' } }));
app.use(notFound);
app.use(errorHandler);
