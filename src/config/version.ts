import { readFileSync } from 'node:fs';
import { join } from 'node:path';

/**
 * Reads `version` out of a `package.json` file. `null` when the file is missing, is not JSON or has no
 * usable version, so a broken deploy never stops the bot from starting.
 */
export const readVersion = (file: string): string | null => {
  try {
    const { version } = JSON.parse(readFileSync(file, 'utf8')) as { version?: unknown };
    return typeof version === 'string' && version.trim() ? version.trim() : null;
  } catch {
    return null;
  }
};

/**
 * The version of the bot: the single source is `version` in `package.json`, bumped on each branch (see
 * AGENTS.md). Both `src/config` and `dist/config` sit two levels under the project root, so one path works
 * for `ts-node` and for the compiled bot (`tsconfig` has `rootDir: ./src`, so the file is read, not imported).
 */
export const BOT_VERSION = readVersion(join(__dirname, '..', '..', 'package.json')) ?? 'unknown';
