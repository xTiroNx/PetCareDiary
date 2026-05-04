# Security Chat Handoff

Use this file to start a Codex chat focused only on security.

## Scope

Review and harden auth, payments, secrets, admin access, webhook validation, rate limits, logs, and deployment safety. Avoid feature work unless it is necessary to close a security issue.

## High-Value Areas

- Telegram WebApp initData validation.
- `X-Telegram-Init-Data` handling.
- Paid access and Telegram Stars webhook idempotency.
- Admin grant/revoke access.
- Reminder delivery and bot permissions.
- PDF/report export limits.
- Secrets management and deployment logs.

## Secrets Policy

Never store or print real values for:
- `BOT_TOKEN`
- `TELEGRAM_BOT_TOKEN`
- `RENDER_API_KEY`
- `DATABASE_URL`
- `TELEGRAM_WEBHOOK_SECRET`

Use placeholders:
- `<BOT_TOKEN>`
- `<RENDER_API_KEY>`
- `<DATABASE_URL>`
- `<TELEGRAM_WEBHOOK_SECRET>`

Real values belong only in Render/Netlify dashboards or local ignored `.env`. Tokens pasted into chat, screenshots, terminal output, or tickets must be rotated before production.

## Current Security Model

- Telegram initData is validated server-side with bot token.
- `auth_date` is checked for freshness.
- Backend derives user identity from verified Telegram data.
- Protected APIs require auth middleware.
- Paid features require backend access checks.
- Payment access is granted only from Telegram webhook `successful_payment`.
- Webhook supports secret-token validation.
- Admin users are configured by Telegram numeric IDs.

## Checks To Run

```sh
npm run typecheck
npm run build
npm run security:smoke
```

Suggested scans:

```sh
rg -n --hidden --glob '!node_modules/**' 'RENDER_API_KEY|BOT_TOKEN|DATABASE_URL|TELEGRAM_WEBHOOK_SECRET'
git status --short --ignored .env .env.local
```

## Review Rules

- Do not output full secrets in findings.
- If a secret-like value is found, report the file and variable name only.
- Prefer fixes that reduce blast radius without changing product behavior.
- Any auth/payment change must include a manual test scenario.
