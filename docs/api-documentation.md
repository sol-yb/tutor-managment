# API documentation

The backend API is versioned under `/api/v1`. Swagger UI is available at `/api/docs`.

## Authentication

- `POST /api/v1/auth/register`
- `POST /api/v1/auth/login`
- `POST /api/v1/auth/refresh`
- `POST /api/v1/auth/logout`
- `GET /api/v1/auth/me`
- `POST /api/v1/auth/verify-email/confirm`
- `POST /api/v1/auth/password-reset/request`
- `POST /api/v1/auth/password-reset/confirm`

## Public

- `GET /api/v1/subjects`
- `GET /api/v1/grade-levels`
- `GET /api/v1/tutors`
- `GET /api/v1/tutors/:id`

## Family

- Family profile, student CRUD, payments, progress, requests, and reviews.

## Tutor

- Profile, application submission, private document upload/download, lessons, attendance, homework, progress reports, and earnings.

## Administrator

- Dashboard, tutor application review, subject management, assignments, support ticket management, settings, and reports.

All protected endpoints require `Authorization: Bearer <access-token>`. Refresh sessions use secure HTTP-only cookies. Mutating family and tutor requests enforce ownership on the backend.

## Added workflows

- `GET/PUT /api/v1/tutor/availability`
- `POST /api/v1/terms/accept`
- `POST /api/v1/homework/:id/submissions`
- `PUT /api/v1/homework/submissions/:id/grade`
- `POST /api/v1/engagements/:id/series`
- `POST /api/v1/admin/tutor-payouts`
- `POST /api/v1/payments/chapa/webhook`
- `GET /api/v1/admin/reports/payments.csv`
- `GET /api/v1/admin/reports/payments.pdf`

The S3-compatible document provider is optional; configured credentials enable private cloud storage while local private storage remains the fallback.

## `GET /health`

Returns `{ "status": "ok" }`.

## `POST /api/auth/login`

Accepts `{ "email": string, "password": string }` and returns a short-lived access token plus the authenticated user's safe public fields.
