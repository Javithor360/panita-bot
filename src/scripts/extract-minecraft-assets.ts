/**
 * Copies the few files of the game that the Minecraft pictures need (its fonts and the latency icons) out of an installed
 * client, into a folder the bot reads (`MC_ASSETS_DIR`, `data/minecraft-assets` by default). The files belong to Mojang, so they
 * are never committed: each machine that runs the bot makes its own copy.
 *
 *   npm run assets:minecraft -- <client jar> <assets folder> [output folder]
 *
 * The client jar is `libraries/com/mojang/minecraft/<version>/minecraft-<version>-client.jar` of a Prism instance (or
 * `versions/<version>/<version>.jar` of the official launcher); the assets folder is the one with `indexes` and `objects` in it.
 */
import { mkdirSync, readFileSync, readdirSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { STORE_FILES, assetsFromJar } from '../features/minecraft/render/assets';

const [jarPath, assetsPath, outputPath = 'data/minecraft-assets'] = process.argv.slice(2);
if (!jarPath || !assetsPath) {
  console.error('Usage: npm run assets:minecraft -- <client jar> <assets folder> [output folder]');
  process.exit(1);
}

const write = (path: string, data: Uint8Array) => {
  const file = join(outputPath, path);
  mkdirSync(dirname(file), { recursive: true });
  writeFileSync(file, data);
  console.log(`  ${path}`);
};

console.log(`Reading ${jarPath}`);
for (const [name, data] of Object.entries(assetsFromJar(new Uint8Array(readFileSync(jarPath))))) write(name, data);

// The asset store names its files by hash; the index says which hash is which file. The newest index is the one in use.
const indexes = readdirSync(join(assetsPath, 'indexes'))
  .filter(name => /^\d+\.json$/.test(name))
  .sort((a, b) => Number.parseInt(a) - Number.parseInt(b));
const index = JSON.parse(readFileSync(join(assetsPath, 'indexes', indexes[indexes.length - 1]), 'utf8')) as {
  objects: Record<string, { hash: string }>;
};
for (const name of STORE_FILES) {
  const hash = index.objects[name]?.hash;
  if (!hash) {
    console.error(`The asset index has no ${name}`);
    process.exit(1);
  }
  write(`assets/${name}`, readFileSync(join(assetsPath, 'objects', hash.slice(0, 2), hash)));
}
console.log(`Done: ${outputPath}`);
