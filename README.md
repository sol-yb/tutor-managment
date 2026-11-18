# Melihik Tutor

Full-stack home tutoring management platform.

## Foundation

- React, Vite, TypeScript, Tailwind CSS, and React Router frontend.
- Express, TypeScript, Prisma, PostgreSQL, JWT, bcrypt, Zod, and rate limiting backend.
- Initial RBAC roles: `SYSTEM_ADMIN`, `TUTOR`, and `FAMILY`.

## Run locally

1. Run `docker compose up -d`.
2. Copy `backend/.env.example` to `backend/.env` and set a strong `JWT_ACCESS_SECRET`.
3. Run `npm install` in both `frontend` and `backend`.
4. In `backend`, run `npm run prisma:generate`, `npm run prisma:migrate`, and `npm run prisma:seed`.
5. Run `npm run dev` in both application directories.
