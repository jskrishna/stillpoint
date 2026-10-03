<?php

declare(strict_types=1);

namespace App\Domain;

/** A helpline shown on the safety pause screen. */
final readonly class Helpline
{
    public function __construct(
        public string $name,
        /** Dialable number, as the safety screen dials it. */
        public string $number,
        /** Short qualifier, e.g. "Free · 24 hours". */
        public string $detail,
        /** ISO 3166-1 alpha-2 country this helpline serves. */
        public string $country,
        /** 'emergency' takes precedence over 'helpline'. */
        public string $kind,
    ) {}

    /**
     * Helplines for a country, or an empty list when none are known.
     *
     * Scoped by country on purpose: the safety screen offers "Not in India? See
     * other helplines", and a wrong crisis number is worse than none. Never
     * substitute a plausible-looking number for a country not covered here.
     *
     * @return list<self>
     */
    public static function forCountry(string $country): array
    {
        return $country === 'IN' ? self::india() : [];
    }

    /** @return list<self> */
    public static function india(): array
    {
        return [
            new self('Tele-MANAS helpline', '14416', 'Free · 24 hours · India', 'IN', 'helpline'),
            new self('Emergency', '112', 'If you are in danger now', 'IN', 'emergency'),
        ];
    }
}
