# TODO

## Frontend

- Re-test layouts in Telegram on iOS and Android.
- Check all supported languages for nav, selects, buttons, and long labels.
- Polish empty, loading, and error states.
- Re-test profile pet edit/delete UX with multiple pets.
- Re-test PDF export inside Telegram WebView.

## Backend

- Add focused tests for PDF report content.
- Add tests for multi-pet ownership and active pet edge cases.
- Review payment webhook idempotency under duplicate Telegram updates.
- Consider moving reminder scheduling to a dedicated worker if traffic grows.
- Keep API response shapes stable unless frontend migration is planned.

## Deployment

- Confirm Render env vars match `.env.example`.
- Confirm Netlify `VITE_API_URL` points to the Frankfurt Render backend.
- Confirm Telegram webhook uses the current backend URL and webhook secret.
- Keep deploy commands using env vars, not inline secrets.
- Run secret scans before commits.

## Later

- External cron or worker for reminders.
- Full multi-pet analytics.
- Better production monitoring and alerting.
- Automated browser visual regression checks.
