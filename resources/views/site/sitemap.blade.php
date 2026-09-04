<?php echo '<?xml version="1.0" encoding="UTF-8"?>' . "\n"; ?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9" xmlns:xhtml="http://www.w3.org/1999/xhtml">
@foreach ($urls as $url)
    <url>
        <loc>{{ $url['loc'] }}</loc>
@foreach ($url['alternates'] as $code => $href)
        <xhtml:link rel="alternate" hreflang="{{ $code }}" href="{{ $href }}"/>
@endforeach
    </url>
@endforeach
</urlset>
