# Melihik Tutor requirements coverage

The supplied master specification is the product baseline. This repository now has the persistence foundation for the required workflows.

## Implemented in the database

- **Accounts and security:** `User`, `RefreshSession`, `EmailVerificationToken`, `PasswordResetToken`, `AuditLog`, roles, account status, and email verification state.
- **Tutor onboarding:** `Tutor`, `TutorQualification`, `TutorDocument`, `TutorApplication`, `TutorAvailability`, `TutorSubject`, and application workflow statuses.
- **Families and learning:** `Family`, `Student`, `StudentSubject`, `Subject`, and `GradeLevel`.
- **Requests and assignment:** `TutoringRequest`, `TutorAssignment`, and `TutoringEngagement`, including multiple assignment attempts and one engagement per request.
- **Lessons and progress:** `Lesson`, `Attendance`, `LessonNote`, `Homework`, `HomeworkSubmission`, and `ProgressReport`.
- **Finance:** `Payment`, `Invoice`, `PlatformCommission`, `TutorEarning`, and `TutorPayout`, using PostgreSQL `Decimal` fields for money.
- **Communication:** `Conversation`, `ConversationParticipant`, `Message`, `Notification`, `SupportTicket`, and `SupportMessage`.
- **Governance:** `TermsDocument`, `TermsAcceptance`, and `SystemSetting`.
- **Database delivery:** [initial migration](../backend/prisma/migrations/20261118200000_initial_platform/migration.sql) and seed data for the administrator, default subjects, grade levels, currency, lesson duration, and commission rate.

## Create the database

1. Copy `backend/.env.example` to `backend/.env`.
2. Set `DATABASE_URL` and a strong `ADMIN_EMAIL` plus `ADMIN_PASSWORD` (at least 12 characters).
3. Start PostgreSQL with `docker compose up -d`.
4. From `backend`, run:

   ```text
   npm run prisma:generate
   npm run prisma:migrate
   npm run prisma:seed
   ```

`prisma:migrate` creates the PostgreSQL tables from the committed migration. The seed is intentionally blocked unless administrator credentials are explicitly provided.

## Remaining application work

The schema is not a claim that every feature is already exposed in the UI. Controllers, services, routes, forms, Chapa/SMTP/S3 integrations, dashboards, scheduling rules, reports, and automated tests should be implemented against these models in the implementation order from the master specification.
