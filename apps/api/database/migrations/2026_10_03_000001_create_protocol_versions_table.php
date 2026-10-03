<?php

declare(strict_types=1);

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::create('protocol_versions', function (Blueprint $table) {
            $table->id();
            $table->unsignedSmallInteger('major');
            $table->unsignedSmallInteger('minor');
            // draft | live | archived. Only one row should be live at a time;
            // publishing archives the previous one.
            $table->string('status', 16)->default('draft');
            // The six steps, as the admin editor holds them.
            $table->json('steps');
            $table->string('pause_title');
            $table->text('pause_body');
            $table->timestamp('published_at')->nullable();
            $table->timestamps();

            $table->unique(['major', 'minor']);
            $table->index('status');
        });
    }

    public function down(): void
    {
        Schema::dropIfExists('protocol_versions');
    }
};
