<?php

/**
 * The framework's refusals, in Greek (TASKS.md #99).
 *
 * `php artisan lang:publish` created `lang/en/` only, and Laravel falls back
 * **per key** to `APP_FALLBACK_LOCALE` - so the two messages this project had
 * written by hand were Greek while every framework one stayed English, and a
 * Greek visitor read:
 *
 *     The email field must be a valid email address.
 *     Παρακαλούμε συμφωνήστε να κρατήσουμε τα στοιχεία σας για να σας απαντήσουμε.
 *
 * **Partial on purpose, and that is correct rather than half-finished.** Only
 * the rules the two public-facing surfaces actually use are here - the enquiry
 * form (`StoreEnquiryRequest`) and everything `SchemaRuleBuilder` emits for the
 * panel's settings and entry screens, which `ValidationLanguageTest` reads out
 * of both rather than trusting this list. Every other key resolves through the
 * fallback exactly as before, so a rule nobody uses is not a gap; copying all
 * 120 of Laravel's would only be 120 lines for a future translator to work
 * through for nothing (#109).
 *
 * **One set of rules is open, and cannot be closed here.** A module field
 * carries a `validation` string its author writes, so a schema saying
 * `digits:10` or `date_format:d/m/Y` reaches Laravel with no message of ours
 * behind it. Such a rule falls back to English, by design: the alternative is
 * translating the whole framework against the chance somebody uses it. Two of
 * those also print a **parameter** into the sentence - `date_format` its
 * format, `mimes` its list - so a Greek line would end in a Latin fragment
 * anyway. Where a rule like that is ours to declare, the message is written
 * out beside the rule instead: see `arrives_on.after_or_equal` in
 * `StoreEnquiryRequest`, which used to end *«…μεταγενέστερη της today»*.
 *
 * `:attribute` is the field's own name, and it comes from the request:
 * `StoreEnquiryRequest::attributes()` for the public form and
 * `SettingController` for the settings screen (#67). Without those, a Greek
 * sentence closes around an English column name.
 *
 * There is deliberately no `attributes` or `custom` array below. A label
 * belongs beside the rules it describes, in the request, so that one
 * declaration serves every language rather than each locale file repeating the
 * same list of columns.
 */
return [
    'accepted' => 'Το πεδίο :attribute πρέπει να γίνει αποδεκτό.',
    'after' => 'Το πεδίο :attribute πρέπει να είναι ημερομηνία μετά την :date.',
    'after_or_equal' => 'Το πεδίο :attribute πρέπει να είναι ημερομηνία ίδια ή μεταγενέστερη της :date.',
    'array' => 'Το πεδίο :attribute πρέπει να είναι λίστα τιμών.',
    'boolean' => 'Το πεδίο :attribute πρέπει να είναι ναι ή όχι.',
    'date' => 'Το πεδίο :attribute δεν είναι έγκυρη ημερομηνία.',
    'distinct' => 'Το πεδίο :attribute έχει διπλή τιμή.',
    'email' => 'Το πεδίο :attribute πρέπει να είναι έγκυρη διεύθυνση email.',
    'in' => 'Η επιλογή για το :attribute δεν είναι έγκυρη.',
    'integer' => 'Το πεδίο :attribute πρέπει να είναι ακέραιος αριθμός.',
    'json' => 'Το πεδίο :attribute πρέπει να είναι έγκυρο κείμενο JSON.',

    'max' => [
        'array' => 'Το πεδίο :attribute δεν μπορεί να έχει περισσότερα από :max στοιχεία.',
        'file' => 'Το αρχείο :attribute δεν μπορεί να ξεπερνά τα :max kilobytes.',
        'numeric' => 'Το πεδίο :attribute δεν μπορεί να είναι μεγαλύτερο από :max.',
        'string' => 'Το πεδίο :attribute δεν μπορεί να ξεπερνά τους :max χαρακτήρες.',
    ],

    'min' => [
        'array' => 'Το πεδίο :attribute πρέπει να έχει τουλάχιστον :min στοιχεία.',
        'file' => 'Το αρχείο :attribute πρέπει να είναι τουλάχιστον :min kilobytes.',
        'numeric' => 'Το πεδίο :attribute πρέπει να είναι τουλάχιστον :min.',
        'string' => 'Το πεδίο :attribute πρέπει να έχει τουλάχιστον :min χαρακτήρες.',
    ],

    'numeric' => 'Το πεδίο :attribute πρέπει να είναι αριθμός.',
    'present' => 'Το πεδίο :attribute πρέπει να υπάρχει.',
    'regex' => 'Η μορφή του :attribute δεν είναι έγκυρη.',
    'required' => 'Το πεδίο :attribute είναι υποχρεωτικό.',
    'string' => 'Το πεδίο :attribute πρέπει να είναι κείμενο.',
    'unique' => 'Η τιμή του :attribute χρησιμοποιείται ήδη.',
    'url' => 'Το πεδίο :attribute πρέπει να είναι έγκυρη διεύθυνση ιστοσελίδας.',
];
