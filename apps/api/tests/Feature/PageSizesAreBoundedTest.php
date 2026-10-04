<?php

declare(strict_types=1);

namespace Tests\Feature;

use App\Http\Resources\Paged;
use App\Models\JournalEntry;
use App\Models\User;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Http\Request;
use Tests\TestCase;

/**
 * A page size is bounded, and every paged list bounds it.
 *
 * `Paged::limit()` says why: "these rows are encrypted and decrypted one at a
 * time, so an unbounded page is a way to make the server do unbounded work" —
 * which the insights read has since shown is not theoretical, having died at
 * 4,000 rows against `deploy/php.ini`'s own memory limit.
 *
 * Nothing tested it. `perPage` and `limit` appear in no test in the suite, so
 * the bound, the fallback and the rule that every list applies them were all
 * description rather than enforcement.
 *
 * Three tests, and the middle one is the point. A unit test of the helper
 * would pass while an endpoint quietly passed the raw request value instead;
 * an end-to-end test on one endpoint would pass while a sixth list forgot. So
 * the middle one reads the source and asserts that **every** `cursorPaginate`
 * in the application is handed a `Paged::limit(...)` — the same shape as
 * `ErasureLeavesNoAddressAnywhereTest` asking the schema rather than a list,
 * and for the same reason: a hand-written list of endpoints is the thing that
 * goes stale. `Paged`'s own docblock said "these two endpoints" while there
 * were five of them.
 */
final class PageSizesAreBoundedTest extends TestCase
{
    use RefreshDatabase;

    private function limitFor(?string $asked): int
    {
        $request = Request::create('/api/journal', 'GET', $asked === null ? [] : ['limit' => $asked]);

        return Paged::limit($request, 25);
    }

    public function test_a_nonsense_page_size_falls_back_to_the_default(): void
    {
        // The documented choice: not the nearest legal value. `limit=-5`
        // meaning "one row" would be a surprising thing to infer, and
        // `limit=nonsense` casts to zero, which means nothing either.
        $this->assertSame(25, $this->limitFor(null), 'no limit given');
        $this->assertSame(25, $this->limitFor('nonsense'));
        $this->assertSame(25, $this->limitFor('0'));
        $this->assertSame(25, $this->limitFor('-5'));
        $this->assertSame(25, $this->limitFor(''));

        // And a real one is honoured, up to the ceiling.
        $this->assertSame(10, $this->limitFor('10'));
        $this->assertSame(100, $this->limitFor('100'));
        $this->assertSame(100, $this->limitFor('10000'));
        $this->assertSame(100, $this->limitFor('99999999999'));
    }

    /**
     * Every paged list in the application bounds its page.
     *
     * Read off the source rather than from a list of routes, because the
     * failure is the next list that forgets, and a test naming today's five
     * cannot see it.
     */
    public function test_every_paged_list_is_given_a_bounded_limit(): void
    {
        $calls = 0;

        foreach ($this->phpFilesIn(app_path()) as $file) {
            $source = (string) file_get_contents($file);

            // `cursorPaginate(` and whatever it was handed, up to the first
            // closing paren of the argument — enough to see the helper.
            preg_match_all('/cursorPaginate\(\s*([^;]*?)\)\s*[;,)]/s', $source, $matches);

            foreach ($matches[1] as $argument) {
                $calls++;
                $this->assertStringContainsString(
                    'Paged::limit(',
                    $argument,
                    basename($file).' paginates without bounding the page size: cursorPaginate('.trim($argument).')',
                );
            }
        }

        // Not vacuous: if the regex stops matching, this test silently stops
        // checking anything, which is the failure mode of every source-reading
        // test and the reason this line is here.
        $this->assertGreaterThanOrEqual(5, $calls, 'found no paginated lists, so this asserts nothing');
    }

    /** And the bound is really wired up, end to end on one list. */
    public function test_an_absurd_page_size_is_capped_by_the_api(): void
    {
        $user = User::factory()->create();

        for ($i = 0; $i < 105; $i++) {
            JournalEntry::create([
                'user_id' => $user->id,
                'occurred_at' => now()->subMinutes($i),
                'kind' => 'quick',
                'duration_minutes' => 11,
                'title' => "Entry {$i}",
                'belief' => 'I am not enough.',
                'feelings' => ['angry'],
                'reached_final_step' => true,
                'shared_with_coach' => false,
            ]);
        }

        $page = $this->actingAs($user)->getJson('/api/journal?limit=10000')->assertOk();

        $this->assertCount(100, $page->json('items'));
        $this->assertSame(105, $page->json('total'));
        $this->assertNotNull($page->json('nextCursor'), 'the rest must still be reachable');
    }

    /** @return list<string> */
    private function phpFilesIn(string $directory): array
    {
        $files = [];
        $iterator = new \RecursiveIteratorIterator(new \RecursiveDirectoryIterator($directory));

        foreach ($iterator as $file) {
            if ($file instanceof \SplFileInfo && $file->getExtension() === 'php') {
                $files[] = $file->getPathname();
            }
        }

        return $files;
    }
}
