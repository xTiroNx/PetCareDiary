# Frontend Chat Handoff

Use this file to start a Codex chat focused only on frontend work.

## Scope

Work in `apps/frontend`. Avoid backend changes unless a frontend issue proves an API contract is wrong and the user approves backend work.

Frontend responsibilities:
- Telegram Mini App UI/UX.
- Mobile layout for iOS and Android Telegram WebView.
- Localized UI in Russian, English, Spanish, French, German, and Chinese.
- API client integration with `X-Telegram-Init-Data`.
- Paywall, dashboard, diary, reminders, report, profile, admin screens.

## Key Files

- `apps/frontend/src/App.tsx`
- `apps/frontend/src/api/client.ts`
- `apps/frontend/src/api/types.ts`
- `apps/frontend/src/components/`
- `apps/frontend/src/pages/`
- `apps/frontend/src/store/appStore.ts`
- `apps/frontend/src/utils/telegram.ts`
- `apps/frontend/src/utils/i18n.ts`
- `apps/frontend/src/index.css`

## Telegram UX Already Present

- `ready()` / `expand()`
- theme params and safe-area CSS variables
- BackButton integration
- haptic feedback helpers
- `showAlert` / `showConfirm`
- invoice opening
- fullscreen and add-to-home-screen helpers where supported

## Current Frontend Notes

- Date/time UI avoids native `date`, `time`, and `datetime-local` fields because they break layout in Telegram iOS WebView.
- PDF export frontend uses one path only: native file share when available, otherwise single file download.
- Multi-pet UI is managed from Profile and active pet is stored locally.
- Bottom navigation must fit long labels across all supported languages.

## Verification

Run:

```sh
npm --workspace apps/frontend run typecheck
npm --workspace apps/frontend run build
```

Manual checks:
- widths 320, 390, 430 px;
- `/diary`, `/symptoms`, `/reminders`, `/report`, `/profile`;
- all supported languages;
- Telegram Mini App open/reopen behavior.

## Constraints

- Do not put feature explanations inside the UI unless they are actual user-facing content.
- Keep mobile controls compact and readable on older phones.
- Do not add frontend secrets. Only `VITE_*` public variables may be used in frontend builds.
