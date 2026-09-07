<?php

use App\Models\Module;
use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration {
    public function up(): void
    {
        Schema::create('modules', function (Blueprint $table)
        {
            $table->id();
            $table->string('name', Module::NAME_MAX_LENGTH); // e.g., 'Services', 'Banners'
            $table->string('slug', Module::SLUG_MAX_LENGTH)->unique(); // e.g., 'services', 'banners'
            $table->json('schema'); // Defines the dynamic fields and types
            $table->timestamps();
        });
    }

    public function down(): void
    {
        Schema::dropIfExists('modules');
    }
};
