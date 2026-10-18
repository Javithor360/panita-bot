import './support';
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { existsSync, mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { zipSync } from 'fflate';
import { STORE_FILES, assetsFromJar, downloadAssets, wantedInJar, writeAssets } from '../src/features/minecraft/render/assets';
import { createCardProvider } from '../src/features/minecraft/render/provider';

const sha1 = (data: Uint8Array) => createHash('sha1').update(data).digest('hex');
const bytes = (text: string) => new TextEncoder().encode(text);

const JAR = zipSync({
  'assets/minecraft/font/default.json': bytes('{"providers":[]}'),
  'assets/minecraft/textures/font/ascii.png': bytes('png'),
  'assets/minecraft/textures/gui/sprites/icon/ping_5.png': bytes('ping'),
  'assets/minecraft/textures/block/stone.png': bytes('stone'),
  'assets/minecraft/sounds.json': bytes('{}'),
  'net/minecraft/Main.class': bytes('class'),
});
const UNIFONT_JSON = bytes('{"providers":[{"type":"unihex","hex_file":"minecraft:font/unifont.zip"}]}');
const UNIFONT_ZIP = bytes('zip');

const MANIFEST_URL = 'https://piston-meta.mojang.com/mc/game/version_manifest_v2.json';
const VERSION_URL = 'https://piston-meta.mojang.com/v1/packages/abc/1.21.json';
const INDEX_URL = 'https://piston-meta.mojang.com/v1/packages/def/17.json';
const JAR_URL = 'https://piston-data.mojang.com/v1/objects/jar/client.jar';
const object = (data: Uint8Array) => `https://resources.download.minecraft.net/${sha1(data).slice(0, 2)}/${sha1(data)}`;

/** A Mojang that serves the files above, with the changes a test wants to make to what it says. */
const mojang = (changes: { jarHash?: string; unifontHash?: string; versionId?: string; host?: string } = {}) => {
  const requested: string[] = [];
  const files = new Map<string, Uint8Array>([
    [MANIFEST_URL, bytes(JSON.stringify({ latest: { release: '1.21' }, versions: [{ id: changes.versionId ?? '1.21', url: changes.host ?? VERSION_URL }, { id: '1.20', url: VERSION_URL }] }))],
    [VERSION_URL, bytes(JSON.stringify({ downloads: { client: { url: JAR_URL, sha1: changes.jarHash ?? sha1(JAR) } }, assetIndex: { url: INDEX_URL } }))],
    [
      INDEX_URL,
      bytes(JSON.stringify({ objects: { [STORE_FILES[0]]: { hash: sha1(UNIFONT_JSON) }, [STORE_FILES[1]]: { hash: changes.unifontHash ?? sha1(UNIFONT_ZIP) } } })),
    ],
    [JAR_URL, JAR],
    [object(UNIFONT_JSON), UNIFONT_JSON],
    [`https://resources.download.minecraft.net/${sha1(UNIFONT_ZIP).slice(0, 2)}/${sha1(UNIFONT_ZIP)}`, UNIFONT_ZIP],
  ]);
  const fetchFile = async (url: string) => {
    requested.push(url);
    const found = files.get(url);
    if (!found) throw new Error(`404 ${url}`);
    return Buffer.from(found);
  };
  return { fetchFile, requested };
};

const folder = () => {
  const root = mkdtempSync(join(tmpdir(), 'mc-assets-'));
  return { root, assets: join(root, 'minecraft-assets'), done: () => rmSync(root, { recursive: true, force: true }) };
};

const quiet = { log: () => {} };

test('keeps only the fonts and the latency icons of a client jar', () => {
  assert.deepEqual(Object.keys(assetsFromJar(JAR)).sort(), [
    'assets/minecraft/font/default.json',
    'assets/minecraft/textures/font/ascii.png',
    'assets/minecraft/textures/gui/sprites/icon/ping_5.png',
  ]);
  assert.equal(wantedInJar('assets/minecraft/font/'), false);
  assert.equal(wantedInJar('assets/minecraft/textures/gui/sprites/icon/ping_unknown.png'), true);
  assert.equal(wantedInJar('assets/minecraft/textures/gui/sprites/icon/news.png'), false);
});

test('writes files under the folder and refuses a path that leaves it', async () => {
  const { root, done } = folder();
  try {
    await writeAssets(root, { 'a/b.txt': bytes('x') });
    assert.equal(readFileSync(join(root, 'a/b.txt'), 'utf8'), 'x');
    await assert.rejects(writeAssets(root, { '../outside.txt': bytes('x') }), /unsafe/);
    await assert.rejects(writeAssets(root, { '/abs.txt': bytes('x') }), /unsafe/);
  } finally {
    done();
  }
});

test('downloads the fonts of the latest release from Mojang and checks every file against its hash', async () => {
  const { assets, done } = folder();
  try {
    const { fetchFile, requested } = mojang();
    await downloadAssets({ folder: assets, fetchFile, logger: quiet });

    assert.equal(readFileSync(join(assets, 'assets/minecraft/font/default.json'), 'utf8'), '{"providers":[]}');
    assert.equal(readFileSync(join(assets, 'assets/minecraft/font/unifont.zip'), 'utf8'), 'zip');
    assert.equal(readFileSync(join(assets, 'assets/minecraft/font/include/unifont.json')).length, UNIFONT_JSON.length);
    assert.equal(existsSync(`${assets}.partial`), false);
    assert.ok(requested.every(url => url.startsWith('https://')));
  } finally {
    done();
  }
});

test('takes the version it is told to instead of the latest', async () => {
  const { assets, done } = folder();
  try {
    await assert.rejects(downloadAssets({ folder: assets, version: '9.9', fetchFile: mojang().fetchFile, logger: quiet }), /no version 9.9/);
    await downloadAssets({ folder: assets, version: '1.20', fetchFile: mojang().fetchFile, logger: quiet });
    assert.ok(existsSync(join(assets, 'assets/minecraft/font/default.json')));
  } finally {
    done();
  }
});

test('a file that does not match its hash leaves nothing behind', async () => {
  for (const changes of [{ jarHash: 'f'.repeat(40) }, { unifontHash: 'e'.repeat(40) }]) {
    const { assets, done } = folder();
    try {
      await assert.rejects(downloadAssets({ folder: assets, fetchFile: mojang(changes).fetchFile, logger: quiet }));
      assert.equal(existsSync(assets), false);
      assert.equal(existsSync(`${assets}.partial`), false);
    } finally {
      done();
    }
  }
});

test('never fetches from a host that is not Mojang\'s, whatever the manifest says', async () => {
  const { assets, done } = folder();
  try {
    const { fetchFile, requested } = mojang({ host: 'https://evil.example.com/version.json' });
    await assert.rejects(downloadAssets({ folder: assets, fetchFile, logger: quiet }), /not a Mojang host/);
    assert.ok(requested.every(url => new URL(url).hostname.endsWith('mojang.com')));
  } finally {
    done();
  }
});

test('the provider fills an empty folder from Mojang on first use and keeps it afterwards', async () => {
  const { assets, done } = folder();
  try {
    const { fetchFile, requested } = mojang();
    const provider = createCardProvider({
      assetsDir: assets,
      avatars: { premium: 'https://h.test/{uuid}', cracked: 'https://h.test/steve', skin: 'https://h.test/{skin}' },
      logger: { log: () => {}, error: () => {} },
      fetchFile,
    });
    const first = await provider();
    assert.ok(first);
    const downloads = requested.length;
    assert.equal(await provider(), first);
    assert.equal(requested.length, downloads, 'nothing is downloaded again');
  } finally {
    done();
  }
});

test('when Mojang cannot be reached the provider is off, says so, and tries again only after an hour', async () => {
  const { assets, done } = folder();
  try {
    let now = 1_000;
    const errors: unknown[] = [];
    let calls = 0;
    const provider = createCardProvider({
      assetsDir: assets,
      avatars: { premium: 'https://h.test/{uuid}', cracked: 'https://h.test/steve', skin: 'https://h.test/{skin}' },
      logger: { log: () => {}, error: error => errors.push(error) },
      now: () => now,
      fetchFile: async () => {
        calls++;
        throw new Error('down');
      },
    });
    assert.equal(await provider(), null);
    assert.equal(await provider(), null);
    assert.equal(calls, 1);
    assert.equal(errors.length, 1);
    now += 61 * 60 * 1000;
    assert.equal(await provider(), null);
    assert.equal(calls, 2);
  } finally {
    done();
  }
});
