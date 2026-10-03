<?php

declare(strict_types=1);

namespace App\Domain;

/**
 * The six steps of the Choose Again process, in the order a session walks them.
 */
enum StepId: string
{
    case Notice = 'notice';
    case Responsibility = 'responsibility';
    case Feel = 'feel';
    case Remember = 'remember';
    case Inquire = 'inquire';
    case Forgive = 'forgive';

    /** 1-based position, as shown to the user ("Step 3 of 6"). */
    public function ordinal(): int
    {
        return match ($this) {
            self::Notice => 1,
            self::Responsibility => 2,
            self::Feel => 3,
            self::Remember => 4,
            self::Inquire => 5,
            self::Forgive => 6,
        };
    }

    /** Admin-facing name, e.g. "Remember". */
    public function name(): string
    {
        return match ($this) {
            self::Notice => 'Notice',
            self::Responsibility => 'Responsibility',
            self::Feel => 'Feel',
            self::Remember => 'Remember',
            self::Inquire => 'Inquire',
            self::Forgive => 'Forgive',
        };
    }

    /** One line describing the step, as the marketing site states it. */
    public function summary(): string
    {
        return match ($this) {
            self::Notice => 'Say what happened.',
            self::Responsibility => 'See that the hurt comes from how you see it.',
            self::Feel => 'Name what you feel.',
            self::Remember => 'Find when you first felt this as a child.',
            self::Inquire => 'What did you decide about yourself then?',
            self::Forgive => 'Let that old belief go.',
        };
    }

    /** The step after this one, or null when this is the last. */
    public function next(): ?self
    {
        $order = self::ordered();
        $index = array_search($this, $order, true);

        return $order[$index + 1] ?? null;
    }

    /** @return list<self> */
    public static function ordered(): array
    {
        return [
            self::Notice,
            self::Responsibility,
            self::Feel,
            self::Remember,
            self::Inquire,
            self::Forgive,
        ];
    }

    public static function count(): int
    {
        return count(self::ordered());
    }

    /** The step at a 1-based ordinal, or null if out of range. */
    public static function atOrdinal(int $ordinal): ?self
    {
        return self::ordered()[$ordinal - 1] ?? null;
    }
}
