# API documentation

## `GET /health`

Returns `{ "status": "ok" }`.

## `POST /api/auth/login`

Accepts `{ "email": string, "password": string }` and returns a short-lived access token plus the authenticated user's safe public fields.
