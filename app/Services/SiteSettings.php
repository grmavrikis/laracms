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
        ['name' => 'logo', 'type' => 'image', 'translatable' => false, 'group' => 'site'],
    ];

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
            return Setting::query()->value('data') ?? [];
        }
        catch (QueryException $e)
        {
            // Only "there is no table yet" is an answer. Anything else is a
            // database fault and has to surface, or a broken connection would
            // quietly serve `.env` defaults - including mailing enquiries to
            // an address the owner replaced. Asking costs a second query, and
            // only on the path that has already failed.
            if (Schema::hasTable('settings'))
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
     * Replace the stored values. One row, however many times this is called.
     *
     * The whole form is sent, so this is a replace rather than a merge -
     * anything the owner cleared has to actually clear.
     */
    public function save(array $data): void
    {
        $setting = Setting::query()->first() ?? new Setting();

        $setting->data = $data;
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
