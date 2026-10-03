<?php

declare(strict_types=1);

namespace Tests\Unit;

use App\Domain\UserHandle;
use PHPUnit\Framework\TestCase;

/**
 * The handle has to be the same for one person and different for two.
 *
 * The second half is the one that was wrong. The queue prints a handle so a
 * reviewer can see that two flags are the same person; when two people share
 * one, two people each in crisis read as one person in crisis twice, and a
 * judgement about escalation rests on an identity that is not real.
 */
final class UserHandleTest extends TestCase
{
    public function test_it_is_stable_for_one_user(): void
    {
        $this->assertSame(UserHandle::for(4321), UserHandle::for(4321));
    }

    public function test_it_says_nothing_about_the_id(): void
    {
        $this->assertStringStartsWith('u_', UserHandle::for(1));
        $this->assertStringNotContainsString('1', substr(UserHandle::for(111111), 2, 1));
        $this->assertNotSame(UserHandle::for(1), UserHandle::for(2));
    }

    /**
     * Twenty thousand users, no two sharing a handle.
     *
     * Four hex characters — the designs' example, and what this used to use —
     * produces 2,761 colliding handles at this count, and five at a thousand.
     * The number here is a floor rather than a target: the arithmetic in
     * `UserHandle` is what covers a hundred thousand, because a test cannot
     * usefully assert a probability.
     */
    public function test_twenty_thousand_users_get_twenty_thousand_handles(): void
    {
        $handles = [];
        for ($id = 1; $id <= 20_000; $id++) {
            $handles[UserHandle::for($id)] = true;
        }

        $this->assertCount(20_000, $handles);
    }

    public function test_it_stays_short_enough_to_read_in_a_table(): void
    {
        // Not a round number for its own sake: a reviewer scans this column,
        // and a handle that wraps is one they stop comparing.
        $this->assertLessThanOrEqual(16, strlen(UserHandle::for(99)));
    }
}
