<?php

namespace Database\Seeders;

use App\Models\User;
<<<<<<< HEAD
use Illuminate\Database\Console\Seeds\WithoutModelEvents;
use Illuminate\Database\Seeder;

class DatabaseSeeder extends Seeder
{
    use WithoutModelEvents;

    /**
     * Seed the application's database.
     */
    public function run(): void
    {
        // User::factory(10)->create();

        User::factory()->create([
            'name' => 'Test User',
            'email' => 'test@example.com',
        ]);
=======
use Illuminate\Database\Seeder;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Hash;

class DatabaseSeeder extends Seeder
{
    public function run(): void
    {
        // 1. Create Test User
        $user = User::updateOrCreate(
            ['email' => 'test@example.com'],
            [
                'name' => 'Test User',
                'password' => Hash::make('password'),
                'email_verified_at' => now(),
            ]
        );

        // 2. Add Base Language (Use updateOrInsert to avoid duplicate errors)
        DB::table('languages')->updateOrInsert(
            ['code' => 'gr'],
            ['name' => 'Greek']
        );

        // 3. Add Test Module (Use updateOrInsert to avoid duplicate errors)
        DB::table('modules')->updateOrInsert(
            ['slug' => 'projects'], // Search by unique slug
            [
                'user_id' => $user->id,
                'name' => 'Projects',
                'schema' => json_encode([
                    ['name' => 'title', 'type' => 'string', 'translatable' => true, 'required' => true],
                    ['name' => 'sort_order', 'type' => 'integer', 'translatable' => false, 'required' => false]
                ]),
            ]
        );
>>>>>>> master
    }
}
