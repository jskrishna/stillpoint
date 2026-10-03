<?php

declare(strict_types=1);

namespace App\Domain;

/** The feelings a user can name at step 3. */
enum FeelingId: string
{
    case Angry = 'angry';
    case Afraid = 'afraid';
    case Anxious = 'anxious';
    case Sad = 'sad';
    case Guilty = 'guilty';
    case Ashamed = 'ashamed';
    case Rejected = 'rejected';
    case Unworthy = 'unworthy';
    case Lonely = 'lonely';
    case Hurt = 'hurt';
    case Overwhelmed = 'overwhelmed';
    case Powerless = 'powerless';
    case Humiliated = 'humiliated';

    /** How many feelings a user may choose ("Choose up to 3"). */
    public const MAX_CHOICES = 3;

    public function label(): string
    {
        return ucfirst($this->value);
    }

    /** Whether the chip is shown straight away, or behind "See more feelings". */
    public function isPrimary(): bool
    {
        return $this !== self::Humiliated;
    }

    /** @return list<self> */
    public static function primary(): array
    {
        return array_values(array_filter(self::cases(), fn (self $f) => $f->isPrimary()));
    }

    /** @return list<self> */
    public static function behindMore(): array
    {
        return array_values(array_filter(self::cases(), fn (self $f) => ! $f->isPrimary()));
    }

    /**
     * Adds or removes a feeling, respecting the cap.
     *
     * Deselecting always works. Selecting past the cap is ignored rather than
     * silently dropping an earlier choice: the user is upset, and a chip they
     * did not touch turning off is worse than a tap doing nothing.
     *
     * @param  list<self>  $selected
     * @return list<self>
     */
    public static function toggle(array $selected, self $id, int $max = self::MAX_CHOICES): array
    {
        if (in_array($id, $selected, true)) {
            return array_values(array_filter($selected, fn (self $f) => $f !== $id));
        }
        if (count($selected) >= $max) {
            return $selected;
        }

        return [...$selected, $id];
    }
}
