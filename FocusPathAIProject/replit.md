# FocusPath AI — Study & Career Assistant

A full-stack AI-powered productivity app to help users manage studies and career development.

## Architecture

- **Frontend**: React 19 + Vite, Tailwind CSS, Zustand state management, Socket.io client
- **Backend**: Node.js + Express 5, Prisma ORM v7 (PostgreSQL), Socket.io, OpenAI/Groq AI integration
- **Database**: Replit PostgreSQL (managed via Prisma migrations)
- **Auth**: JWT-based authentication (+ Google OAuth via Passport.js)

## Project Structure

```
FocusPathAIproject/FocusPathAIproject/
├── backend/
│   ├── src/
│   │   ├── config/        # env, prisma client setup
│   │   ├── middleware/    # auth (JWT), error handler
│   │   ├── routes/        # auth, tasks, studyPlans, analytics, ai, habits, notes
│   │   ├── services/      # OpenAI/Groq AI service, analytics service
│   │   ├── socket/        # Socket.io real-time setup
│   │   └── index.js       # Express app entry point
│   └── prisma/
│       ├── schema.postgres.prisma   # Primary Postgres schema
│       ├── prisma.config.ts         # Prisma v7 config (reads DATABASE_URL)
│       └── migrations/              # Applied DB migrations
├── frontend/
│   ├── src/
│   │   ├── components/    # Reusable UI components
│   │   ├── pages/         # Dashboard, Analytics, Chat, Tasks, Career, Notes, Habits
│   │   └── store/         # Zustand stores
│   └── vite.config.js     # Proxies /api and /socket.io to backend :3000
└── package.json           # Root scripts using concurrently
```

## Ports

- **Frontend (Vite)**: port 5000 (dev only, proxied to backend at :3000)
- **Backend (Express)**: port 3000

## Workflow

- **Start application**: `cd FocusPathAIproject/FocusPathAIproject && npm run dev`
  - Starts both frontend (Vite, port 5000) and backend (nodemon, port 3000) concurrently

## Environment Variables

| Variable | Where | Notes |
|---|---|---|
| `DATABASE_URL` | Secret (Replit-managed) | Replit PostgreSQL connection string |
| `JWT_SECRET` | Shared env | JWT signing secret |
| `OPENAI_API_KEY` | Secret (optional) | Enables real AI features |
| `GROQ_API_KEY` | Secret (optional) | Alternative AI provider |
| `BACKEND_PORT` | Shared env | Set to 3000 |
| `FRONTEND_ORIGIN` | Shared env | Replit dev domain URL |
| `NODE_ENV` | Shared env | development / production |
| `DEMO_MODE` | Shared env | "true" enables demo fallbacks when no AI key set |

## Database

- Uses Replit's built-in PostgreSQL
- Prisma v7 adapter-pg pattern (no `url` in schema file — configured in `prisma.config.ts`)
- Run migrations: `cd FocusPathAIproject/FocusPathAIproject/backend && PRISMA_SCHEMA_PATH=prisma/schema.postgres.prisma npx prisma migrate deploy`
- Generate client: `cd FocusPathAIproject/FocusPathAIproject/backend && PRISMA_SCHEMA_PATH=prisma/schema.postgres.prisma npx prisma generate`

## AI Features

Without an API key, the app runs in demo mode with smart fallbacks. To enable AI:
1. Add `OPENAI_API_KEY` or `GROQ_API_KEY` as a Replit Secret
2. Restart the workflow

## Deployment

- **Target**: VM (required for Socket.io WebSocket persistence)
- **Build**: Builds frontend, runs Prisma migrations & generates client
- **Run**: Serves the Node.js backend (which serves frontend static files from `/dist`)
