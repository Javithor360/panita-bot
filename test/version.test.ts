import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { BOT_VERSION, readVersion } from '../src/config/version';

const SEMVER = /^\d+\.\d+\.\d+$/;

test('the bot version is the version in package.json, as x.y.z', () => {
  const pkg = JSON.parse(readFileSync(join(__dirname, '..', 'package.json'), 'utf8')) as { version: string };
  assert.match(pkg.version, SEMVER);
  assert.equal(BOT_VERSION, pkg.version);
});

test('the bot starts on major 2 or later', () => {
  assert.ok(Number(BOT_VERSION.split('.')[0]) >= 2);
});

test('a missing, broken or version-less package.json gives null instead of throwing', () => {
  const dir = mkdtempSync(join(tmpdir(), 'panita-version-'));
  const write = (name: string, content: string) => {
    const file = join(dir, name);
    writeFileSync(file, content);
    return file;
  };

  assert.equal(readVersion(join(dir, 'missing.json')), null);
  assert.equal(readVersion(write('broken.json', '{ not json')), null);
  assert.equal(readVersion(write('none.json', '{"name":"x"}')), null);
  assert.equal(readVersion(write('number.json', '{"version":2}')), null);
  assert.equal(readVersion(write('blank.json', '{"version":"  "}')), null);
  assert.equal(readVersion(write('ok.json', '{"version":" 2.1.0 "}')), '2.1.0');
});
