# Mini CMS

A multilingual CMS: Laravel backend + React (SPA) admin panel. Lets you define
dynamic "Modules" (content types) with their own field schema, and manage
multilingual "Entries" on top of them.

It is built to feed client websites for a one-person web agency — **one
installation per client site**, with the public pages rendered server-side in
Blade from this same application. It is therefore **not headless**: the site and
the admin panel ship together. See [`docs/TASKS.md`](docs/TASKS.md) → **The
MVP** for the goal and the definition of done.

## Stack

- **Backend:** Laravel 13 / PHP 8.3+
- **Auth:** Laravel Sanctum (session-based, SPA)
- **Frontend:** React 19 + Vite
- **HTTP:** Axios
- **DB:** MySQL (`mini_cms`), served by Laragon
- **Rich text:** Tiptap
- **Styling:** Tailwind CSS 4

## Running (dev)

This project is served by **Laragon's Apache**, not `php artisan serve`.
Laragon auto-creates the `mini-cms.test` vhost pointing at `public/`.

1. Start Laragon → **Start All** (Apache + MySQL).
2. In the project folder:

```bash
composer run dev   # queue worker + vite dev server
```

3. Open **http://mini-cms.test/admin**

Seeded account: `test@example.com` / `password`

## Tests

Two suites, run separately:

```bash
php artisan test   # backend: authorization, validation, schema, pagination
npm test           # frontend helpers in resources/js/lib
```

`npm run test:watch` reruns on change. The JS side covers the pure helpers
only — API error handling, pagination metadata and rich-text documents. It
does not render components, so anything about the forms themselves is still
verified by running the app.

After changing the field types in `SchemaRuleBuilder` or
`RichTextDocument`, regenerate the copy the frontend imports:

```bash
php artisan schema:sync-field-types
```

The test suite fails with that instruction if you forget.

First-time setup only:

```bash
composer install
npm install
php artisan key:generate
php artisan migrate --seed
php artisan storage:link
```

> **`--seed` currently fails.** `DatabaseSeeder` uses `User` without importing
> it, so seeding dies with a class-not-found error before writing anything.
> That is `TASKS.md` #47 and the fix is one `use` statement. Until it lands,
> run `php artisan migrate` and create the account by hand.

### Gotchas

- **Use `http://mini-cms.test`, not `localhost:8000`.** `.env` sets
  `SANCTUM_STATEFUL_DOMAINS=localhost,127.0.0.1,mini-cms.test` — no `:8000`
  entry — so Sanctum won't treat a `php artisan serve` origin as stateful
  and login will fail with 401/419. `APP_URL` and `Storage::url()` (upload
  URLs) also point at `mini-cms.test`. To use `artisan serve` anyway, add
  `localhost:8000` to `SANCTUM_STATEFUL_DOMAINS` and update `APP_URL`.
- **`php artisan pail` is not in the `dev` script.** It needs the `pcntl`
  PHP extension, which doesn't exist on Windows; it used to crash and take
  the whole `concurrently` group down with it via `--kill-others`. Read
  logs from `storage/logs/laravel.log` instead.
- `npm run dev` (Vite, port 5173) only serves JS/CSS assets — it is *not*
  the application server. Apache serves the app.

## Documentation

- [`docs/ARCHITECTURE.md`](docs/ARCHITECTURE.md) — how the system is built (stack, data model, request flow, frontend).
- [`docs/TASKS.md`](docs/TASKS.md) — what's left. **Read its MVP section
  first**: it carries the definition of done and the product decisions that
  govern everything else. The numbered findings below it are mostly recorded
  rather than scheduled.
- [`docs/CHANGELOG.md`](docs/CHANGELOG.md) — what has been done and *why*.
  Read this before changing something that looks odd; most of it was a
  decision, and the reasoning is what to argue with.
