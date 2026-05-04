# Deployment

This project uses Netlify for the Telegram Mini App frontend and Render for the Node.js backend.

Do not commit real secrets. Keep real values only in Netlify environment variables, Render environment variables, or a local `.env` file that is ignored by Git.

## Required Secrets

Use `.env.example` only as a checklist. Leave it without real values in Git.

- `RENDER_API_KEY`: local-only token for Render API automation.
- `RENDER_SERVICE_ID`: Render backend service id, for example the id shown in the Render dashboard URL.
- `DATABASE_URL`: PostgreSQL connection string. In Render, prefer the database-linked environment variable.
- `BOT_TOKEN`: Telegram bot token used by the backend.
- `TELEGRAM_BOT_TOKEN`: optional local alias for scripts/tools; do not expose it in frontend code.
- `BOT_USERNAME`: Telegram bot username without `@`.
- `TELEGRAM_WEBHOOK_SECRET`: long random secret for Telegram webhook verification.
- `ADMIN_TELEGRAM_IDS`: comma-separated Telegram numeric ids for app admins.
- `FRONTEND_URL`: production frontend URL.
- `VITE_API_URL`: public backend API URL used at frontend build time.

## Backend Deploy On Render

1. Open Render dashboard and select the backend service.
2. Set environment variables in Render:
   - `DATABASE_URL`
   - `BOT_TOKEN`
   - `BOT_USERNAME`
   - `TELEGRAM_WEBHOOK_SECRET`
   - `ADMIN_TELEGRAM_IDS`
   - `FRONTEND_URL`
   - `NODE_ENV=production`
   - `REMINDER_SCHEDULER_ENABLED=true`
   - `REMINDER_POLL_INTERVAL_MS=60000`
   - payment/trial values if different from defaults.
3. Confirm build command:
   ```sh
   npm ci --include=dev && npm run prisma:generate && npm --workspace apps/backend run build && npm run prisma:migrate:deploy
   ```
4. Confirm start command:
   ```sh
   npm --workspace apps/backend run start
   ```
5. Deploy latest commit from the Render dashboard, or use Render API locally with environment variables:
   ```sh
   curl -X POST \
     -H "Authorization: Bearer $RENDER_API_KEY" \
     -H "Accept: application/json" \
     -H "Content-Type: application/json" \
     "https://api.render.com/v1/services/$RENDER_SERVICE_ID/deploys" \
     -d '{"clearCache":"do_not_clear"}'
   ```
6. Verify backend:
   ```sh
   curl https://your-render-service.onrender.com/health
   ```
   Expected response:
   ```json
   {"ok":true}
   ```

## Frontend Deploy On Netlify

1. Set Netlify environment variable:
   - `VITE_API_URL=https://your-render-service.onrender.com`
2. Confirm Netlify build settings:
   - Build command:
     ```sh
     npm --workspace apps/frontend run build
     ```
   - Publish directory:
     ```sh
     apps/frontend/dist
     ```
3. Keep SPA redirect from `netlify.toml`:
   ```toml
   [[redirects]]
     from = "/*"
     to = "/index.html"
     status = 200
   ```
4. Deploy latest commit from Netlify dashboard or through the Netlify connector/CLI.
5. Verify frontend:
   ```sh
   curl https://your-netlify-site.netlify.app
   ```

## Telegram Setup After Deploy

1. In BotFather, set the Mini App URL to the Netlify URL.
2. Set Telegram webhook to the Render backend URL:
   ```sh
   curl "https://api.telegram.org/bot$BOT_TOKEN/setWebhook" \
     -d "url=https://your-render-service.onrender.com/api/telegram/webhook" \
     -d "secret_token=$TELEGRAM_WEBHOOK_SECRET"
   ```
3. Do not paste bot tokens into chat or frontend code.

## Security Checklist

- Rotate any token that was pasted into chat, terminal logs, screenshots, or issue comments.
- Keep `.env`, `.env.local`, and `.env.*.local` out of Git.
- Never store `BOT_TOKEN`, `TELEGRAM_BOT_TOKEN`, `RENDER_API_KEY`, or `DATABASE_URL` in frontend source.
- Use Netlify env vars for frontend build values and Render env vars for backend runtime values.
