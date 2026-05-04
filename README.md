# PetCare Diary

## Stack

PetCare Diary is a Telegram Mini App with a React frontend, Node.js backend, PostgreSQL database, Telegram Bot API integrations, and production deploys on Netlify and Render.

### Frontend

- React 19
- Vite
- TypeScript
- TailwindCSS
- React Router
- Zustand
- TanStack Query
- Telegram WebApp bridge through `window.Telegram.WebApp`

### Backend

- Node.js
- TypeScript
- Express
- PostgreSQL
- Prisma ORM
- Zod
- PDFKit
- Telegram Bot API

### Infrastructure

- Frontend: Netlify, `https://petcare-diary.netlify.app`
- Backend: Render Frankfurt, `https://petcare-diary-api-frankfurt.onrender.com`
- Database: Render PostgreSQL
- Frontend config: `netlify.toml`
- Backend config: `render.yaml`

## MVP

Production MVP for cat and dog owners to track pet care inside Telegram.

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

## TODO

- Re-test layouts in Telegram on iOS and Android.
- Check all supported languages for nav, selects, buttons, and long labels.
- Polish empty, loading, and error states.
- Re-test profile pet edit/delete UX with multiple pets.
- Re-test PDF export inside Telegram WebView.
- Add focused tests for PDF report content.
- Add tests for multi-pet ownership and active pet edge cases.
- Review payment webhook idempotency under duplicate Telegram updates.
- Consider moving reminder scheduling to a dedicated worker if traffic grows.
- Confirm Render env vars match `.env.example`.
- Confirm Netlify `VITE_API_URL` points to the Frankfurt Render backend.
- Confirm Telegram webhook uses the current backend URL and webhook secret.
- Keep deploy commands using env vars, not inline secrets.
- Run secret scans before commits.
