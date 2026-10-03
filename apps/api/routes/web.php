<?php

declare(strict_types=1);

/*
 * Deliberately empty. This is an API; every route it answers is in
 * `routes/api.php`, and the health check is `/up`, registered by
 * `bootstrap/app.php` outside this group.
 *
 * It used to carry the skeleton's `GET /` returning Laravel's `welcome` view,
 * and that was not harmless. A web route runs the `web` middleware group,
 * which starts a session, and `SESSION_DRIVER=database` writes a row holding
 * the caller's **IP address and user-agent**. So every request to the API's
 * root — a scanner, a bot, anybody — had the product store those, for a
 * marketing page it does not serve and a session nothing ever reads:
 * `user_id` is always null, because nothing signs in through the web guard.
 *
 * That is not a vulnerability. It is data collected for no purpose, in a
 * product that will not link a font from a third party and that invokes DPDP
 * about its own microphone, and the only reason it was there is that the
 * skeleton shipped with it.
 *
 * The file itself has to exist, because `bootstrap/app.php` names it in
 * `withRouting(web: ...)`. If a web route is ever genuinely needed, note that
 * adding one brings sessions back with it.
 */
