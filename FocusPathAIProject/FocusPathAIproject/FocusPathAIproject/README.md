# FocusPath AI (Study & Career Assistant)

Full-stack web app: React + Tailwind frontend, Node/Express backend, Prisma ORM, OpenAI integration, and Socket.io realtime chat/updates.

## Quick Start (Local)

1. Install dependencies:
   ```
   npm install
   ```
   (runs backend/frontend installs via sub-scripts)

2. Environment:
   - Copy `backend/.env.example` to `backend/.env`.
   - Set `DATABASE_URL` (Postgres recommended), `JWT_SECRET`, `OPENAI_API_KEY` (optional), `FRONTEND_ORIGIN`.

3. Database (Postgres):
   ```
   npm --prefix backend run prisma:generate:postgres
   npm --prefix backend run prisma:migrate:postgres
   ```

4. Run:
   ```
   npm run dev
   ```
   Backend: http://localhost:3001 | Frontend: http://localhost:5173

## Deployment (Render.com)

1. Connect repo https://github.com/nagapurisatwika/FocusPathAI_project.git to Render.
2. **Service Type: Web Service** | **Root Directory: .** (monorepo)
3. **Build Command:** `npm install && npm run build` (builds frontend)
4. **Start Command:** `npm start` (runs backend via root script)
5. **Environment Vars:** DATABASE_URL (Render Postgres), JWT_SECRET, OPENAI_API_KEY, FRONTEND_ORIGIN=your-render-frontend-url.
6. **Node Version:** 20+.

Frontend deploy: Static Site on Render (point to `/frontend/dist` after build).

## Credentials

`OPENAI_API_KEY` enables AI features (study plans, career advice).

## Realtime

Socket.io for live chat/dashboard updates.

## SQLite Notes (Local)

Use `prisma:sqlite:*` scripts, but Postgres preferred.
