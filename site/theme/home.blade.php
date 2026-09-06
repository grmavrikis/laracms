@extends('theme::layout')

@section('content')
    <h1>{{ $title }}</h1>

    {{-- Replaced wholesale by the theme in #62. It exists so the mechanism
         can be walked through in a browser rather than only asserted. --}}
    <ul class="entries">
        {{-- Name and address arrive ready, in this page's language (#114).
             A module the site has not been translated into is simply not in
             the list - core decided that, not this template. --}}
        @foreach ($modules as $module)
            <li><a href="{{ $module['url'] }}">{{ $module['name'] }}</a></li>
        @endforeach
    </ul>

    @include('theme::enquiry')
@endsection
