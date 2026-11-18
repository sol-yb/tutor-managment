# System architecture

The frontend and backend are separate TypeScript applications. The backend owns authentication, authorization, validation, business logic, and Prisma persistence. The frontend consumes REST endpoints and must never be treated as the security boundary.

The initial backend endpoint is `POST /api/auth/login`; protected domain routes should use `requireAuth` and `requireRole`.
