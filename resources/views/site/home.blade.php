@extends('site.layout')

@section('content')
    <h1>{{ $title }}</h1>

    {{-- Replaced wholesale by the theme in #62. It exists so the mechanism
         can be walked through in a browser rather than only asserted. --}}
    <ul class="entries">
        @foreach ($modules as $module)
            <li><a href="{{ url('/' . $current->code . '/' . $module->slug) }}">{{ $module->name }}</a></li>
        @endforeach
    </ul>
@endsection
