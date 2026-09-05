{{--
    The public shell. Deliberately plain: the bought theme arrives in #62 and
    replaces everything below <body>, so anything decorative written here
    would be thrown away. What must be right *now* is the head - the hreflang
    set and the canonical are what #59 exists for.
--}}
<!DOCTYPE html>
<html lang="{{ $current->code }}">
<head>
    <meta charset="utf-8">
    <meta name="viewport" content="width=device-width, initial-scale=1">
    <title>{{ $title }}</title>
    <link rel="canonical" href="{{ $canonical }}">
@foreach ($alternates as $code => $href)
    <link rel="alternate" hreflang="{{ $code }}" href="{{ $href }}">
@endforeach
@if ($defaultAlternate !== null)
    <link rel="alternate" hreflang="x-default" href="{{ $defaultAlternate }}">
@endif
    <style>
        body { font: 16px/1.6 system-ui, sans-serif; margin: 0 auto; max-width: 44rem; padding: 2rem 1rem; color: #1f2937; }
        a { color: #4f46e5; }
        nav { display: flex; gap: .75rem; padding-bottom: 1rem; border-bottom: 1px solid #e5e7eb; margin-bottom: 2rem; }
        nav a[aria-current] { font-weight: 700; text-decoration: none; color: #111827; }
        ul.entries { list-style: none; padding: 0; }
        ul.entries li { padding: .5rem 0; border-bottom: 1px solid #f3f4f6; }
        figure { margin: 1rem 0; }
        img { max-width: 100%; height: auto; }
        footer { margin-top: 3rem; padding-top: 1rem; border-top: 1px solid #e5e7eb; font-size: .875rem; color: #6b7280; }
    </style>
</head>
<body>
    <nav>
        @foreach ($languages as $language)
            <a href="{{ $alternates[$language->code] ?? url('/' . $language->code) }}"
               @if ($language->code === $current->code) aria-current="page" @endif>
                {{ strtoupper($language->code) }}
            </a>
        @endforeach
        <a href="{{ url('/' . $current->code) }}" style="margin-left:auto">{{ __('Home') }}</a>
    </nav>

    @yield('content')

    {{-- What the owner typed into the settings screen (#67). Every value is
         optional, so each one is printed only if it is there. --}}
    <footer>
        {{ config('app.name') }}
        @if ($settings['address'] ?? null)
            <span> · {{ $settings['address'] }}</span>
        @endif
        @if ($settings['phone'] ?? null)
            <span> · <a href="tel:{{ $settings['phone'] }}">{{ $settings['phone'] }}</a></span>
        @endif
    </footer>
</body>
</html>
