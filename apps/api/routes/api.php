<?php

declare(strict_types=1);

use App\Http\Controllers\Api\InsightsController;
use App\Http\Controllers\Api\JournalController;
use App\Http\Controllers\Api\SessionController;
use Illuminate\Support\Facades\Route;

Route::middleware('auth:sanctum')->group(function () {
    Route::post('sessions', [SessionController::class, 'store']);
    Route::get('sessions/{session}', [SessionController::class, 'show']);
    // The only way to advance a session, and so the only path safety screening
    // has to cover.
    Route::post('sessions/{session}/turns', [SessionController::class, 'turn']);
    Route::post('sessions/{session}/stop', [SessionController::class, 'stop']);
    Route::post('sessions/{session}/rating', [SessionController::class, 'rate']);

    Route::get('journal', [JournalController::class, 'index']);
    Route::get('journal/{entry}', [JournalController::class, 'show']);
    Route::patch('journal/{entry}', [JournalController::class, 'update']);
    Route::delete('journal/{entry}', [JournalController::class, 'destroy']);

    Route::get('insights', [InsightsController::class, 'show']);
});
