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

    @viteReactRefresh
    @vite(['resources/js/app.jsx'])
</head>
<body>
    <div id="admin-root"></div>
</body>
</html>
