@extends('site.layout')

@section('content')
    <article>
        <h1>{{ $title }}</h1>

        @foreach ($fields as $field)
            @continue($field['name'] === $titleField)

            @if ($field['kind'] === 'html' && trim(strip_tags((string) $field['html'])) !== '')
                {{-- An HtmlString the renderer produced: normalised from an
                     allowlist and escaped there, which is why no template in
                     this application writes {!! !!} itself. --}}
                {{ $field['html'] }}
            @elseif ($field['kind'] === 'images')
                @foreach ($field['images'] as $image)
                    <figure>
                        <img src="{{ $image['url'] }}" alt="{{ $image['alt'] }}">
                    </figure>
                @endforeach
            @elseif ($field['kind'] === 'image' && $field['text'])
                <figure><img src="{{ $field['text'] }}" alt=""></figure>
            @elseif ($field['text'] !== null && $field['text'] !== '')
                <p>{{ $field['text'] }}</p>
            @endif
        @endforeach
    </article>
@endsection
