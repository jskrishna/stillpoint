# Stillpoint's API.
#
# PHP-FPM behind the nginx in `deploy/nginx.Dockerfile`, which is the shape
# every PHP host expects. One image holds the application and its vendor
# directory; nginx gets the same files so it can serve `public/` directly.
#
# Built from the repository root (`docker build -f deploy/api.Dockerfile .`),
# because `apps/api` is only part of what this repository is.

# --- vendor -----------------------------------------------------------------
FROM composer:2 AS vendor

WORKDIR /app
COPY apps/api/composer.json apps/api/composer.lock ./

# `--no-scripts`: the post-autoload-dump script boots Laravel, and Laravel
# cannot boot without the application code, which is not here yet. The
# autoloader is regenerated below once it is.
RUN composer install \
      --no-dev --no-interaction --no-progress --prefer-dist \
      --no-scripts --no-autoloader

COPY apps/api ./
RUN composer dump-autoload --no-dev --optimize --classmap-authoritative

# --- runtime ----------------------------------------------------------------
FROM php:8.3-fpm-alpine AS runtime

# `pdo_mysql` for the database, `bcmath` for Laravel's arithmetic helpers,
# `opcache` because an interpreter re-parsing the framework on every request is
# the single biggest thing between this and a usable response time.
#
# `intl` is the one that matters most and the one this image did not have.
# The risk screen folds accents and fullwidth letters with `Normalizer`, which
# is `intl`. It was compiled here against `icu-dev` and then `apk del icu-dev`
# took `icu-libs` away with it, so the extension could not load: every `php`
# in the built image started with "Unable to load dynamic library 'intl'" and
# the screen ran on Symfony's polyfill instead, an implementation the test
# suite never exercises, in the one place it runs for real. The build stayed
# green because it checks exit codes and that is a warning.
#
# So the runtime library is installed by name and stays; only the headers are
# in the group that is removed. `oniguruma-dev` was here for `mbstring`, which
# the base image already has.
RUN apk add --no-cache icu-libs \
    && apk add --no-cache --virtual .build-deps icu-dev \
    && docker-php-ext-install -j"$(nproc)" pdo_mysql bcmath intl opcache \
    && apk del .build-deps \
    && php -r 'extension_loaded("intl") || exit(1);'

COPY deploy/php.ini /usr/local/etc/php/conf.d/stillpoint.ini

WORKDIR /var/www/html
COPY --from=vendor --chown=www-data:www-data /app ./

# Laravel writes here and nowhere else. Narrow on purpose: an application that
# can write to its own code is an application that can be made to execute what
# it was sent.
RUN chown -R www-data:www-data storage bootstrap/cache \
    && chmod -R ug+rw storage bootstrap/cache

USER www-data

EXPOSE 9000
CMD ["php-fpm"]
