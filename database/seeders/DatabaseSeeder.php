<?php

namespace Database\Seeders;

use App\Models\Language;
use App\Models\Module;
use App\Models\User;
use Illuminate\Database\Seeder;
use Illuminate\Support\Facades\Hash;

class DatabaseSeeder extends Seeder
{
    /**
     * Everything here goes through the models rather than DB::table().
     *
     * updateOrInsert() does not fill timestamps, so the seeded rows had a null
     * `created_at` - the column `latest()` orders by, which left them sorting
     * unpredictably against anything created afterwards. The models also cast
     * `schema`, so it no longer has to be hand-encoded.
     */
    public function run(): void
    {
        $user = User::updateOrCreate(
            ['email' => 'test@example.com'],
            [
                'name' => 'Test User',
                'password' => Hash::make('password'),
                'email_verified_at' => now(),
            ]
        );

        // `el`, not `gr`: that is the ISO code for Greek, it is the example the
        // languages migration itself gives, and it is the key every
        // translation inside Entry.data ends up stored under.
        $greek = Language::updateOrCreate(
            ['code' => 'el'],
            ['name' => 'Greek', 'is_active' => true]
        );

        // Nothing else in the codebase ever wrote is_default, so a fresh
        // install had no default language and the panel fell back to whichever
        // row came first by id (TASKS.md #49).
        //
        // Claimed only when no other language holds it. Exactly one row may,
        // nothing in the schema enforces that, and `defaultLanguage()` takes
        // whichever it sees first - so setting it unconditionally left an
        // install that already had a default with two, and moved the panel to
        // a different language on the next `migrate --seed`.
        $claimedElsewhere = Language::where('is_default', true)
            ->whereKeyNot($greek->getKey())
            ->exists();

        if (!$claimedElsewhere)
        {
            $greek->forceFill(['is_default' => true])->save();
        }

        Module::updateOrCreate(
            ['slug' => 'projects'],
            [
                'user_id' => $user->id,
                'name' => 'Projects',
                'schema' => [
                    ['name' => 'title', 'type' => 'string', 'translatable' => true, 'required' => true],
                    ['name' => 'sort_order', 'type' => 'integer', 'translatable' => false, 'required' => false],
                ],
            ]
        );
    }
}
