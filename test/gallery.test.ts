import { apiError, ok, silenceApiLogs, stubFetch } from './support';
import { afterEach, beforeEach, mock, test } from 'node:test';
import assert from 'node:assert/strict';
import { ApiError } from '../src/lib/api/errors';
import { getRandomPhoto } from '../src/services/gallery';

beforeEach(() => silenceApiLogs());
afterEach(() => mock.restoreAll());

const photo = {
  id: '9c1d6e0a',
  url: 'https://res.cloudinary.com/panita/x.jpg',
  title: 'Castillo',
  description: null,
  date_taken: '2021-05-16T20:00:00.000Z',
  created_at: '2026-02-03T14:22:10.000Z',
  user: { ign: 'steve_panita' },
  edition: { id: 'tezzlar3', name: 'Tezzlar 3' },
  categories: [{ id: 'paisajes', name: 'Paisajes' }],
};

test('returns the photo with its dates as Date', async () => {
  const calls = stubFetch(ok(photo));

  const result = await getRandomPhoto();

  assert.deepEqual(calls, [{ method: 'GET', path: '/v1/photos/random', body: undefined }]);
  assert.ok(result);
  assert.ok(result.date_taken instanceof Date);
  assert.equal(result.date_taken.toISOString(), '2021-05-16T20:00:00.000Z');
  assert.ok(result.created_at instanceof Date);
  assert.equal(result.user?.ign, 'steve_panita');
  assert.deepEqual(result.categories, [{ id: 'paisajes', name: 'Paisajes' }]);
});

test('keeps an unknown date_taken as null', async () => {
  stubFetch(ok({ ...photo, date_taken: null, user: null, edition: null, categories: [] }));

  const result = await getRandomPhoto();

  assert.equal(result?.date_taken, null);
  assert.equal(result?.user, null);
});

test('an empty gallery (404) is null', async () => {
  stubFetch(apiError(404, 'not_found'));

  assert.equal(await getRandomPhoto(), null);
});

test('an unavailable API propagates the error', async () => {
  stubFetch(apiError(503, 'http_503'));

  await assert.rejects(getRandomPhoto(), (error: unknown) => error instanceof ApiError && error.status === 503);
});
