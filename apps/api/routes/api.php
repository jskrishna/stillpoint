<?php

declare(strict_types=1);

use App\Http\Controllers\Api\AuthController;
use App\Http\Controllers\Api\InsightsController;
use App\Http\Controllers\Api\JournalController;
use App\Http\Controllers\Api\SessionController;
use Illuminate\Support\Facades\Route;

// Throttled: these are the two routes worth guessing at.
Route::middleware('throttle:10,1')->group(function () {
    Route::post('auth/register', [AuthController::class, 'register']);
    Route::post('auth/login', [AuthController::class, 'login']);
});

Route::middleware('auth:sanctum')->group(function () {
    Route::post('auth/logout', [AuthController::class, 'logout']);
    Route::get('me', [AuthController::class, 'me']);
    Route::patch('me', [AuthController::class, 'updateMe']);
    Route::post('me/consent', [AuthController::class, 'consent']);

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
