<?php

use App\Models\Redirect;
use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

/**
 * Where an address used to be (TASKS.md #69, and step three of #114).
 *
 * Two needs, one table. **A rename moves URLs**: since #114 a Module's address
 * is per language, so translating one takes its listing and every entry page
 * underneath it to a new path - and the old ones would answer 404 from the
 * moment the owner pressed Rename. **And a new site replaces an old one**: the
 * client's previous website has URLs Google already ranks, and losing them is
 * a drop the delivery caused.
 *
 * Rows are written two ways, and both are deliberate: the rename endpoints
 * write their own, and the agency writes the old site's by hand, the same way
 * it adds a language (#52). There is no endpoint - a client editing redirects
 * is a support call about a redirect loop.
 */
return new class extends Migration
{
    public function up(): void
    {
        Schema::create('redirects', function (Blueprint $table)
        {
            $table->id();

            /*
             * 512 rather than the usual 255, and rather than more.
             *
             * A path is a language code, a module slug and an entry slug, and
             * the two slug columns are 255 each - so the longest address this
             * application can generate is about 518 characters. Anything above
             * this is refused by `Redirects::remember` and logged, because
             * `from_path` is a unique index and InnoDB caps a key at 3072
             * bytes: utf8mb4 makes 512 characters 2048 of them, and 768 would
             * be exactly at the edge. A redirect that cannot be recorded must
             * never cost the author their rename.
             *
             * The number is the model's, not this file's (#98): the service
             * refuses above the same length, and two numbers that have to
             * agree are one.
             *
             * **Binary collation**, so both engines agree. MySQL's default is
             * case-insensitive and SQLite's is not, which would make `/Rooms`
             * and `/rooms` one row in production and two in the suite - a
             * client's old site with both would be a duplicate-key 500 that no
             * test could ever see. The routes are lower-case by pattern, so
             * exact matching is also what a visitor's address means.
             * SQLite ignores the modifier.
             */
            $from = $table->string('from_path', Redirect::PATH_MAX_LENGTH);
            $to = $table->string('to_path', Redirect::PATH_MAX_LENGTH);

            // Named only where it is needed. SQLite compares text byte by byte
            // already and rejects the name outright - `no such collation
            // sequence: utf8mb4_bin` - so asking for it unconditionally breaks
            // the suite rather than aligning it.
            if (Schema::getConnection()->getDriverName() === 'mysql')
            {
                $from->collation('utf8mb4_bin');
                $to->collation('utf8mb4_bin');
            }

            $from->unique();

            // 301 by default: a rename is permanent, and only a permanent
            // redirect moves the ranking to the new address. 302 exists for a
            // row somebody writes by hand for a page coming back.
            $table->unsignedSmallInteger('status')->default(301);

            $table->timestamps();

            // A second rename repoints every row that pointed at the old
            // address, so this is looked up by destination as often as it is
            // written.
            $table->index('to_path');
        });
    }

    public function down(): void
    {
        Schema::dropIfExists('redirects');
    }
};
