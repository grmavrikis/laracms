<?php

namespace App\Console\Commands;

use App\Services\StaticPages;
use Illuminate\Console\Command;
use Illuminate\Contracts\Http\Kernel;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\File;

/**
 * Bake the whole public site in one go (TASKS.md #97).
 *
 * The alternative is lazy: the first visitor to each page pays for its render.
 * That is fine day to day and wrong twice - after a deployment, and after the
 * owner empties the cache from the panel - because the first visitor is then
 * every visitor, and on a site that has just been published the first visitor
 * is often Google.
 */
class WarmPages extends Command
{
    protected $signature = 'pages:warm {--flush : Empty the directory first, so every page is rebuilt}';

    protected $description = 'Render every public page to a file';

    public function handle(StaticPages $pages, Kernel $kernel): int
    {
        if (!$pages->enabled())
        {
            $this->components->error('Baking is off, so nothing would be kept. Turn it on in the panel, or set PAGE_CACHE=true.');

            return self::FAILURE;
        }

        if ($this->option('flush'))
        {
            $pages->flush();
            $this->components->info('Emptied ' . $pages->directory());
        }

        // The sitemap **is** the list of public addresses - that is what a
        // sitemap is - so walking it is what keeps this from growing a second,
        // slightly different idea of which pages the site has. It also means a
        // page missing from the sitemap is missing from the bake, which is the
        // right way round: a page no crawler is told about is not one to
        // pre-render.
        $addresses = $this->addresses($kernel);

        if ($addresses === [])
        {
            $this->components->warn('The sitemap listed no pages. Is there a published entry, and an active language?');

            return self::SUCCESS;
        }

        $baked = 0;
        $skipped = [];

        $this->withProgressBar($addresses, function (string $address) use ($kernel, &$baked, &$skipped)
        {
            $status = $this->fetch($kernel, $address);

            if ($status !== 200)
            {
                $skipped[] = $address . ' (' . $status . ')';

                return;
            }

            $baked++;
        });

        $this->newLine(2);
        $this->components->info($baked . ' of ' . count($addresses) . ' pages baked into ' . $pages->directory());

        $orphans = $this->sweep($pages);

        if ($orphans > 0)
        {
            $this->components->info('Swept ' . $orphans . ' half-written page(s) a process died in the middle of.');
        }

        foreach ($skipped as $address)
        {
            $this->components->warn('Not baked: ' . $address);
        }

        return self::SUCCESS;
    }

    /**
     * Every public address, read out of the sitemap this application renders.
     *
     * @return array<int, string>
     */
    private function addresses(Kernel $kernel): array
    {
        $sitemap = $this->body($kernel, url('/sitemap.xml'));

        preg_match_all('#<loc>(.*?)</loc>#', $sitemap, $matches);

        // The sitemap is fetched through the same kernel, so it has already
        // baked itself by the time this returns - hence it is not fetched a
        // second time below.
        return array_values(array_unique($matches[1] ?? []));
    }

    private function fetch(Kernel $kernel, string $address): int
    {
        return $this->request($kernel, $address)->getStatusCode();
    }

    private function body(Kernel $kernel, string $address): string
    {
        return $this->request($kernel, $address)->getContent() ?: '';
    }

    /**
     * One request through the real kernel, **terminated**.
     *
     * `handle()` and `terminate()` come in pairs: without the second, no
     * terminable middleware runs and every request's state stays in the
     * container for the rest of the command. On sixty pages that is only
     * untidy; on a catalogue it is what runs the process out of memory, and
     * the middleware that is silently skipped is whatever somebody adds later.
     */
    private function request(Kernel $kernel, string $address)
    {
        $request = Request::create($address, 'GET');
        $response = $kernel->handle($request);

        $kernel->terminate($request, $response);

        return $response;
    }

    /**
     * Half-written pages a process died in the middle of.
     *
     * `StaticPages::write` moves a temporary file into place and cleans it up
     * when the move fails - but not when the process is killed between the two,
     * and nothing expires a file any more, so one left behind stays for ever.
     */
    private function sweep(StaticPages $pages): int
    {
        $directory = $pages->directory();

        if (!is_dir($directory))
        {
            return 0;
        }

        $orphans = 0;

        foreach (File::allFiles($directory) as $file)
        {
            if (str_ends_with($file->getFilename(), '.writing'))
            {
                File::delete($file->getPathname());
                $orphans++;
            }
        }

        return $orphans;
    }
}
