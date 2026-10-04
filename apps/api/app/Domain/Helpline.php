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

    /** Countries this product knows crisis numbers for. */
    public const COUNTRIES = ['CA', 'IN'];

    /** What a new account is assumed to be in: Canada is the first market. */
    public const DEFAULT_COUNTRY = 'CA';

    /**
     * Helplines for a country, or an empty list when none are known.
     *
     * Scoped by country on purpose, and still an empty list for a country not
     * listed: a plausible-looking wrong crisis number is worse than none, and
     * the safety screen offers "see other helplines" for that case.
     *
     * What changed is that Canada is a country this knows, because it is the
     * first market. Before that it was not, and a Canadian who said they were
     * not safe saw a pause screen with no number on it.
     *
     * @return list<self>
     */
    public static function forCountry(string $country): array
    {
        return match ($country) {
            'CA' => self::canada(),
            'IN' => self::india(),
            default => [],
        };
    }

    /**
     * Canada, the first market.
     *
     * 9-8-8 is the national suicide crisis line — one number, call or text,
     * bilingual, every day. Québec is listed separately because it answers
     * through 1-866-APPELLE instead, which is not a nicety: somebody in
     * Montréal dialling the wrong one of those is the failure this screen
     * exists to prevent, and a screen showing only the federal number is wrong
     * for a quarter of the country. Emergency is 911 here, not 112.
     *
     * **Not clinically reviewed.** The numbers were checked against the
     * services' own pages; what needs a clinician is the wording, the order,
     * and whether a national line and a provincial one belong on one screen.
     * That question is in `docs/clinical-review/RISK-SCREEN-REVIEW.md`.
     *
     * @return list<self>
     */
    public static function canada(): array
    {
        return [
            new self('Suicide Crisis Helpline', '988', 'Call or text · 24 hours · Canada', 'CA', 'helpline'),
            new self('Québec — 1-866-APPELLE', '1-866-277-3553', 'Call · 24 hours · Québec', 'CA', 'helpline'),
            new self('Emergency', '911', 'If you are in danger now', 'CA', 'emergency'),
        ];
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
