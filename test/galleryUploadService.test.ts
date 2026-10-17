import { apiError, ok, silenceApiLogs, stubFetch } from './support';
import { afterEach, beforeEach, mock, test } from 'node:test';
import assert from 'node:assert/strict';
import { ApiError } from '../src/lib/api/errors';
import { createGalleryPhoto, getUploadOptions, isTrustedAuthor, PhotoRefusedError } from '../src/services/gallery';

beforeEach(() => silenceApiLogs());
afterEach(() => mock.restoreAll());

const MEMBER = '812345678901234567';
const botUser = (extra: Record<string, unknown> = {}) => ({
  id: 1,
  discord_id: MEMBER,
  enabled: true,
  ign: 'alex',
  minecraft_status: 'premium',
  has_password: false,
  trusted_author: true,
  ...extra,
});

/** Starts over with a new answer, for tests that check several in a row. */
const answerWith = (...answers: Array<Response | Error>) => {
  mock.restoreAll();
  silenceApiLogs();
  return stubFetch(...answers);
};

test('a trusted author must also be enabled; an unknown member is not one', async () => {
  answerWith(ok(botUser()));
  assert.equal(await isTrustedAuthor(MEMBER), true);

  answerWith(ok(botUser({ enabled: false })));
  assert.equal(await isTrustedAuthor(MEMBER), false);

  answerWith(ok(botUser({ trusted_author: false })));
  assert.equal(await isTrustedAuthor(MEMBER), false);

  answerWith(apiError(404, 'not_found'));
  assert.equal(await isTrustedAuthor(MEMBER), false);
});

test('a failing trusted-author lookup is thrown for the caller to log', async () => {
  answerWith(apiError(500, 'internal'));
  await assert.rejects(isTrustedAuthor(MEMBER), ApiError);
});

test('the upload options come from the API, and an unknown member has none', async () => {
  const options = {
    can_upload: true,
    discord_name: 'alex',
    editions: [{ id: 'ed1', name: 'Tezzlar', restricted: false }],
    categories: [{ id: 'build', name: 'Build' }],
  };
  const calls = answerWith(ok(options));

  assert.deepEqual(await getUploadOptions(MEMBER), options);
  assert.deepEqual(calls, [{ method: 'GET', path: `/v1/discord/users/${MEMBER}/upload-options`, body: undefined }]);

  answerWith(apiError(404, 'not_found'));
  assert.equal(await getUploadOptions(MEMBER), null);
});

test('with a time limit the options are asked once, not retried', async () => {
  const calls = answerWith(apiError(503, 'unavailable'));

  await assert.rejects(getUploadOptions(MEMBER, 100), ApiError);

  assert.equal(calls.length, 1);
});

test('a created photo is posted as sent and returned', async () => {
  const body = { discord_id: MEMBER, url: 'https://res.cloudinary.com/panita/x.png', title: 'Castillo', description: null, edition_id: 'ed1', category_ids: ['build'] };
  const calls = answerWith(ok({ id: 'photo-1' }, {}, 201));

  assert.deepEqual(await createGalleryPhoto(body), { id: 'photo-1' });
  assert.deepEqual(calls, [{ method: 'POST', path: '/v1/discord/photos', body }]);
});

test('the refusals of a photo become a PhotoRefusedError with their reason', async () => {
  const cases: Array<[Response, string]> = [
    [apiError(404, 'not_found'), 'not_found'],
    [apiError(403, 'forbidden'), 'not_allowed'],
    [apiError(403, 'forbidden', { fields: ['category_ids'] }), 'reserved_category'],
    [apiError(400, 'invalid_request', { reason: 'unknown_id', fields: ['edition_id'] }), 'unknown_id'],
    [apiError(400, 'invalid_request', { fields: ['title'] }), 'invalid'],
  ];
  for (const [answer, reason] of cases) {
    answerWith(answer);
    await assert.rejects(
      createGalleryPhoto({ discord_id: MEMBER, url: 'u', title: 't', edition_id: 'e', category_ids: ['c'] }),
      (error: Error) => error instanceof PhotoRefusedError && error.reason === reason,
      reason,
    );
  }
});

test('a server error is thrown as it is, as an unknown outcome, and never retried', async () => {
  const calls = answerWith(apiError(503, 'unavailable'));

  await assert.rejects(
    createGalleryPhoto({ discord_id: MEMBER, url: 'u', title: 't', edition_id: 'e', category_ids: ['c'] }),
    (error: Error) => error instanceof ApiError && error.transient,
  );
  assert.equal(calls.length, 1);
});
