import { apiError, ok, silenceApiLogs, stubFetch } from './support';
import { afterEach, beforeEach, mock, test } from 'node:test';
import assert from 'node:assert/strict';
import { UserError } from '../src/core/errors';
import { deleteTag, getTag, listTags, saveTag, TAG_NAME_PATTERN } from '../src/services/tags';

beforeEach(() => silenceApiLogs());
afterEach(() => mock.restoreAll());

const tag = { id: 'a1', name: 'ip', content: 'play.panitacraft.com', media_urls: [], author_id: '812345678901234567', created_at: '2026-01-01T00:00:00.000Z' };

test('name pattern: letters (accents allowed), digits, _ and -, up to 64', () => {
  for (const valid of ['ip', 'guía', 'ñandú', 'a_b-c', '123', 'a'.repeat(64)]) assert.ok(TAG_NAME_PATTERN.test(valid), valid);
  for (const invalid of ['', 'a b', '¿hola?', 'a/b', 'a.b', 'a'.repeat(65), 'a\nb']) assert.ok(!TAG_NAME_PATTERN.test(invalid), JSON.stringify(invalid));
});

test('listTags asks for every tag', async () => {
  const calls = stubFetch(ok([tag], { meta: { count: 1 } }));

  assert.deepEqual(await listTags(), [tag]);
  assert.deepEqual(calls, [{ method: 'GET', path: '/v1/tags', body: undefined }]);
});

test('getTag returns the tag, null on 404 and makes no request for an invalid name', async () => {
  let calls = stubFetch(ok(tag));
  assert.deepEqual(await getTag('ip'), tag);
  assert.deepEqual(calls, [{ method: 'GET', path: '/v1/tags/ip', body: undefined }]);

  mock.restoreAll();
  silenceApiLogs();
  calls = stubFetch(apiError(404, 'not_found'));
  assert.equal(await getTag('nope'), null);

  mock.restoreAll();
  silenceApiLogs();
  calls = stubFetch(ok(tag));
  assert.equal(await getTag('¿hola?'), null);
  assert.equal(calls.length, 0);
});

test('getTag encodes accents in the path', async () => {
  const calls = stubFetch(ok(tag));

  await getTag('guía');

  assert.equal(calls[0].path, '/v1/tags/gu%C3%ADa');
});

test('getTag propagates failures other than 404', async () => {
  stubFetch(apiError(500, 'internal_error'));

  await assert.rejects(getTag('ip'));
});

test('saveTag sends the full state with PUT', async () => {
  const calls = stubFetch(ok(tag, {}, 201));

  await saveTag({ name: 'ip', content: 'hola', mediaUrls: ['https://cdn.discordapp.com/a.png'], authorId: '812345678901234567' });

  assert.deepEqual(calls, [{
    method: 'PUT',
    path: '/v1/tags/ip',
    body: { content: 'hola', media_urls: ['https://cdn.discordapp.com/a.png'], author_id: '812345678901234567' },
  }]);
});

test('saveTag sends null content for attachment-only or blank text', async () => {
  const calls = stubFetch(ok(tag));

  await saveTag({ name: 'ip', content: null, mediaUrls: ['https://cdn.discordapp.com/a.png'], authorId: '812345678901234567' });
  await saveTag({ name: 'ip', content: '   ', mediaUrls: ['https://cdn.discordapp.com/a.png'], authorId: '812345678901234567' });

  assert.equal((calls[0].body as { content: unknown }).content, null);
  assert.equal((calls[1].body as { content: unknown }).content, null);
});

test('saveTag refuses an invalid name or too many attachments without a request', async () => {
  const calls = stubFetch(ok(tag));
  const base = { content: 'x', mediaUrls: [] as string[], authorId: '812345678901234567' };

  await assert.rejects(saveTag({ ...base, name: 'con espacio' }), (error: unknown) => error instanceof UserError && /letras, números/.test(error.message));
  await assert.rejects(saveTag({ ...base, name: 'ip', mediaUrls: Array(11).fill('https://cdn.discordapp.com/a.png') }), UserError);
  assert.equal(calls.length, 0);
});

test('deleteTag returns true when deleted, false on 404 and false without a request for an invalid name', async () => {
  let calls = stubFetch(ok({ deleted: true }));
  assert.equal(await deleteTag('ip'), true);
  assert.deepEqual(calls, [{ method: 'DELETE', path: '/v1/tags/ip', body: undefined }]);

  mock.restoreAll();
  silenceApiLogs();
  stubFetch(apiError(404, 'not_found'));
  assert.equal(await deleteTag('ip'), false);

  mock.restoreAll();
  silenceApiLogs();
  calls = stubFetch(ok({ deleted: true }));
  assert.equal(await deleteTag('a b'), false);
  assert.equal(calls.length, 0);
});
