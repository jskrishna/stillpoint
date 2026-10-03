<?php

declare(strict_types=1);

namespace App\Domain;

/**
 * What someone agrees to before their first session.
 *
 * The consent screen is not a formality: it is where the product says it is not
 * therapy, that the user may stop at any time, and what happens to their data.
 * Which items are required is therefore a rule, enforced here rather than by
 * whether a screen remembered to disable its button.
 */
final readonly class ConsentItem
{
    public function __construct(
        public string $id,
        public string $text,
        public bool $required,
    ) {}

    /** @return list<self> */
    public static function all(): array
    {
        return [
            new self('understands', 'I understand and I can stop any time.', true),
            new self('adult', 'I am 18 or older.', true),
            new self('improve', 'Use my anonymous sessions to improve the app (optional).', false),
        ];
    }

    /** @return list<string> */
    public static function required(): array
    {
        return array_values(array_map(
            fn (self $i) => $i->id,
            array_filter(self::all(), fn (self $i) => $i->required),
        ));
    }

    /**
     * Required items not yet accepted.
     *
     * @param  list<string>  $accepted
     * @return list<string>
     */
    public static function missing(array $accepted): array
    {
        return array_values(array_filter(
            self::required(),
            fn (string $id) => ! in_array($id, $accepted, true),
        ));
    }
}
