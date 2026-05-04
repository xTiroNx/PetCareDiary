# Stack

PetCare Diary is a Telegram Mini App with a React frontend, Node.js backend, PostgreSQL database, Telegram Bot API integrations, and production deploys on Netlify and Render.

## Frontend

- React 19
- Vite
- TypeScript
- TailwindCSS
- React Router
- Zustand
- TanStack Query
- Telegram WebApp bridge through `window.Telegram.WebApp`

## Backend

- Node.js
- TypeScript
- Express
- PostgreSQL
- Prisma ORM
- Zod
- PDFKit
- Telegram Bot API

## Infrastructure

- Frontend: Netlify, `https://petcare-diary.netlify.app`
- Backend: Render Frankfurt, `https://petcare-diary-api-frankfurt.onrender.com`
- Database: Render PostgreSQL
- Frontend config: `netlify.toml`
- Backend config: `render.yaml`

## Commands

```sh
npm install
npm run typecheck
npm run build
npm run security:smoke
npm run prisma:generate
npm run prisma:migrate
npm run prisma:migrate:deploy
```
