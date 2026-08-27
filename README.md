# Mini CMS

A lightweight headless-ish CMS: Laravel API backend + React (SPA) admin
panel. Lets you define dynamic "Modules" (content types) with their own
field schema, and manage multilingual "Entries" on top of them.

## Stack

- **Backend:** Laravel 13 / PHP 8.3+
- **Auth:** Laravel Sanctum (session-based, SPA)
- **Frontend:** React 19 + Vite
- **HTTP:** Axios
- **DB:** SQLite (dev)
- **Rich text:** Tiptap
- **Styling:** Tailwind CSS 4

## Running (dev)

```bash
composer install
npm install

cp .env.example .env   # if you don't already have a .env
php artisan key:generate
php artisan migrate --seed

composer run dev   # runs server + queue + logs + vite together
```

Admin panel: `http://localhost:8000/admin`
Seeded account: `test@example.com` / `password`

## Documentation

- [`docs/ARCHITECTURE.md`](docs/ARCHITECTURE.md) — how the system is built (stack, data model, request flow, frontend).
- [`docs/TASKS.md`](docs/TASKS.md) — what's left to reach an MVP, in priority order.
