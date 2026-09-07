<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration {
    public function up(): void
    {
        Schema::create('modules', function (Blueprint $table)
        {
            $table->id();
            $table->string('name', 255); // e.g., 'Services', 'Banners'
            $table->string('slug', 255)->unique(); // e.g., 'services', 'banners'
            $table->json('schema'); // Defines the dynamic fields and types
            $table->timestamps();
        });
    }

    public function down(): void
    {
        Schema::dropIfExists('modules');
    }
};
