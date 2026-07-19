import { cp, mkdir, readdir, rm } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

/**
 * Copies country flag SVGs into `public/flags` so they are served from our own
 * origin.
 *
 * The application must not request anything from a third-party host at runtime —
 * a flag CDN would transmit every visitor's IP address to someone else and break
 * the guarantee the end-to-end test enforces.
 *
 * The files are generated rather than committed: they come from a dependency, so
 * checking 265 SVGs into the repository would only duplicate it. They stay out
 * of the JavaScript bundle entirely and are fetched individually by the browser
 * as flags actually appear on screen.
 */
const here = dirname(fileURLToPath(import.meta.url));
const source = join(here, '..', 'node_modules', 'country-flag-icons', '3x2');
const target = join(here, '..', 'public', 'flags');

try {
  const files = await readdir(source);
  const svgs = files.filter((name) => name.endsWith('.svg'));

  if (svgs.length === 0) {
    throw new Error(`No SVG files found in ${source}`);
  }

  await rm(target, { recursive: true, force: true });
  await mkdir(target, { recursive: true });

  await Promise.all(svgs.map((name) => cp(join(source, name), join(target, name))));

  console.log(`sync-flags: copied ${String(svgs.length)} flags to public/flags`);
} catch (error) {
  console.error('sync-flags failed:', error instanceof Error ? error.message : error);
  process.exitCode = 1;
}
