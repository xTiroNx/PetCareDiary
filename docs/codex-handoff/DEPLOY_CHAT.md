# Deploy Chat Handoff

Use this file to start a Codex chat focused only on deployment and operations.

## Scope

Handle Netlify frontend deploys, Render backend deploys, environment variables, Telegram webhook setup, and production verification. Do not change application code unless deployment fails because of a code/config bug and the user approves.

## Production Targets

- Frontend: `https://petcare-diary.netlify.app`
- Backend: `https://petcare-diary-api-frankfurt.onrender.com`
- Backend health: `https://petcare-diary-api-frankfurt.onrender.com/health`
- Render service id placeholder: `<RENDER_SERVICE_ID>`

## Secrets Policy

Never ask the user to paste secrets into chat. Real values belong only in:
- Render dashboard env vars;
- Netlify dashboard env vars;
- local ignored `.env`.

Use placeholders in docs and commands:
- `<RENDER_API_KEY>`
- `<BOT_TOKEN>`
- `<DATABASE_URL>`
- `<TELEGRAM_WEBHOOK_SECRET>`

Tokens pasted into chat must be rotated before production.

## Netlify Frontend Deploy

Netlify config:

```toml
[build]
  command = "npm --workspace apps/frontend run build"
  publish = "apps/frontend/dist"
```

Required Netlify env:

```text
VITE_API_URL=https://petcare-diary-api-frankfurt.onrender.com
```

Verify after deploy:

```sh
curl https://petcare-diary.netlify.app
```

## Render Backend Deploy

Render build command:

```sh
npm ci --include=dev && npm run prisma:generate && npm --workspace apps/backend run build && npm run prisma:migrate:deploy
```

Render start command:

```sh
npm --workspace apps/backend run start
```

Required Render env:

```text
NODE_ENV=production
FRONTEND_URL=https://petcare-diary.netlify.app
DATABASE_URL=<DATABASE_URL>
BOT_TOKEN=<BOT_TOKEN>
BOT_USERNAME=PetCareDiaryBot
TELEGRAM_WEBHOOK_SECRET=<TELEGRAM_WEBHOOK_SECRET>
ADMIN_TELEGRAM_IDS=<ADMIN_TELEGRAM_IDS>
REMINDER_SCHEDULER_ENABLED=true
REMINDER_POLL_INTERVAL_MS=60000
MONTHLY_PRICE_STARS=199
LIFETIME_PRICE_STARS=1499
TRIAL_DAYS=3
ENABLE_DEV_AUTH=false
```

Render API deploy command must read secrets from env:

```sh
curl -X POST \
  -H "Authorization: Bearer $RENDER_API_KEY" \
  -H "Accept: application/json" \
  -H "Content-Type: application/json" \
  "https://api.render.com/v1/services/$RENDER_SERVICE_ID/deploys" \
  -d '{"clearCache":"do_not_clear"}'
```

## Telegram Webhook

Set webhook only from a local shell or secure CI environment:

```sh
curl "https://api.telegram.org/bot$BOT_TOKEN/setWebhook" \
  -d "url=https://petcare-diary-api-frankfurt.onrender.com/api/telegram/webhook" \
  -d "secret_token=$TELEGRAM_WEBHOOK_SECRET"
```

Verify:

```sh
curl https://petcare-diary-api-frankfurt.onrender.com/health
```

Expected:

```json
{"ok":true}
```
