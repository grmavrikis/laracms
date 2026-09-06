@extends('theme::layout')

@section('content')
    {{-- `$title` rather than `$module->name`: the model's name is the
         panel's, and this page is the visitor's (#114). --}}
    <h1>{{ $title }}</h1>

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
