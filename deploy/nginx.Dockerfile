# The web server in front of the API.
#
# It needs the application's `public/` directory to serve static files from, so
# it is built from the same vendor stage rather than sharing a volume — a
# volume means two things that have to be deployed together and can be deployed
# apart.
FROM composer:2 AS vendor
WORKDIR /app
COPY apps/api/composer.json apps/api/composer.lock ./
RUN composer install --no-dev --no-interaction --no-progress --prefer-dist \
      --no-scripts --no-autoloader
COPY apps/api ./
RUN composer dump-autoload --no-dev --optimize --classmap-authoritative

FROM nginx:1.27-alpine
COPY deploy/nginx.conf /etc/nginx/conf.d/default.conf
COPY --from=vendor /app/public /var/www/html/public
EXPOSE 80
