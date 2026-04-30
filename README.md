# PetCare Diary Telegram Mini App

Production-ready MVP для владельцев кошек и собак: дневник кормления, симптомов, лекарств, веса, напоминания, отчеты и платный доступ через Telegram Stars.

## Stack

- Frontend: React, Vite, TypeScript, TailwindCSS, React Router, Zustand, TanStack Query, Telegram WebApp bridge.
- Backend: Node.js, TypeScript, Express, PostgreSQL, Prisma ORM, Zod, Telegram Bot API.
- Payments: Telegram Stars invoices via Bot API `createInvoiceLink`, currency `XTR`, webhook handling for `pre_checkout_query` and `message.successful_payment`.

## Project Structure

```text
petcare-diary-tma/
  apps/
    frontend/
      src/
        api/
        components/
        hooks/
        pages/
        store/
        utils/
    backend/
      src/
        config/
        prisma/
        routes/
        services/
        middlewares/
        utils/
  prisma/schema.prisma
  docker-compose.yml
  .env.example
```

## 1. Create a Telegram Bot

1. Open [@BotFather](https://t.me/BotFather).
2. Run `/newbot`.
3. Choose bot name and username.
4. Copy the bot token into `.env` as `BOT_TOKEN`.
5. Put the bot username into `.env` as `BOT_USERNAME`.

## 2. Connect Mini App URL

1. Deploy frontend to HTTPS, for example `https://petcare.example.com`.
2. In BotFather, use `/mybots`.
3. Select the bot, open Bot Settings / Menu Button or Web App settings.
4. Set the Mini App URL to your frontend URL.
5. Put the same URL into `.env` as `FRONTEND_URL`.

For local testing you need a public HTTPS tunnel for Telegram WebView, for example ngrok or Cloudflare Tunnel.

## 3. Configure Webhook

Backend must be reachable by HTTPS. Set the webhook:

```bash
curl "https://api.telegram.org/bot$BOT_TOKEN/setWebhook" \
  -d "url=https://your-api-domain.com/api/telegram/webhook" \
  -d "secret_token=$TELEGRAM_WEBHOOK_SECRET"
```

The webhook handles:

- `pre_checkout_query`: backend calls `answerPreCheckoutQuery`.
- `message.successful_payment`: backend verifies payload, marks `Payment` as `PAID`, grants monthly or lifetime access.

Access is never granted from the frontend invoice callback.
If `TELEGRAM_WEBHOOK_SECRET` is set, the backend rejects webhook requests without matching `X-Telegram-Bot-Api-Secret-Token`.

## 4. Environment

Copy `.env.example` to `.env` in the project root:

```bash
cp .env.example .env
```

Fill:

```env
BACKEND_PORT=3001
FRONTEND_URL=https://your-mini-app-domain.com
DATABASE_URL=postgresql://user:password@localhost:5432/petcare
BOT_TOKEN=your_telegram_bot_token
BOT_USERNAME=your_bot_username
TELEGRAM_WEBHOOK_SECRET=change_this_to_a_long_random_secret
ADMIN_TELEGRAM_IDS=123456789
MONTHLY_PRICE_STARS=199
LIFETIME_PRICE_STARS=1499
TRIAL_DAYS=3
```

`ADMIN_TELEGRAM_IDS` is a comma-separated list of Telegram numeric IDs that always have full access and can open `/admin` to grant or revoke user access. Example:

```env
ADMIN_TELEGRAM_IDS=123456789,987654321
```

For frontend local development you may also set:

```env
VITE_API_URL=http://localhost:3001
VITE_MOCK_INIT_DATA=only_for_development_generated_valid_init_data
```

`VITE_MOCK_INIT_DATA` must be a real signed Telegram initData string if you want backend auth to pass. The backend does not accept fake user IDs.

## 5. Run Locally

```bash
npm install
docker compose up -d
npm run prisma:generate
npm run prisma:migrate
npm run dev
```

Useful scripts:

```bash
npm run dev:frontend
npm run dev:backend
npm run build
npm run security:smoke
npm run prisma:studio
```

Frontend runs on `http://localhost:5173`, backend on `http://localhost:3001`.

## 6. Testing Telegram initData

The frontend sends `Telegram.WebApp.initData` to:

```http
POST /api/auth/telegram
```

All protected API requests include:

```http
X-Telegram-Init-Data: <initData>
```

Backend validation:

- Parses initData.
- Rebuilds Telegram data-check-string.
- Computes HMAC-SHA256 with secret derived from `BOT_TOKEN`.
- Compares the `hash`.
- Rejects `auth_date` older than 24 hours.
- Rejects oversized initData and `auth_date` too far in the future.
- Loads current user only from verified Telegram ID.

If opened outside Telegram in development, the UI shows a warning. Local mock auth works only with a valid signed `VITE_MOCK_INIT_DATA`.

## 7. Testing Telegram Stars Payments

Payment endpoint:

```http
POST /api/payments/create-invoice
Body: { "productType": "MONTHLY" | "LIFETIME" }
```

Backend creates a `Payment` row with status `PENDING`, then calls Telegram Bot API:

- Method: `createInvoiceLink`
- Currency: `XTR`
- `provider_token`: empty string for Stars
- Prices:
  - Monthly: `MONTHLY_PRICE_STARS`, default `199`
  - Lifetime: `LIFETIME_PRICE_STARS`, default `1499`

Frontend opens the returned invoice link via `Telegram.WebApp.openInvoice` when available.

Granting access:

- Monthly: adds 30 days. If access is already active, 30 days are added to current `accessUntil`.
- Lifetime: sets `lifetimeAccess = true`.
- Both happen only after webhook receives `successful_payment`.
- `pre_checkout_query` is approved only when the pending `Payment` payload exists and Stars amount/currency match.

Security smoke checks:

```bash
npm run security:smoke
```

This verifies strict request validation, webhook secret rejection and invalid Stars currency rejection.

Admin access management:

- Put your Telegram numeric ID into `ADMIN_TELEGRAM_IDS`.
- Open the Mini App from that Telegram account and go to Profile -> Admin panel.
- Search users by Telegram ID or view recent users.
- Admin actions are executed only by backend endpoint `PATCH /api/admin/users/:id/access` after valid Telegram initData and admin ID checks.
- Available actions: add 30 paid days, grant lifetime access, revoke paid access, or expire all access including trial.

## 8. Deployment

Frontend:

```bash
npm --workspace apps/frontend run build
```

Deploy `apps/frontend/dist` to an HTTPS static host.

Backend:

```bash
npm --workspace apps/backend run build
npm --workspace apps/backend run start
```

Deploy with PostgreSQL, set environment variables, run:

```bash
npm run prisma:migrate
```

Then configure Telegram webhook to your backend `/api/telegram/webhook`.

### Deploy backend to Render

The repository includes `render.yaml` for a Render Blueprint with:

- Web Service: `petcare-diary-api`
- PostgreSQL: `petcare-diary-db`
- Region: `frankfurt`
- Plan: `free` for test usage

In Render:

1. Open Dashboard -> New -> Blueprint.
2. Connect the repository and select `render.yaml`.
3. Fill secret env vars:

```env
BOT_TOKEN=your_telegram_bot_token
BOT_USERNAME=your_bot_username
ADMIN_TELEGRAM_IDS=your_numeric_telegram_id
```

`TELEGRAM_WEBHOOK_SECRET` is generated by Render. `DATABASE_URL` is linked from Render PostgreSQL.

Render build command:

```bash
npm ci && npm run prisma:generate && npm --workspace apps/backend run build && npm run prisma:migrate:deploy
```

Render start command:

```bash
npm --workspace apps/backend run start
```

After Render deploy, copy the backend HTTPS URL, for example:

```text
https://petcare-diary-api.onrender.com
```

Add it to Netlify environment variables:

```env
VITE_API_URL=https://petcare-diary-api.onrender.com
```

Redeploy frontend on Netlify, then set Telegram webhook:

```bash
curl "https://api.telegram.org/bot$BOT_TOKEN/setWebhook" \
  -d "url=https://petcare-diary-api.onrender.com/api/telegram/webhook" \
  -d "secret_token=$TELEGRAM_WEBHOOK_SECRET"
```

Render Free can sleep after inactivity, so it is good for testing demand. For real payments and active users, move to a paid Render instance or VPS.

## 9. MVP and TODO

Implemented MVP:

- Telegram initData auth with backend validation.
- 3-day trial creation for new users.
- Access middleware for pets, diary, reminders and reports.
- Telegram Stars invoice creation.
- Telegram webhook payment confirmation.
- Admin panel for granting/revoking 30-day and lifetime access by Telegram ID.
- Prisma models for users, pets, diary entries, reminders and payments.
- Mobile Telegram-friendly UI with dark theme support.
- Onboarding, dashboard, feeding, symptoms, medicines, weight, reminders, reports, profile and paywall.

TODO:

- PDF export for reports.
- Production cron or queue worker for Telegram reminder notifications.
- Webhook diagnostics and payment reconciliation tooling.
- Richer analytics and multi-pet switching.
- E2E test suite with Telegram initData fixtures.

## Medical Disclaimer

PetCare Diary не заменяет консультацию ветеринара. При повторяющейся рвоте, отказе от еды, боли, крови, сильной вялости или ухудшении состояния обратитесь к ветеринару.
