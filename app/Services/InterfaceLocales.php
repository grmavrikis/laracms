<?php

namespace App\Services;

use App\Models\User;
use Illuminate\Support\Facades\File;
use RuntimeException;

/**
 * Which language a *person* reads the panel in (TASKS.md #96).
 *
 * **Not the same question as which languages the content has**, and the two
 * must never share a store. `languages` rows say what the public site is
 * translated into; this says what the person looking at the admin screen
 * reads. A German owner may run a Greek and English site, and a Greek owner
 * may prefer an English panel - welding the two together would make either of
 * those impossible to express.
 *
 * So: **content languages are rows, interface locales are files.** Adding
 * German to the panel is `lang/de.json` and nothing else. No migration,
 * because there is no table; and no `npm run build`, because the strings are
 * injected into the page by the server rather than bundled by Vite. A locale
 * that needed either would not be one the owner could add.
 *
 * The catalogue is read straight off disk rather than through the translator.
 * The key *is* the English text, so a missing entry falls back to the key on
 * both sides of the wire, and `t()` in JavaScript can be four lines with the
 * same semantics as `__()` in PHP.
 */
class InterfaceLocales
{
    /** @var array<int, string>|null */
    private ?array $available = null;

    /**
     * The locales somebody has written a file for, sorted.
     *
     * **Read once.** `SetPanelLocale` asks on every API request and
     * `forPanel()` asks twice more, so without this a single panel screen
     * costs a dozen directory listings for an answer that cannot change
     * inside one request. Registered as a singleton in `AppServiceProvider`
     * so the saving is real rather than per-injection.
     *
     * @return array<int, string>
     */
    public function available(): array
    {
        return $this->available ??= collect(File::exists(lang_path()) ? File::files(lang_path()) : [])
            ->filter(fn($file) => $file->getExtension() === 'json')
            ->map(fn($file) => $file->getFilenameWithoutExtension())
            ->sort()
            ->values()
            ->all();
    }

    /**
     * The catalogue for one locale.
     *
     * A file that is not valid JSON **throws**, in the same words Laravel's
     * own `FileLoader` uses on the same file. Swallowing it would make the
     * public side strict and the panel silent about one editing mistake: a
     * trailing comma in `el.json` would render the whole panel in English
     * with nothing anywhere saying why.
     *
     * @return array<string, string>
     */
    public function messages(string $locale): array
    {
        $path = lang_path("{$locale}.json");

        if (!File::exists($path))
        {
            return [];
        }

        $decoded = json_decode(File::get($path), true);

        if (!is_array($decoded))
        {
            throw new RuntimeException("Translation file [{$path}] contains an invalid JSON structure.");
        }

        return $decoded;
    }

    /**
     * The reader's own choice, then the installation's, then the fallback -
     * and each is taken only if somebody has written that file.
     *
     * The availability check is not defensive dressing: `users.locale` and
     * `config('site.locale')` are both editable outside the application, and a
     * locale with no file would otherwise render the panel with an empty
     * catalogue. That reads as a broken deploy rather than a missing
     * translation.
     */
    public function resolve(?User $user): string
    {
        $available = $this->available();

        foreach ([$user?->locale, config('site.locale'), config('app.fallback_locale')] as $candidate)
        {
            if (is_string($candidate) && in_array($candidate, $available, true))
            {
                return $candidate;
            }
        }

        // Nothing configured has a file. Serving the fallback anyway would
        // hand the reader an empty catalogue, which is the outcome the loop
        // above exists to prevent - so take whatever is on disk instead, and
        // only fall back to a bare code when the directory is empty too.
        return $available[0] ?? (string) config('app.fallback_locale');
    }

    /**
     * Everything the panel needs to render itself, in one object the Blade
     * page writes into `window.miniCms`.
     *
     * The whole catalogue for one locale goes over, not a lookup endpoint: it
     * is a few kilobytes, and a round trip before the first paint would show
     * the reader an English screen that then changes under them.
     *
     * @return array{locale: string, locales: array<int, string>, messages: array<string, string>}
     */
    public function forPanel(?User $user): array
    {
        $locale = $this->resolve($user);

        return [
            'locale' => $locale,
            'locales' => $this->available(),
            'messages' => $this->messages($locale),
        ];
    }
}
