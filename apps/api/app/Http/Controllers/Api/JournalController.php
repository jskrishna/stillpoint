<?php

declare(strict_types=1);

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Controller;
use App\Http\Resources\JournalEntryResource;
use App\Models\JournalEntry;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Http\Resources\Json\AnonymousResourceCollection;
use Symfony\Component\HttpFoundation\Response;

/**
 * The user's own journal. "Only you can see these."
 *
 * Every action is scoped to the authenticated user. A coach never reads a
 * client's journal through this controller — sharing is a separate route with
 * its own scope.
 */
final class JournalController extends Controller
{
    public function index(Request $request): AnonymousResourceCollection
    {
        $entries = JournalEntry::query()
            ->where('user_id', $request->user()->id)
            ->newestFirst()
            ->get();

        return JournalEntryResource::collection($entries);
    }

    public function show(Request $request, JournalEntry $entry): JournalEntryResource
    {
        $this->authorizeOwnership($request, $entry);

        return new JournalEntryResource($entry);
    }

    /** The note the user writes, and whether the entry is shared. */
    public function update(Request $request, JournalEntry $entry): JournalEntryResource
    {
        $this->authorizeOwnership($request, $entry);

        $validated = $request->validate([
            'note' => ['sometimes', 'nullable', 'string', 'max:5000'],
            'sharedWithCoach' => ['sometimes', 'boolean'],
        ]);

        if (array_key_exists('note', $validated)) {
            $note = is_string($validated['note']) ? trim($validated['note']) : null;
            $entry->note = ($note === null || $note === '') ? null : $note;
        }

        if (array_key_exists('sharedWithCoach', $validated)) {
            $entry->shared_with_coach = (bool) $validated['sharedWithCoach'];
        }

        $entry->save();

        return new JournalEntryResource($entry->refresh());
    }

    public function destroy(Request $request, JournalEntry $entry): JsonResponse
    {
        $this->authorizeOwnership($request, $entry);
        $entry->delete();

        return response()->json(status: Response::HTTP_NO_CONTENT);
    }

    private function authorizeOwnership(Request $request, JournalEntry $entry): void
    {
        abort_unless($entry->user_id === $request->user()->id, Response::HTTP_NOT_FOUND);
    }
}
