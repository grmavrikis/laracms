<?php

namespace App\Console\Commands;

use App\Models\Language;
use App\Services\StaticPages;
use Illuminate\Console\Command;
use Illuminate\Support\Facades\Http;

/**
 * Ask a running server whether it is actually serving the baked pages
 * (TASKS.md #97).
 *
 * **This exists because the failure is silent.** `public/.htaccess` covers
 * Apache; nginx needs a `try_files` in its server block, which an `.htaccess`
 * cannot reach, and neither can a test. A missing rewrite does not break
 * anything - every page is quietly served through PHP again, the site looks
 * completely normal, and the whole item has stopped working. Nobody would
 * find that by looking.
 *
 * So the check is made from outside: fetch a page that is known to be on disk
 * and read the answer's own account of where it came from.
 */
class DoctorPages extends Command
{
    protected $signature = 'pages:doctor {url? : The site to ask, default APP_URL}';

    protected $description = 'Check that the web server serves baked pages before PHP';

    public function handle(StaticPages $pages): int
    {
        $base = rtrim((string) ($this->argument('url') ?? config('app.url')), '/');

        $this->components->info('Asking ' . $base);

        if (!$pages->enabled())
        {
            $this->components->warn('Baking is off, so there is nothing to serve. Nothing below would mean anything.');

            return self::FAILURE;
        }

        $language = Language::query()->where('is_active', true)->orderByDesc('is_default')->first();

        if ($language === null)
        {
            $this->components->error('No active language, so the site has no pages.');

            return self::FAILURE;
        }

        $page = $language->code . '.html';

        // The local disk says nothing about another server. Asked about one,
        // this checks only what the answer itself reveals - the local copy may
        // be empty while the remote is baked correctly, or stale while the
        // remote has nothing at all.
        if ($this->argument('url') === null && !$pages->has($page))
        {
            $this->components->error($page . ' is not on disk. Run `php artisan pages:warm` first, then this.');

            return self::FAILURE;
        }

        // Asked before the request, because it is the one failure the answer
        // itself cannot reveal: a stale page is served exactly as briskly as a
        // current one. After a deployment PHP never runs - Apache answers from
        // the file - so nothing else notices that the release moved on.
        if ($this->argument('url') === null && $pages->releaseIsStale())
        {
            $this->components->error('The pages on disk were rendered by a different release.');
            $this->line('  Run `php artisan pages:warm` - it rebuilds from the release that is deployed.');
            $this->newLine();

            return self::FAILURE;
        }

        try
        {
            $response = Http::timeout(10)->withHeaders(['Accept' => 'text/html'])->get($base . '/' . $language->code);
        }
        catch (\Throwable $e)
        {
            $this->components->error('Could not reach ' . $base . ': ' . $e->getMessage());

            return self::FAILURE;
        }

        // How the two answers differ, and why these headers:
        //
        //   - a **file** is sent by the web server, which adds `Last-Modified`
        //     and an `ETag` because it knows the file's size and mtime;
        //   - a **PHP** answer goes through the `web` middleware group, which
        //     starts a session and therefore sets cookies.
        //
        // The cookie is the decisive one. A framework response can be made to
        // look static, but it cannot start a session without saying so.
        $cookied = $response->header('Set-Cookie') !== '';
        $modified = $response->header('Last-Modified') !== '';

        $this->newLine();
        $this->components->twoColumnDetail('Status', (string) $response->status());
        $this->components->twoColumnDetail('Set-Cookie', $cookied ? 'yes - PHP answered' : 'no');
        $this->components->twoColumnDetail('Last-Modified', $modified ? $response->header('Last-Modified') : 'absent');
        $this->newLine();

        if ($cookied || !$modified)
        {
            $this->components->error('The answer came from PHP. The baked pages are being written and never read.');
            $this->line('  Apache: check that the rewrite in public/.htaccess is present and that AllowOverride lets it run.');
            $this->line('  nginx:  .htaccess is ignored. Add to the server block, before the PHP location:');
            $this->newLine();
            $this->line('      location / {');
            $this->line('          try_files /cache$uri.html $uri $uri/ /index.php?$query_string;');
            $this->line('      }');
            $this->newLine();
            $this->line('  Either way the site still works - it is just doing it the slow way.');

            return self::FAILURE;
        }

        $this->components->info('Served from a file. PHP did not run.');

        return self::SUCCESS;
    }
}
