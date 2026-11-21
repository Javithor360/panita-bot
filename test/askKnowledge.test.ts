import { apiError, ok, silenceApiLogs, stubFetch } from './support';
import assert from 'node:assert/strict';
import { afterEach, beforeEach, describe, it, mock } from 'node:test';
import { ApiError } from '../src/lib/api';
import { getAuthorRandomPhoto } from '../src/services/gallery';
import { CallBudgetError, createCallBudget, createKnowledge } from '../src/services/knowledge';

const PLAYER = {
  status: 'visible', ign: 'Javithor360', joined_at: '2025-03-01T10:00:00.000Z', roles: ['Miembro'], emblem_count: 2, title_count: 1,
  emblems: [], emblems_truncated: false, editions: [], photo_counts: { images: 1, videos: 0 }, nationality: null, orientation: null, birthday: null,
};

let clock = 0;
const knowledge = () => createKnowledge(() => clock);

beforeEach(() => {
  clock = 1_000;
  silenceApiLogs();
});
afterEach(() => mock.restoreAll());

describe('knowledge reads', () => {
  it('reads a player once and serves the next questions from memory, case-insensitively', async () => {
    const calls = stubFetch(ok(PLAYER));
    const k = knowledge();

    assert.deepEqual(await k.player('Javithor360'), PLAYER);
    assert.deepEqual(await k.player('javithor360'), PLAYER);
    assert.equal(calls.length, 1);
    assert.equal(calls[0].path, '/v1/bot/players/Javithor360');
    assert.equal(calls[0].method, 'GET');
  });

  it('passes a hidden profile through as it comes: the name and nothing else', async () => {
    stubFetch(ok({ status: 'private', ign: 'Hidden' }));
    assert.deepEqual(await knowledge().player('Hidden'), { status: 'private', ign: 'Hidden' });
  });

  it('answers null for an unknown name and does not ask again for two minutes', async () => {
    const calls = stubFetch(apiError(404, 'not_found'), ok(PLAYER));
    const k = knowledge();

    assert.equal(await k.player('Nobody'), null);
    clock += 119_000;
    assert.equal(await k.player('Nobody'), null);
    assert.equal(calls.length, 1);
    clock += 2_000;
    assert.deepEqual(await k.player('Nobody'), PLAYER);
    assert.equal(calls.length, 2);
  });

  it('keeps a player for an hour and then reads it again', async () => {
    const calls = stubFetch(ok(PLAYER));
    const k = knowledge();
    await k.player('Javithor360');
    clock += 3_599_000;
    await k.player('Javithor360');
    assert.equal(calls.length, 1);
    clock += 2_000;
    await k.player('Javithor360');
    assert.equal(calls.length, 2);
  });

  it('shares one call between simultaneous questions', async () => {
    const calls = stubFetch(ok(PLAYER));
    const k = knowledge();
    await Promise.all([k.player('Javithor360'), k.player('Javithor360'), k.player('JAVITHOR360')]);
    assert.equal(calls.length, 1);
  });

  it('does not remember a failure', async () => {
    const calls = stubFetch(apiError(500, 'internal_error'), ok(PLAYER));
    const k = knowledge();
    await assert.rejects(k.player('Javithor360'), (error: unknown) => error instanceof ApiError && error.status === 500);
    assert.deepEqual(await k.player('Javithor360'), PLAYER);
    assert.equal(calls.length, 2);
  });

  it('answers null for a private or unknown edition alike', async () => {
    stubFetch(apiError(404, 'not_found'));
    assert.equal(await knowledge().edition('secret'), null);
  });

  it('reads the top photo, the picks of a year, the donors and the instances from their routes', async () => {
    const calls = stubFetch(
      ok({ status: 'visible', ign: 'A', photo: null }),
      ok([{ month: '2026-01', ign: 'A', private: false }], { meta: { count: 1 } }),
      ok({ current: [], by_edition: [], hidden_count: 0 }),
      ok([{ slug: 'x', name: 'X', description: null, source_type: 'vanilla', minecraft_version: '1.21', loader: null, enabled: true }], { meta: { count: 1 } }),
    );
    const k = knowledge();

    await k.topPhoto('A');
    assert.equal((await k.panitaPicks(2026))[0].month, '2026-01');
    assert.equal((await k.donors()).hidden_count, 0);
    assert.equal((await k.instances())[0].slug, 'x');
    assert.deepEqual(calls.map(call => call.path), [
      '/v1/bot/players/A/top-photo',
      '/v1/bot/community/panita-picks?year=2026',
      '/v1/bot/community/donors',
      '/v1/instances?enabled_only=true',
    ]);
  });

  it('remembers the names of editions and forms for the gate', async () => {
    stubFetch(
      ok([{ id: 'panitamon', name: 'Panitamon', started_at: null, ended_at: null, is_canon: true }], { meta: { count: 1 } }),
      ok([{ slug: 'survey', title: 'Encuesta', description: null, is_open: true, require_login: false, question_count: 3 }], { meta: { count: 1 } }),
    );
    const k = knowledge();
    assert.deepEqual(k.known(), { editions: [], forms: [] });
    await k.warm();
    assert.equal(k.known().editions[0].name, 'Panitamon');
    assert.equal(k.known().forms[0].slug, 'survey');
  });

  it('warm never throws when the API is down, and does not hit it again for a minute', async () => {
    const calls = stubFetch(apiError(500, 'internal_error'));
    const k = knowledge();
    await k.warm();
    const first = calls.length;
    await k.warm();
    await k.warm();
    assert.equal(calls.length, first);
    clock += 61_000;
    await k.warm();
    assert.ok(calls.length > first);
  });
});

describe('calls per question', () => {
  it('lets a question start three calls and refuses the fourth', async () => {
    const calls = stubFetch(ok(PLAYER));
    const k = knowledge();
    const budget = createCallBudget(3);

    await k.player('A', budget);
    await k.player('B', budget);
    await k.player('C', budget);
    await assert.rejects(k.player('D', budget), CallBudgetError);
    assert.equal(calls.length, 3);
  });

  it('does not count what comes from memory', async () => {
    const calls = stubFetch(ok(PLAYER));
    const k = knowledge();
    await k.player('A');

    const budget = createCallBudget(1);
    await k.player('A', budget);
    await k.player('A', budget);
    await k.player('B', budget);
    assert.equal(calls.length, 2);
  });
});

describe('random photo of an author', () => {
  const PHOTO = {
    id: 'p1', url: 'https://img.test/p1.jpg', title: 'Torre', description: null, date_taken: null, created_at: '2026-01-10T18:00:00.000Z',
    user: { ign: 'A' }, edition: null, categories: [],
  };

  it('asks for the `random` selector of the author and is never cached', async () => {
    const calls = stubFetch(ok(PHOTO));
    const first = await getAuthorRandomPhoto('A');
    await getAuthorRandomPhoto('A');

    assert.equal(calls.length, 2);
    assert.equal(calls[0].path, '/v1/photos/by-author/A/random');
    assert.equal(first?.created_at instanceof Date, true);
  });

  it('is null when the author has none or the name is unknown', async () => {
    stubFetch(apiError(404, 'not_found'));
    assert.equal(await getAuthorRandomPhoto('Nobody'), null);
  });
});
