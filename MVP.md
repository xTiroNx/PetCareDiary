# MVP

Production MVP for cat and dog owners to track pet care inside Telegram.

## Implemented

- Telegram Mini App frontend deployed to Netlify.
- Backend API deployed to Render.
- PostgreSQL schema and migrations managed with Prisma.
- Telegram initData auth verified on the backend.
- New users receive a trial period.
- Access middleware protects pets, diary, reminders, reports, payments, and admin routes.
- Multi-pet support with active pet selection and profile management.
- Diary entries for feeding, symptoms, medicines, weight, and notes.
- Reminder CRUD and Telegram reminder delivery.
- PDF reports generated from real database records.
- Telegram Stars invoice creation.
- Telegram webhook confirmation for `pre_checkout_query` and `successful_payment`.
- Payment hardening for ownership, idempotency, and duplicate charge IDs.
- Admin panel for granting or revoking paid access by Telegram ID.
- Mobile Telegram-friendly UI with dark theme support and safe-area handling.

## Safety Rules

- Never trust user IDs from the frontend.
- Backend derives the current user only from verified Telegram initData.
- Paid access is granted only after Telegram webhook confirmation.
- Real secrets stay only in Render env vars, Netlify env vars, or local ignored `.env` files.
- Do not paste tokens, database URLs, or API keys into chat.

## Medical Disclaimer

PetCare Diary does not replace veterinary care. If symptoms repeat or the pet's condition worsens, contact a veterinarian.
