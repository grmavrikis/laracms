<?php

namespace App\Console\Commands;

use App\Services\StaticPages;
use Illuminate\Console\Command;
use Illuminate\Contracts\Http\Kernel;
use Illuminate\Http\Request;

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
        $response = $kernel->handle(Request::create($address, 'GET'));

        return $response->getStatusCode();
    }

    private function body(Kernel $kernel, string $address): string
    {
        return $kernel->handle(Request::create($address, 'GET'))->getContent() ?: '';
    }
}
