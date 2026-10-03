<?php

declare(strict_types=1);

namespace Database\Seeders;

use Illuminate\Database\Console\Seeds\WithoutModelEvents;
use Illuminate\Database\Seeder;

/**
 * `php artisan db:seed`.
 *
 * Only the demo accounts. There is deliberately no generated session or journal
 * data: those are the most personal text the product holds, and inventing a
 * plausible crisis to populate a screen with is not a fixture anybody wants to
 * meet by accident.
 */
class DatabaseSeeder extends Seeder
{
    use WithoutModelEvents;

    public function run(): void
    {
        $this->call(DemoSeeder::class);
    }
}
