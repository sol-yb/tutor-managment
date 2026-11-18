# Database design

The initial schema contains users and hashed refresh-session records. User roles are limited to `SYSTEM_ADMIN`, `TUTOR`, and `FAMILY`. Domain models for tutor applications, students, requests, lessons, payments, and notifications should be added through reviewed Prisma migrations.
