/** Something the API needs in order to serve: a database role, Redis, storage, SMTP. */
export interface DependencyCheck {
  readonly name: string;
  check(): Promise<void>;
}

function withTimeout(task: Promise<void>, timeoutMs: number): Promise<void> {
  let timer: NodeJS.Timeout | undefined;
  const timeout = new Promise<never>((_, reject) => {
    timer = setTimeout(() => reject(new Error('timed out')), timeoutMs);
  });
  return Promise.race([task, timeout]).finally(() => clearTimeout(timer));
}

async function passes(
  check: DependencyCheck,
  timeoutMs: number,
): Promise<boolean> {
  try {
    await withTimeout(check.check(), timeoutMs);
    return true;
  } catch {
    return false;
  }
}

/**
 * Runs every check in parallel, each bounded by the timeout so a hung dependency cannot
 * hang the probe, and returns the names of the ones that failed.
 */
export async function failingDependencies(
  checks: readonly DependencyCheck[],
  timeoutMs: number,
): Promise<string[]> {
  const results = await Promise.all(
    checks.map((check) => passes(check, timeoutMs)),
  );
  return checks
    .filter((_, index) => !results[index])
    .map((check) => check.name);
}
