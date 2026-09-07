<?php

namespace Tests\Feature;

use Illuminate\Support\Facades\File;
use Tests\TestCase;

/**
 * **Every string the code translates is in the catalogue** (TASKS.md #103).
 *
 * `lang/en.json` and `site/lang/en.json` are identity maps - every key is its
 * own value - and until now nothing compared them with the code at all. The
 * parity test compares the locales with English and the collision test compares
 * the two sides with each other, so the catalogue was only ever compared with
 * itself: a new `__('Cancel')` that nobody added was invisible to the whole
 * mechanism, and a Greek reader saw *Cancel*.
 *
 * This is what makes the English files earn their place. Without it they are
 * duplication with a ceremony attached; with it they are the list a translator
 * works from, and a string missing from that list is a failing test rather than
 * an English word on somebody's site.
 *
 * ### What counts as a string the code translates
 *
 * Only literals. `__($field['label'])` cannot be checked here and is not meant
 * to be - the value it resolves to is itself built from literals somewhere
 * else, and that is where it is caught.
 *
 * PHP is read with `token_get_all` rather than a regular expression, because a
 * comment mentioning `__('Name')` is not a translation - the first version of
 * this scan reported exactly that, out of a comment in `AppServiceProvider`
 * explaining how the mechanism works.
 */
class CatalogueCoversTheCodeTest extends TestCase
{
    /**
     * The theme's strings are the client's, and live beside the theme (#61).
     */
    public function test_every_string_the_theme_translates_is_in_the_clients_catalogue(): void
    {
        $this->assertEveryLiteralIsInTheCatalogue(
            $this->literalsInBlade(config('site.theme')),
            config('site.lang') . '/en.json'
        );
    }

    /** Core's own, in `lang/en.json`: PHP, core's Blade, and the panel. */
    public function test_every_string_core_translates_is_in_its_catalogue(): void
    {
        $literals = array_merge(
            $this->literalsInPhp(app_path()),
            $this->literalsInBlade(resource_path('views')),
            $this->literalsInJavaScript(resource_path('js'))
        );

        $this->assertEveryLiteralIsInTheCatalogue($literals, base_path('lang/en.json'));
    }

    /**
     * The keys are the English text, so the English file is an identity map -
     * and one that is not says the catalogue and the code have drifted in the
     * other direction: a key whose value was edited would translate English
     * into something else.
     */
    public function test_the_english_catalogues_are_identity_maps(): void
    {
        foreach ([base_path('lang/en.json'), config('site.lang') . '/en.json'] as $file)
        {
            foreach (json_decode(File::get($file), true, flags: JSON_THROW_ON_ERROR) as $key => $value)
            {
                $this->assertSame($key, $value, "{$file} translates a key into something other than itself.");
            }
        }
    }

    // ------------------------------------------------------------- reading

    /**
     * @param array<string, string> $literals key => where it was found
     */
    private function assertEveryLiteralIsInTheCatalogue(array $literals, string $cataloguePath): void
    {
        $catalogue = json_decode(File::get($cataloguePath), true, flags: JSON_THROW_ON_ERROR);

        $this->assertGreaterThan(10, count($literals), 'Nothing was read - the scan stopped finding translated strings.');

        foreach ($literals as $key => $where)
        {
            $this->assertArrayHasKey(
                $key,
                $catalogue,
                "{$where} translates a string that " . basename(dirname($cataloguePath)) . "/en.json does not carry: \"{$key}\""
            );
        }
    }

    /**
     * `__('…')` in PHP, read as tokens.
     *
     * @return array<string, string>
     */
    private function literalsInPhp(string $directory): array
    {
        $found = [];

        foreach ($this->filesIn($directory, ['php']) as $file)
        {
            $tokens = token_get_all(File::get($file));

            foreach ($tokens as $index => $token)
            {
                if (!is_array($token) || $token[0] !== T_STRING || $token[1] !== '__')
                {
                    continue;
                }

                $argument = $this->firstArgument($tokens, $index);

                if ($argument !== null)
                {
                    $found[$argument] ??= $this->relative($file);
                }
            }
        }

        return $found;
    }

    /**
     * The string literal a call opens with, or null when it opens with anything
     * else - a variable, a concatenation, a constant.
     *
     * @param array<int, array|string> $tokens
     */
    private function firstArgument(array $tokens, int $index): ?string
    {
        $count = count($tokens);

        for ($i = $index + 1; $i < $count; $i++)
        {
            $token = $tokens[$i];

            if (is_array($token) && $token[0] === T_WHITESPACE)
            {
                continue;
            }

            if ($token === '(')
            {
                continue;
            }

            if (is_array($token) && $token[0] === T_CONSTANT_ENCAPSED_STRING)
            {
                // The token carries its quotes, and PHP's own unescaping rules
                // differ between them.
                $raw = substr($token[1], 1, -1);

                return $token[1][0] === "'"
                    ? str_replace(["\\'", '\\\\'], ["'", '\\'], $raw)
                    : stripcslashes($raw);
            }

            return null;
        }

        return null;
    }

    /**
     * `__('…')` in a Blade template.
     *
     * A regular expression rather than tokens, because everything outside
     * `<?php` is one inline-HTML token - and Blade comments are stripped first
     * for the reason the PHP side uses tokens at all.
     *
     * @return array<string, string>
     */
    private function literalsInBlade(string $directory): array
    {
        $found = [];

        foreach ($this->filesIn($directory, ['php']) as $file)
        {
            $source = preg_replace('/\{\{--.*?--\}\}/s', '', File::get($file));

            preg_match_all('/__\(\s*\'((?:[^\'\\\\]|\\\\.)*)\'/s', (string) $source, $matches);

            foreach ($matches[1] as $key)
            {
                $found[str_replace(["\\'", '\\\\'], ["'", '\\'], $key)] ??= $this->relative($file);
            }
        }

        return $found;
    }

    /**
     * `t('…')` in the panel, whose catalogue is core's - the same file, injected
     * into the page rather than bundled (#96).
     *
     * @return array<string, string>
     */
    private function literalsInJavaScript(string $directory): array
    {
        $found = [];

        foreach ($this->filesIn($directory, ['js', 'jsx']) as $file)
        {
            if (str_ends_with($file, '.test.js'))
            {
                continue;
            }

            // Comments, for the same reason PHP is read as tokens.
            $source = preg_replace(['#/\*.*?\*/#s', '#(^|\s)//[^\n]*#'], '', File::get($file));

            preg_match_all('/(?<![\w$])t\(\s*\'((?:[^\'\\\\]|\\\\.)*)\'/s', (string) $source, $matches);

            foreach ($matches[1] as $key)
            {
                $found[str_replace(["\\'", '\\\\'], ["'", '\\'], $key)] ??= $this->relative($file);
            }
        }

        return $found;
    }

    /** @return array<int, string> */
    private function filesIn(string $directory, array $extensions): array
    {
        if (!File::exists($directory))
        {
            return [];
        }

        return collect(File::allFiles($directory))
            ->filter(fn ($file) => in_array($file->getExtension(), $extensions, true))
            ->map(fn ($file) => $file->getPathname())
            ->values()
            ->all();
    }

    private function relative(string $path): string
    {
        return str_replace([base_path() . DIRECTORY_SEPARATOR, '\\'], ['', '/'], $path);
    }
}
