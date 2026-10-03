<?php

declare(strict_types=1);

namespace App\Notifications;

use Illuminate\Auth\Notifications\ResetPassword as BaseNotification;
use Illuminate\Notifications\Messages\MailMessage;

/**
 * The reset email.
 *
 * Overridden only to point at the **web app** rather than at the API: the link
 * is a page a person opens, and Laravel's default builds a route on whichever
 * host sent it. `APP_FRONTEND_URL` is where the app lives.
 *
 * The wording is deliberately plain and does not say what the account is for.
 * A reset email arrives in an inbox that other people sometimes read, and
 * "your Stillpoint session journal" is not a thing to put in a subject line.
 */
final class ResetPassword extends BaseNotification
{
    public function toMail($notifiable): MailMessage
    {
        $minutes = config('auth.passwords.users.expire', 60);
        $url = rtrim((string) config('app.frontend_url'), '/')
            .'/welcome/reset/'.$this->token
            .'?email='.urlencode($notifiable->getEmailForPasswordReset());

        return (new MailMessage)
            ->subject('Reset your password')
            ->line('Someone asked to reset the password for this address.')
            ->action('Choose a new password', $url)
            ->line("The link works for {$minutes} minutes.")
            // Said because it is the useful thing to know: a reset email you
            // did not ask for means somebody typed your address, not that
            // anything has happened to your account.
            ->line('If this was not you, nothing has changed and you can ignore this.');
    }
}
