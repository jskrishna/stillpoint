<?php

declare(strict_types=1);

namespace Tests\Unit;

use App\Domain\FeelingId;
use PHPUnit\Framework\TestCase;

final class FeelingsTest extends TestCase
{
    public function test_lists_the_twelve_primary_chips_in_order(): void
    {
        $this->assertSame(
            ['Angry', 'Afraid', 'Anxious', 'Sad', 'Guilty', 'Ashamed', 'Rejected', 'Unworthy', 'Lonely', 'Hurt', 'Overwhelmed', 'Powerless'],
            array_map(fn (FeelingId $f) => $f->label(), FeelingId::primary()),
        );
    }

    public function test_keeps_the_rest_behind_see_more_feelings(): void
    {
        $this->assertSame([FeelingId::Humiliated], FeelingId::behindMore());
    }

    public function test_caps_the_selection_at_three(): void
    {
        $this->assertSame(3, FeelingId::MAX_CHOICES);
    }

    public function test_ignores_a_fourth_choice_rather_than_dropping_an_earlier_one(): void
    {
        $three = [FeelingId::Ashamed, FeelingId::Rejected, FeelingId::Unworthy];
        $this->assertSame($three, FeelingId::toggle($three, FeelingId::Angry));
    }

    public function test_still_allows_deselecting_at_the_cap(): void
    {
        $this->assertSame(
            [FeelingId::Ashamed, FeelingId::Unworthy],
            FeelingId::toggle([FeelingId::Ashamed, FeelingId::Rejected, FeelingId::Unworthy], FeelingId::Rejected),
        );
    }

    public function test_keeps_the_order_feelings_were_chosen_in(): void
    {
        $s = FeelingId::toggle([FeelingId::Unworthy], FeelingId::Angry);
        $s = FeelingId::toggle($s, FeelingId::Sad);
        $this->assertSame([FeelingId::Unworthy, FeelingId::Angry, FeelingId::Sad], $s);
    }

    public function test_does_not_know_a_feeling_outside_the_taxonomy(): void
    {
        $this->assertNull(FeelingId::tryFrom('hangry'));
        $this->assertSame(FeelingId::Ashamed, FeelingId::tryFrom('ashamed'));
    }
}
