# apps/api: Stillpoint's backend

Read `CLAUDE.md` in this directory, and the `CLAUDE.md` at the repository root
before it. They are the guidance for this application, whichever agent is
reading.

**This is an existing Laravel application, already installed and running.** Do
not install PHP, Composer or Laravel Boost, and do not scaffold anything. This
file used to hold the Laravel skeleton's own setup instructions, which said to
do all three: the opposite of `CLAUDE.md` beside it, in the file an agent that
is not Claude reads first.

```bash
./vendor/bin/phpunit     # the domain and feature tests
./vendor/bin/pint --test # formatting, as CI runs it
```
