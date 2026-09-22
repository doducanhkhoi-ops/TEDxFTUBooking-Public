# TEDxFTU Booking System

A scalable, cloud-based event registration and real-time seat management platform built for TEDxFTU.

## 🚀 Live Demo
🌐 [https://tedxftubooking-main.onrender.com](https://tedxftubooking-main.onrender.com)

## 🛠️ Tech Stack
- **Frontend**: React, Vite, Tailwind CSS, shadcn/ui
- **Backend**: Node.js, Express, WebSocket (real-time seat updates)
- **Database**: Supabase (PostgreSQL) via Drizzle ORM
- **Deployment**: Render (CI/CD from GitHub)

## ✨ Key Features
- 🎟️ Real-time interactive seat map with WebSocket live updates
- 📋 Online ticket registration with form validation
- 🔐 Admin dashboard for seat & event management
- ⚡ ETag caching for optimized seat polling performance
- 🛡️ ACID-compliant booking logic to prevent double-booking

## ⚙️ Setup & Run Locally

### 1. Clone the repository
```bash
git clone https://github.com/doducanhkhoi-ops/TEDxFTUBooking-Showcase.git
cd TEDxFTUBooking-Showcase
```

### 2. Install dependencies
```bash
npm install
```

### 3. Configure environment variables
Copy `.env.example` to `.env` and fill in your values:
```bash
cp .env.example .env
```

### 4. Run development server
```bash
npm run dev
```

## 🔐 Environment Variables
See [`.env.example`](.env.example) for required variables.

| Variable | Description |
|---|---|
| `DATABASE_URL` | Supabase PostgreSQL connection string |
| `ADMIN_PASSCODE` | Admin dashboard access passcode |

## 📁 Project Structure
```
├── client/          # React frontend (Vite + Tailwind)
├── server/          # Express backend + WebSocket
│   ├── routes.ts    # API routes & admin auth
│   ├── storage.ts   # Database access layer
│   └── db.ts        # Drizzle ORM connection
├── shared/          # Shared schema (Drizzle + Zod)
└── package.json
```
