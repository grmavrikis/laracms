<?php

namespace App\Services;

use App\Http\Controllers\UploadController;
use App\Models\Enquiry;
use App\Models\EntrySlug;
use App\Models\Module;
use App\Models\ModuleSlug;
use App\Models\Redirect;
use App\Models\User;

/**
 * **Is the machine underneath still able to hold what the code allows?**
 * (TASKS.md #98.)
 *
 * The limits live on the models, where the validation rules and the theme read
 * them. The columns live in migrations, which are records of what the schema
 * became on the day each one ran - deliberately literals, because a migration
 * that read a constant would mean something different on a fresh installation
 * than on one that has already run it, and the two would silently diverge.
 *
 * That leaves gaps no test can close, because a constant changing does not
 * alter a column that already exists and does not edit anybody's `php.ini`.
 * This is the arithmetic for them; `schema:doctor` is what asks the questions
 * and prints the answers.
 *
 * Pure and here rather than on the command, so the comparison can be tested
 * on a driver that reports no widths at all - which is the one the suite runs.
 */
class SchemaLimits
{
    /**
     * Every limit that has a column behind it.
     *
     * A constant that is *not* a width - `Enquiry::MESSAGE_MAX_LENGTH` over a
     * `text` column, `GUESTS_MAX` over an integer - is deliberately absent:
     * there is nothing here for it to be compared against.
     *
     * **The constant is named rather than read.** Several of these are 255, so
     * a list of values could not say which ones are covered - dropping one
     * would leave its number in the list under somebody else's name, which is
     * exactly what `ColumnWidthTest` caught when it was written that way.
     *
     * @return array<int, array{0: string, 1: string, 2: class-string, 3: string}>
     *         table, column, the model, the constant on it
     */
    public static function expectations(): array
    {
        return [
            ['enquiries', 'name', Enquiry::class, 'NAME_MAX_LENGTH'],
            ['enquiries', 'email', Enquiry::class, 'EMAIL_MAX_LENGTH'],
            ['enquiries', 'phone', Enquiry::class, 'PHONE_MAX_LENGTH'],
            ['enquiries', 'source_url', Enquiry::class, 'SOURCE_URL_MAX_LENGTH'],
            ['modules', 'name', Module::class, 'NAME_MAX_LENGTH'],
            ['modules', 'slug', Module::class, 'SLUG_MAX_LENGTH'],
            ['module_slugs', 'name', ModuleSlug::class, 'NAME_MAX_LENGTH'],
            ['module_slugs', 'slug', ModuleSlug::class, 'SLUG_MAX_LENGTH'],
            ['entry_slugs', 'slug', EntrySlug::class, 'SLUG_MAX_LENGTH'],
            ['redirects', 'from_path', Redirect::class, 'PATH_MAX_LENGTH'],
            ['redirects', 'to_path', Redirect::class, 'PATH_MAX_LENGTH'],
            ['users', 'locale', User::class, 'LOCALE_MAX_LENGTH'],
        ];
    }

    /**
     * What each column may hold, against what the code will write into it.
     *
     * **Three states, not two.** A column that is not there is a failure - it
     * is the completest way for a schema to fall behind the code, and reading
     * it as "no width reported" is how the first version of this passed a
     * database with a column missing. A type with no declared width is
     * genuinely unknown. Everything else compares.
     *
     * @param array<string, string|null> $declared `table.column` => its type,
     *                                             or null when there is no such column
     * @param array<int, array{0: string, 1: string, 2: string, 3: string}>|null $expectations
     *        the list to check, which only a test ever passes - it is how the
     *        renamed-constant branch below is reachable at all
     * @return array{narrow: array<int, string>, missing: array<int, string>, unnamed: array<int, string>, unknown: array<int, string>}
     */
    public static function compare(array $declared, ?array $expectations = null): array
    {
        $report = ['narrow' => [], 'missing' => [], 'unnamed' => [], 'unknown' => []];

        foreach ($expectations ?? self::expectations() as [$table, $column, $model, $constant])
        {
            $at = "{$table}.{$column}";

            // A constant that has been renamed. `constant()` would raise an
            // Error, and a command whose job is to answer a question about a
            // deployment should not die on a server with a stack trace.
            if (!defined($model . '::' . $constant)) {
                $report['unnamed'][] = "{$at} is checked against {$model}::{$constant}, which no longer exists";

                continue;
            }

            $limit = (int) constant($model . '::' . $constant);

            if (!array_key_exists($at, $declared) || $declared[$at] === null)
            {
                $report['missing'][] = "{$at} is not in the database, and {$model}::{$constant} says what may be written into it";

                continue;
            }

            $width = self::widthOf($declared[$at]);

            if ($width === null)
            {
                $report['unknown'][] = "{$at} is `{$declared[$at]}`, which declares no width";

                continue;
            }

            if ($width < $limit)
            {
                $report['narrow'][] = "{$at} holds {$width}, and the rule allows {$limit}";
            }
        }

        return $report;
    }

    /**
     * The declared width in a column type, or null when the type does not carry
     * one.
     *
     * `varchar(120)` is 120 and `char(5)` is 5; `varchar` - which is all
     * Laravel's SQLite grammar writes - and `text` are null, and so is anything
     * this does not recognise, which the caller reports as unknown rather than
     * as fine.
     */
    public static function widthOf(?string $type): ?int
    {
        return preg_match('/^\s*(?:var)?char(?:acter)?(?:\s+varying)?\s*\(\s*(\d+)\s*\)/i', (string) $type, $found) === 1
            ? (int) $found[1]
            : null;
    }

    /**
     * **PHP has to be able to receive what the panel says it accepts.**
     *
     * `UploadController::MAX_KILOBYTES` is a rule Laravel applies *after* the
     * upload has arrived. A default install ships `upload_max_filesize = 2M`,
     * which is exactly that limit - and `post_max_size` has to be larger still,
     * because the body carries the file plus its multipart wrapper. Under
     * either of those the file never reaches the rule: `$_FILES` arrives empty
     * and the owner is told the image field is required, for a file the
     * application says it accepts.
     *
     * @return array<int, string>
     */
    public static function uploadProblems(?string $uploadMax, ?string $postMax): array
    {
        $limit = UploadController::MAX_KILOBYTES;

        $problems = [];

        $upload = self::kilobytesOf($uploadMax);
        $post = self::kilobytesOf($postMax);

        if ($upload !== null && $upload < $limit)
        {
            $problems[] = "upload_max_filesize is {$uploadMax} and the panel accepts {$limit}K";
        }

        // Not `<`: a body of exactly the file's size has no room for the
        // multipart boundaries and the other fields around it.
        if ($post !== null && $post <= $limit)
        {
            $problems[] = "post_max_size is {$postMax}, which leaves no room around a {$limit}K upload";
        }

        return $problems;
    }

    /**
     * A php.ini size in kilobytes, or null when it is unlimited or unreadable.
     *
     * `2M` is 2048, `512K` is 512, a bare `8388608` is bytes, and `0` means no
     * limit at all - which is not a problem to report.
     */
    public static function kilobytesOf(?string $setting): ?int
    {
        $setting = trim((string) $setting);

        if (preg_match('/^(\d+)\s*([KMG]?)$/i', $setting, $found) !== 1)
        {
            return null;
        }

        $size = (int) $found[1];

        if ($size === 0)
        {
            return null;
        }

        return match (strtoupper($found[2]))
        {
            'G' => $size * 1024 * 1024,
            'M' => $size * 1024,
            'K' => $size,
            default => intdiv($size, 1024),
        };
    }
}
