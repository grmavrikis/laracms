<?php

namespace Tests\Support;

use Illuminate\Support\Facades\File;

/**
 * Which strings the code asks to be translated, and where each one is asked.
 *
 * Lifted out of `CatalogueCoversTheCodeTest` when the **other** direction
 * needed the same answer (#117 item 20): that test asks whether every literal
 * is in the catalogue, `CatalogueHasNoOrphansTest` asks whether every catalogue
 * key is still a literal. Two copies of this scan would give two answers to one
 * question, and the wrong one would be whichever copy drifted.
 *
 * ### Reading the code, not text that looks like code
 *
 * **PHP is read with `token_get_all`**, because a comment mentioning
 * `__('Name')` is not a translation - the first version of this scan reported
 * exactly that, out of a comment in `AppServiceProvider` explaining how the
 * mechanism works. **Blade and JavaScript strip comments first** for the same
 * reason, which is why a docblock in `Analytics.jsx` carrying a quoted example
 * is not demanded of the catalogue.
 *
 * Only literals count. `__($field['label'])` cannot be checked here and is not
 * meant to be: the value it resolves to is built from literals somewhere else,
 * and that is where it is caught.
 */
final class TranslatedLiterals
{
    /**
     * Everything core translates - its PHP, its own Blade, and the panel.
     *
     * The panel shares `lang/en.json` deliberately (#96): the catalogue is
     * injected into the page rather than bundled, so one file serves both sides
     * and a key may be claimed from either.
     *
     * @return array<string, string> key => where it is asked for
     */
    public static function everywhereCoreTranslates(): array
    {
        // `+`, not `array_merge`: the value is the file to name when the
        // assertion fails, and `array_merge` would hand a string translated in
        // both PHP and the panel to whichever scan ran last. Each scan already
        // keeps its own first sighting with `??=`; this keeps that rule across
        // the three of them.
        return self::inPhp(app_path())
            + self::inBlade(resource_path('views'))
            + self::inJavaScript(resource_path('js'));
    }

    /**
     * `__('…')` in PHP, read as tokens.
     *
     * @return array<string, string>
     */
    public static function inPhp(string $directory): array
    {
        $found = [];

        foreach (self::filesIn($directory, ['php']) as $file)
        {
            $tokens = token_get_all(File::get($file));

            foreach ($tokens as $index => $token)
            {
                if (!is_array($token) || $token[0] !== T_STRING || $token[1] !== '__')
                {
                    continue;
                }

                $argument = self::firstArgument($tokens, $index);

                if ($argument !== null)
                {
                    $found[$argument] ??= self::relative($file);
                }
            }
        }

        return $found;
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
    public static function inBlade(string $directory): array
    {
        $found = [];

        foreach (self::filesIn($directory, ['php']) as $file)
        {
            $source = preg_replace('/\{\{--.*?--\}\}/s', '', File::get($file));

            preg_match_all('/__\(\s*\'((?:[^\'\\\\]|\\\\.)*)\'/s', (string) $source, $matches);

            foreach ($matches[1] as $key)
            {
                $found[str_replace(["\\'", '\\\\'], ["'", '\\'], $key)] ??= self::relative($file);
            }
        }

        return $found;
    }

    /**
     * `t('…')` in the panel, whose catalogue is core's - the same file,
     * injected into the page rather than bundled (#96).
     *
     * @return array<string, string>
     */
    public static function inJavaScript(string $directory): array
    {
        $found = [];

        foreach (self::filesIn($directory, ['js', 'jsx']) as $file)
        {
            // Neither extension. The skip list was written when only one
            // direction existed, where a stray literal in a test was merely
            // demanded of the catalogue; now that `CatalogueHasNoOrphansTest`
            // reads the same scan, a call in a test would keep a dead key
            // alive. A test is not a call site that ships.
            if (str_ends_with($file, '.test.js') || str_ends_with($file, '.test.jsx'))
            {
                continue;
            }

            // Comments, for the same reason PHP is read as tokens.
            //
            // **The question is whether the slash is part of a word**, not what
            // happens to precede it. A file picker's `accept` attribute ends in
            // a slash and a star, and reading that as a comment opener threw
            // away 4,700 characters of `GalleryEditor.jsx` and every translated
            // string inside them. The first fix asked for whitespace or a brace
            // in front, which left every comment following punctuation in place
            // - so a commented-out call counted as a real one. A mime pattern's
            // slash follows a letter; a comment's never does.
            $source = preg_replace(
                ['#(?<![\w/])/\*.*?\*/#s', '#(?<![\w:])//[^\n]*#'],
                '',
                File::get($file)
            );

            preg_match_all('/(?<![\w$])t\(\s*\'((?:[^\'\\\\]|\\\\.)*)\'/s', (string) $source, $matches);

            foreach ($matches[1] as $key)
            {
                $found[str_replace(["\\'", '\\\\'], ["'", '\\'], $key)] ??= self::relative($file);
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
    private static function firstArgument(array $tokens, int $index): ?string
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

    /** @return array<int, string> */
    private static function filesIn(string $directory, array $extensions): array
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

    private static function relative(string $path): string
    {
        return str_replace([base_path() . DIRECTORY_SEPARATOR, '\\'], ['', '/'], $path);
    }
}
