@extends('theme::layout')

@section('content')
    <h1>{{ $module->name }}</h1>

    @if ($rows->isEmpty())
        <p>{{ __('Nothing published here yet.') }}</p>
    @else
        <ul class="entries">
            @foreach ($rows as $row)
                <li><a href="{{ $row['url'] }}">{{ $row['title'] }}</a></li>
            @endforeach
        </ul>
    @endif
@endsection
