<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::table('modules', function (Blueprint $table)
        {
            if (! Schema::hasColumn('modules', 'user_id'))
            {
                $table->foreignId('user_id')->after('id')->constrained()->cascadeOnDelete();
            }
        });
    }

    public function down(): void
    {
        Schema::table('modules', function (Blueprint $table)
        {
            $table->dropConstrainedForeignId('user_id');
        });
    }
};
