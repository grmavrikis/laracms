<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

/**
 * The first thing an anonymous visitor may write to (TASKS.md #66).
 *
 * A hand-written table rather than a Module's JSON schema, by the rule in
 * TASKS.md -> Decisions: it needs a chronological listing, deletion in bulk
 * when the retention period bites, and it grows without limit. Domain modules
 * are written once in core and enabled per installation.
 *
 * Every column is what somebody typed, plus three the server knows: the
 * language they were reading, the page they were on, and the moment they
 * consented. None of it is ever edited - an enquiry is a record of what was
 * sent, not a document.
 */
return new class extends Migration
{
    public function up(): void
    {
        Schema::create('enquiries', function (Blueprint $table)
        {
            $table->id();

            $table->string('name');
            $table->string('email');
            $table->string('phone', 40)->nullable();
            $table->text('message');

            // An enquiry is not a booking: somebody asking "do you have
            // anything in July" has no dates yet, and refusing them would
            // throw away the enquiry to tidy the data.
            $table->date('arrives_on')->nullable();
            $table->date('departs_on')->nullable();
            $table->unsignedSmallInteger('guests')->nullable();

            // What the server knows rather than what was typed.
            $table->string('language_code', 5);
            $table->string('source_url', 512)->nullable();

            // The moment consent was given, not a boolean somebody could flip
            // afterwards. Without it there is no lawful basis for the row.
            $table->timestamp('consented_at');

            $table->timestamps();

            // The listing is newest-first and the pruner reads by age; both
            // are this index.
            $table->index('created_at');
        });
    }

    public function down(): void
    {
        Schema::dropIfExists('enquiries');
    }
};
