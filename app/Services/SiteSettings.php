<?php

namespace App\Services;

use App\Models\Setting;
use Illuminate\Database\QueryException;
use Illuminate\Support\Facades\Schema;

/**
 * What a client may change about their own site (TASKS.md #67).
 *
 * The point is not the list of fields. **The owner changes their phone number
 * without calling you** - BUSINESS.md puts the ceiling of this whole business
 * at support minutes per client, and a value living in a template is a phone
 * call on a Sunday.
 *
 * ### Why a table and not the singleton Module the item first described
 *
 * A singleton is the client's *content*: they create it, name it, and could
 * rename or empty it. Two of these values are not theirs to lose. An enquiry
 * can arrive on the first day of a fresh install, **before any module exists**,
 * and the panel has to resolve a language before anybody has signed in - core
 * cannot read either out of a row the client owns and might not have made.
 *
 * What is reused is the part worth reusing. The fields below are declared in
 * the **same shape a Module's schema uses**, so `SchemaRuleBuilder` validates
 * them, two-level translatable rules included. The panel builds the form from
 * what this returns, so adding a field here needs no second edit in
 * JavaScript - the same reason `fieldTypes.json` is generated rather than
 * written twice.
 *
 * ### The config values are defaults, not a previous home
 *
 * `config('site.*')` still answers for a key nobody has saved, so a fresh copy
 * of this application works before anyone opens the panel and `.env` still
 * means something on a machine with no database worth configuring. Once the
 * owner saves, the database is the answer.
 */
class SiteSettings
{
    /**
     * The fields, in the order the panel shows them.
     *
     * `group` is the panel's heading and nothing else: **core** is what this
     * application reads about itself, **site** is what the theme prints.
     * Keeping them in one list is deliberate - two screens would be two places
     * to look for "why does the site say the wrong phone number".
     *
     * `label` is English and the panel puts it through `t()`, so the server
     * owns the wording and `lang/` owns the language (#96). A field added here
     * therefore needs no edit in JavaScript at all.
     */
    private const FIELDS = [
        ['name' => 'enquiries_to', 'type' => 'string', 'translatable' => false, 'validation' => 'email', 'group' => 'core'],
        ['name' => 'panel_locale', 'type' => 'select', 'translatable' => false, 'group' => 'core'],

        ['name' => 'phone', 'type' => 'string', 'translatable' => false, 'validation' => 'max:40', 'group' => 'site'],
        ['name' => 'email', 'type' => 'string', 'translatable' => false, 'validation' => 'email', 'group' => 'site'],
        ['name' => 'address', 'type' => 'string', 'translatable' => true, 'validation' => 'max:255', 'group' => 'site'],
        ['name' => 'opening_hours', 'type' => 'string', 'translatable' => true, 'validation' => 'max:255', 'group' => 'site'],
        ['name' => 'map_latitude', 'type' => 'string', 'translatable' => false, 'validation' => 'max:20', 'group' => 'site'],
        ['name' => 'map_longitude', 'type' => 'string', 'translatable' => false, 'validation' => 'max:20', 'group' => 'site'],
        ['name' => 'facebook_url', 'type' => 'string', 'translatable' => false, 'validation' => 'url|max:255', 'group' => 'site'],
        ['name' => 'instagram_url', 'type' => 'string', 'translatable' => false, 'validation' => 'url|max:255', 'group' => 'site'],
        ['name' => 'booking_url', 'type' => 'string', 'translatable' => false, 'validation' => 'url|max:255', 'group' => 'site'],
        // Bounded by the constant the gallery's image URLs use, so the two
        // cannot drift. Not `url`: the upload endpoint answers with what
        // `Storage::url()` returns, which is a path rather than an address.
        ['name' => 'logo', 'type' => 'image', 'translatable' => false, 'validation' => 'max:' . SchemaRuleBuilder::GALLERY_URL_MAX_LENGTH, 'group' => 'site'],
    ];

    /**
     * There is one row and this is its key.
     *
     * Writing to a fixed primary key is what makes "one row" true rather than
     * likely: `first() ?? new Setting()` is a read then a write, so two people
     * saving at the same moment both found nothing and both inserted - and
     * whichever row the database returned first became the settings, silently
     * losing the other save.
     */
    public const ROW_ID = 1;

    /** Read once: `SetPanelLocale` asks on every API request. */
    private ?array $stored = null;

    public function __construct(private readonly InterfaceLocales $locales)
    {
    }

    /**
     * The declared fields, with the one list that cannot be written down
     * filled in: the panel's languages are the files in `lang/` (#96).
     *
     * @return array<int, array<string, mixed>>
     */
    public function schema(): array
    {
        return array_map(function (array $field): array
        {
            $field['label'] = self::label($field['name']);

            if ($field['name'] === 'panel_locale')
            {
                $field['options'] = $this->locales->available();
            }

            return $field;
        }, self::FIELDS);
    }

    /**
     * The panel prints this as it arrives, so the wording is core's and the
     * language is the reader's - the API already answers in it (#96).
     *
     * A `match` of literal `__()` calls rather than a column in the array
     * above: a label built from a variable is invisible to anything checking
     * that every string the code asks for is in the catalogue.
     */
    private static function label(string $name): string
    {
        return match ($name)
        {
            'enquiries_to' => __('Where enquiries are sent'),
            'panel_locale' => __('Language this panel opens in'),
            'phone' => __('Telephone'),
            'email' => __('Public email address'),
            'address' => __('Address'),
            'opening_hours' => __('Opening hours'),
            'map_latitude' => __('Map latitude'),
            'map_longitude' => __('Map longitude'),
            'facebook_url' => __('Facebook page'),
            'instagram_url' => __('Instagram profile'),
            'booking_url' => __('Booking page'),
            'logo' => __('Logo'),
            default => $name,
        };
    }

    /** @return array<int, string> */
    public function names(): array
    {
        return array_column(self::FIELDS, 'name');
    }

    /**
     * Everything, saved values over config defaults.
     *
     * A key **present** in the stored data wins even when it is empty: an
     * owner who clears the notification address meant to clear it, and falling
     * back to `.env` would quietly keep mailing an address they removed.
     *
     * @return array<string, mixed>
     */
    public function all(): array
    {
        $stored = $this->stored ??= $this->stored();

        $values = [];

        foreach (self::FIELDS as $field)
        {
            $name = $field['name'];

            $values[$name] = array_key_exists($name, $stored)
                ? $stored[$name]
                : self::configDefault($name);
        }

        return $values;
    }

    /**
     * The saved row, or nothing at all before there is one.
     *
     * **The table may not exist yet**, and that has to be an answer rather
     * than a 500: `InterfaceLocales` asks on every API request and on the
     * login screen, so a copy of this application that has been unpacked but
     * not migrated would show a stack trace where the sign-in form goes. The
     * whole argument for a table over a singleton Module was that core keeps
     * working before anybody has configured anything - it has to keep working
     * before anybody has *migrated* anything too.
     *
     * @return array<string, mixed>
     */
    private function stored(): array
    {
        try
        {
            return Setting::query()->find(self::ROW_ID)?->data ?? [];
        }
        catch (QueryException $e)
        {
            // Only "there is no table yet" is an answer. Anything else is a
            // database fault and has to surface, or a broken connection would
            // quietly serve `.env` defaults - including mailing enquiries to
            // an address the owner replaced.
            //
            // The check is itself a query, and on a dead connection it throws
            // too. Its failure must not become the one that is reported: the
            // original names the statement that actually broke, and this one
            // would point at an information-schema lookup nobody wrote.
            try
            {
                $migrated = Schema::hasTable('settings');
            }
            catch (\Throwable)
            {
                throw $e;
            }

            if ($migrated)
            {
                throw $e;
            }

            return [];
        }
    }

    public function get(string $name): mixed
    {
        return $this->all()[$name] ?? null;
    }

    /**
     * The same values with every translatable one resolved to `$language`, so
     * a template can print `$settings['address']` without knowing which of
     * them is a map and which is a string.
     *
     * @return array<string, mixed>
     */
    public function for(string $language): array
    {
        $values = $this->all();

        foreach (self::FIELDS as $field)
        {
            if (!($field['translatable'] ?? false))
            {
                continue;
            }

            $value = $values[$field['name']];

            $values[$field['name']] = is_array($value) ? ($value[$language] ?? null) : $value;
        }

        return $values;
    }

    /**
     * Store what was sent, over what is already there.
     *
     * **A merge, not a replace**, and the difference matters because an absent
     * key does not mean "empty": `all()` falls back to `config('site.*')` for
     * a key that was never saved, so replacing would turn a client that sent
     * three fields into "the other nine went back to whatever `.env` holds".
     * A stale browser tab would quietly restore the developer's notification
     * address, which is the exact failure the config fallback is documented as
     * preventing.
     *
     * Clearing still works, because a key **present** with a null wins - that
     * is the same rule `all()` applies, one layer down.
     */
    public function save(array $data): void
    {
        $setting = Setting::query()->find(self::ROW_ID) ?? new Setting();

        $setting->id = self::ROW_ID;
        $setting->data = [...$this->stored ??= $this->stored(), ...$data];
        $setting->save();

        $this->stored = null;
    }

    /**
     * The value `config/site.php` holds for a key nobody has saved. Only two
     * of them have one; the rest simply start empty.
     */
    private static function configDefault(string $name): mixed
    {
        return match ($name)
        {
            'enquiries_to' => config('site.enquiries_to'),
            'panel_locale' => config('site.locale'),
            default => null,
        };
    }
}
