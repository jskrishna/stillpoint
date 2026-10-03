/**
 * One reporter for all of these scripts, and the reason is a day spent not
 * being able to read a CI failure.
 *
 * The `e2e` job went red with "Process completed with exit code 1" and nothing
 * else. The script's own `FAIL` line was in the job log, the job log is served
 * from blob storage, and that is not always reachable — from this development
 * container it is refused outright by egress policy. So the one place the
 * reason existed was the one place nobody could look, and the run had to be
 * diagnosed by guessing.
 *
 * Under GitHub Actions this also emits each failure as a workflow `::error::`
 * command. Those become **annotations**, which show on the run and the pull
 * request without opening a log, and which the API will hand over on their own.
 * A check whose result cannot be read is most of a check.
 *
 * It also installs handlers for an uncaught throw, because a Playwright
 * timeout used to end these scripts with a stack trace and no indication of
 * which assertion was being attempted.
 */

const inActions = process.env.GITHUB_ACTIONS === 'true';

/** Workflow commands are line-based: a literal newline would end the command. */
const oneLine = (text) =>
  String(text).replace(/%/g, '%25').replace(/\r/g, '%0D').replace(/\n/g, '%0A');

/**
 * @param {string} name What this script is, for the annotation's title.
 */
export function reporter(name) {
  const fails = [];

  const ok = (label) => {
    console.log(`  ok   ${label}`);
  };

  const bad = (label, detail) => {
    fails.push(label);
    console.log(`  FAIL ${label}${detail ? ` — ${detail}` : ''}`);
    if (inActions) {
      const where = detail ? `${label} — ${detail}` : label;
      console.log(`::error title=${oneLine(name)}::${oneLine(where)}`);
    }
  };

  const section = (heading) => {
    console.log(`\n${heading}`);
  };

  /**
   * Call this instead of `process.exit` at the end.
   *
   * @param {() => Promise<void>} [cleanUp] Closing the browser, usually.
   */
  const finish = async (cleanUp) => {
    if (cleanUp) await cleanUp().catch(() => undefined);

    console.log(
      fails.length === 0 ? '\nALL PASSED' : `\n${String(fails.length)} FAILED: ${fails.join('; ')}`,
    );
    process.exit(fails.length === 0 ? 0 : 1);
  };

  /**
   * Anything thrown that an assertion did not catch — a Playwright timeout,
   * most often, which otherwise ends the script with a stack trace and no clue
   * which step was being attempted.
   */
  const watchForThrows = () => {
    const report = (what) => (error) => {
      const message = error instanceof Error ? `${error.name}: ${error.message}` : String(error);
      console.log(`\n  THREW (${what}) ${message}`);
      if (inActions)
        console.log(`::error title=${oneLine(name)}::${oneLine(`${what}: ${message}`)}`);
      process.exit(1);
    };
    process.on('uncaughtException', report('uncaught'));
    process.on('unhandledRejection', report('unhandled rejection'));
  };

  return { ok, bad, section, finish, fails, watchForThrows };
}
