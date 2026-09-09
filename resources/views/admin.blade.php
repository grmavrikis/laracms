<!-- resources/views/admin.blade.php -->
<!DOCTYPE html>
<html lang="{{ $panel['locale'] }}">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>{{ __('Admin Panel') }}</title>

    {{--
        The panel's language and its whole string catalogue, written into the
        document rather than bundled (TASKS.md #96).

        This is what makes adding a locale a file the owner drops into `lang/`
        instead of a release: Vite never sees these strings, so nothing is
        rebuilt. It is also why there is no fetch here - a round trip before
        the first paint would show an English screen that then changed under
        the reader.
    --}}
    <script>window.miniCms = @json($panel);</script>

    {{--
        The theme, applied before the first paint (#117).

        This is blocking on purpose and it has to sit here rather than in the
        bundle: React runs after the document has already been painted, so a
        theme read there arrives one frame too late and a dark-mode user gets a
        white flash on every single navigation.

        It is also why the choice is not a PHP concern yet. `users.locale`
        exists and `users.theme` is where this belongs, but that is a migration
        and this pass adds none.

        TODO (#117): move to users.theme / users.accent once PHP is in scope,
        and render the attributes from the server instead. Until then a person
        who signs in on a second machine starts on the default again.
    --}}
    <script>
        (function () {
            var THEMES = ['light', 'dark'];
            var ACCENTS = ['emerald', 'teal', 'blue', 'violet', 'rose', 'amber'];
            var root = document.documentElement;
            var stored = {};

            // Reading localStorage *throws* rather than returning null when a
            // browser is set to block site data, and this script is the first
            // thing on the page: unguarded, it would take the whole panel down
            // for that person rather than just their theme.
            try {
                stored.theme = localStorage.getItem('miniCms.theme');
                stored.accent = localStorage.getItem('miniCms.accent');
            } catch (e) {}

            var prefersDark = window.matchMedia
                && window.matchMedia('(prefers-color-scheme: dark)').matches;

            root.setAttribute(
                'data-theme',
                THEMES.indexOf(stored.theme) !== -1 ? stored.theme : (prefersDark ? 'dark' : 'light')
            );
            root.setAttribute(
                'data-accent',
                ACCENTS.indexOf(stored.accent) !== -1 ? stored.accent : 'emerald'
            );
        })();
    </script>

    @viteReactRefresh
    @vite(['resources/js/app.jsx'])
</head>
<body>
    <div id="admin-root"></div>
</body>
</html>
