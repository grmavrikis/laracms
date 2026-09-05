<?php

namespace App\Models;

// use Illuminate\Contracts\Auth\MustVerifyEmail;
use Database\Factories\UserFactory;
use Illuminate\Database\Eloquent\Attributes\Fillable;
use Illuminate\Database\Eloquent\Attributes\Hidden;
use Illuminate\Database\Eloquent\Factories\HasFactory;
use Illuminate\Database\Eloquent\Relations\HasMany;
use Illuminate\Foundation\Auth\User as Authenticatable;
use Illuminate\Notifications\Notifiable;

#[Fillable(['name', 'email', 'password', 'locale'])]
#[Hidden(['password', 'remember_token'])]
class User extends Authenticatable
{
    /**
     * How wide `users.locale` is, in one place (TASKS.md #98).
     *
     * An interface locale is a **filename**, and a filename has no length
     * limit - so the validator and the column would otherwise disagree about
     * how long one may be, and `lang/zh-Hant-TW.json` would be offered by the
     * picker, accepted by the rule and refused by MySQL with a 1406. That is
     * #76 again, and SQLite cannot see it.
     *
     * Twenty covers every BCP 47 tag anybody writes a translation for
     * (`zh-Hant-TW` is ten). The migration, the validation rule and
     * `PanelLocaleTest` all read this.
     */
    public const LOCALE_MAX_LENGTH = 20;

    /** @use HasFactory<UserFactory> */
    use HasFactory, Notifiable;

    /**
     * Get the attributes that should be cast.
     *
     * @return array<string, string>
     */
    protected function casts(): array
    {
        return [
            'email_verified_at' => 'datetime',
            'password' => 'hashed',
        ];
    }

    public function modules(): HasMany
    {
        return $this->hasMany(Module::class);
    }
}
