<?php

declare(strict_types=1);

namespace App\Domain;

/** What a session has gathered so far. */
final readonly class SessionData
{
    /**
     * @param  list<FeelingId>  $feelings
     * @param  array{description: string, age?: int}|null  $memory
     */
    public function __construct(
        public ?string $whatHappened = null,
        public array $feelings = [],
        public ?array $memory = null,
        public ?string $belief = null,
        public ?string $forgiveness = null,
        public ?string $title = null,
        public ?CalmerRating $calmerRating = null,
    ) {}

    /** @param array<string, mixed> $capture */
    public function merge(array $capture): self
    {
        /** @var list<FeelingId> $feelings */
        $feelings = $this->feelings;
        if (array_key_exists('feelings', $capture) && is_array($capture['feelings'])) {
            // Unknown ids are dropped rather than trusted: they arrive from a
            // transcript the user spoke, not from a fixed set of buttons.
            $feelings = [];
            foreach ($capture['feelings'] as $raw) {
                $id = $raw instanceof FeelingId ? $raw : FeelingId::tryFrom((string) $raw);
                if ($id !== null) {
                    $feelings[] = $id;
                }
            }
        }

        // A capture can arrive from the guide, which passes enums, or from
        // storage, which passes the stored string. Coerce rather than trust.
        $rating = $capture['calmerRating'] ?? $this->calmerRating;
        if (is_string($rating)) {
            $rating = CalmerRating::tryFrom($rating);
        }

        return new self(
            whatHappened: $capture['whatHappened'] ?? $this->whatHappened,
            feelings: $feelings,
            memory: $capture['memory'] ?? $this->memory,
            belief: $capture['belief'] ?? $this->belief,
            forgiveness: $capture['forgiveness'] ?? $this->forgiveness,
            title: $capture['title'] ?? $this->title,
            calmerRating: $rating,
        );
    }

    public function withRating(CalmerRating $rating): self
    {
        return new self(
            $this->whatHappened, $this->feelings, $this->memory,
            $this->belief, $this->forgiveness, $this->title, $rating,
        );
    }
}
