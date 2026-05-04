# Open Tasks

Use this file as the shared task list across split Codex chats.

## Done Recently

- Frontend deployed to Netlify.
- Backend deployed to Render Frankfurt.
- PDF export frontend no longer opens/downloads two files.
- Backend PDF report uses real database records.
- Multi-pet profile management exists.
- Mobile date/time fields avoid native iOS date/time controls.
- Reminder delivery works through Telegram bot messages.
- Safe deployment docs and `.env.example` were added.

## Frontend

- Re-test mobile layouts on iOS Telegram and Android Telegram.
- Check all six languages for nav, selects, buttons, and long labels.
- Improve empty/loading/error states where they still feel rough.
- Verify profile pet edit/delete UX with multiple pets.
- Re-test PDF export flow in Telegram WebView.

## Backend

- Add focused tests for PDF report content.
- Add tests for multi-pet ownership and active pet edge cases.
- Review payment webhook idempotency under duplicate Telegram updates.
- Consider moving reminder scheduler to a dedicated worker if traffic grows.
- Keep API response shapes stable unless frontend migration is planned.

## Deployment

- Rotate any token that was pasted into chat.
- Confirm Render env vars match `.env.example` checklist.
- Confirm Netlify `VITE_API_URL` points to the Frankfurt Render backend.
- Confirm Telegram webhook uses the current backend URL and webhook secret.
- Keep deploy commands using env vars, not inline secrets.

## Security

- Run secret scans before commits.
- Confirm `.env`, `.env.local`, and `.env.*.local` are ignored.
- Review admin endpoints and logs for sensitive data exposure.
- Check rate limits on auth, payments, reports, and admin routes.
- Confirm expired users cannot access protected diary APIs.

## Deferred

- True external cron/worker for reminders.
- Full multi-pet analytics.
- Better PDF layout and localization.
- Automated browser visual regression checks.
- Production monitoring and alerting.
