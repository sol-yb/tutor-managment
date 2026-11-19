# Production deployment

1. Use strong unique values for `DATABASE_URL`, `JWT_ACCESS_SECRET`, `JWT_REFRESH_SECRET`, SMTP, Chapa, storage, and SMS credentials.
2. Apply migrations:
   ```text
   cd backend
   npx prisma migrate deploy
   npm run prisma:seed
   ```
3. Build the applications:
   ```text
   cd frontend && npm run build
   cd ../backend && npm run build
   ```
4. Serve PostgreSQL with backups and encrypted storage.
5. Terminate TLS at a reverse proxy and set `NODE_ENV=production`.
6. Configure Chapa webhook, SMTP sender, and private S3-compatible storage.
7. Restrict the private tutor-document directory and never serve it as public static content.
8. Run `scripts\backup-postgres.ps1` on a scheduled task and retain encrypted copies off-site.
9. Use container health checks and central log collection. Caddy provides automatic HTTPS when `DOMAIN` is set to a public hostname.
