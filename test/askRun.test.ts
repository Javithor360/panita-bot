import { apiError, json, silenceApiLogs } from './support';
import assert from 'node:assert/strict';
import { afterEach, beforeEach, describe, it, mock } from 'node:test';
import { runLookups } from '../src/features/ask/run';
import { createCallBudget, createKnowledge } from '../src/services/knowledge';

type Routes = Record<string, () => Response>;

/** Answers by path; a path with no route is a test failure. Returns the paths that were asked, in order. */
const routes = (table: Routes) => {
  const asked: string[] = [];
  mock.method(globalThis, 'fetch', async (url: string) => {
    const path = url.replace('https://api.test.invalid', '');
    asked.push(path);
    const route = table[path];
    if (!route) throw new Error(`unexpected call: ${path}`);
    return route().clone();
  });
  return asked;
};

const ok = (data: unknown) => () => json(200, { data });
const notFound = () => apiError(404, 'not_found');

const PLAYER = {
  status: 'visible', ign: 'Ana', joined_at: '2025-03-01T10:00:00.000Z', roles: [], emblem_count: 1, title_count: 0, emblems: [], emblems_truncated: false,
  editions: [], photo_counts: { images: 2, videos: 0 }, nationality: null, orientation: null, birthday: null,
};
const EDITIONS = [
  { id: 'panitamon', name: 'Panitamon', started_at: '2026-01-24T06:00:00.000Z', ended_at: '2026-03-15T06:00:00.000Z', is_canon: true },
  { id: 'enriquecraft', name: 'Enriquecraft 666', started_at: '2026-11-27T06:00:00.000Z', ended_at: null, is_canon: false },
];
const DETAIL = { ...EDITIONS[0], synopsis: null, participant_count: 3, hidden_count: 1, participants: ['A', 'B'], participants_truncated: false, emblem_count: 0, emblems: [] };

const NOW = () => new Date('2026-11-20T12:00:00.000Z');
const setup = () => ({ knowledge: createKnowledge(), now: NOW, warn: () => {} });
const requestedOf = (...lookups: Array<{ kind: string } & Record<string, unknown>>) => lookups as unknown as Parameters<typeof runLookups>[0];

beforeEach(() => silenceApiLogs());
afterEach(() => mock.restoreAll());

describe('running the lookups', () => {
  it('reads a player and an edition in parallel and keeps each result', async () => {
    const asked = routes({
      '/v1/bot/players/Ana': ok(PLAYER),
      '/v1/bot/editions': ok(EDITIONS),
      '/v1/bot/editions/panitamon': ok(DETAIL),
    });
    const { results } = await runLookups(requestedOf({ kind: 'player', ign: 'Ana' }, { kind: 'edition', name: 'panitamon' }), setup(), createCallBudget());

    assert.equal(results[0].kind, 'player');
    assert.equal(results[1].kind === 'edition' && results[1].edition?.participant_count, 3);
    assert.deepEqual([...asked].sort(), ['/v1/bot/editions', '/v1/bot/editions/panitamon', '/v1/bot/players/Ana']);
  });

  it('answers the same for an edition that is not in the list and one whose detail is a 404', async () => {
    const asked = routes({ '/v1/bot/editions': ok(EDITIONS), '/v1/bot/editions/panitamon': notFound });
    const deps = setup();
    const [missing, gone] = (await runLookups(requestedOf({ kind: 'edition', name: 'Algo Privado' }, { kind: 'edition', name: 'Panitamon' }), deps, createCallBudget())).results;

    assert.deepEqual(missing, { kind: 'edition', name: 'Algo Privado', edition: null });
    assert.deepEqual(gone, { kind: 'edition', name: 'Panitamon', edition: null });
    assert.ok(!asked.some(path => path.includes('algo')), 'a name that is not listed is never asked for by id');
  });

  it('finds an edition that is announced and has not started', async () => {
    routes({ '/v1/bot/editions': ok(EDITIONS), '/v1/bot/editions/enriquecraft': ok({ ...DETAIL, ...EDITIONS[1] }) });
    const { results } = await runLookups(requestedOf({ kind: 'edition', name: 'Enriquecraft 666' }), setup(), createCallBudget());
    assert.equal(results[0].kind === 'edition' && results[0].edition?.id, 'enriquecraft');
  });

  it('finds a form in the list without another call', async () => {
    const form = { slug: 'survey', title: 'Encuesta', description: null, is_open: true, require_login: false, question_count: 2 };
    const asked = routes({ '/v1/bot/forms': ok([form]) });
    const { results } = await runLookups(requestedOf({ kind: 'form', name: 'encuesta' }), setup(), createCallBudget());

    assert.deepEqual(results[0], { kind: 'form', name: 'encuesta', form });
    assert.deepEqual(asked, ['/v1/bot/forms']);
  });

  it('uses the current year for the picks when none is given', async () => {
    const asked = routes({ '/v1/bot/community/panita-picks?year=2026': ok([]), '/v1/bot/community/panita-picks?year=2025': ok([]) });
    await runLookups(requestedOf({ kind: 'panita_picks', year: null }, { kind: 'panita_picks', year: 2025 }), setup(), createCallBudget());
    assert.deepEqual([...asked].sort(), ['/v1/bot/community/panita-picks?year=2025', '/v1/bot/community/panita-picks?year=2026']);
  });

  it('asks for the photo of a visible member that has photos, after reading the profile', async () => {
    routes({ '/v1/bot/players/Ana': ok(PLAYER) });
    const outcome = await runLookups(requestedOf({ kind: 'player_random_photo', ign: 'Ana' }), setup(), createCallBudget());
    assert.equal(outcome.photoOf, 'Ana');
    assert.equal(outcome.results[0].kind === 'player_random_photo' && outcome.results[0].photo, true);
  });

  it('sends no photo for a hidden profile, a member with none, or an unknown name', async () => {
    routes({
      '/v1/bot/players/Hidden': ok({ status: 'private', ign: 'Hidden' }),
      '/v1/bot/players/Empty': ok({ ...PLAYER, ign: 'Empty', photo_counts: { images: 0, videos: 0 } }),
      '/v1/bot/players/Nobody': notFound,
    });
    for (const ign of ['Hidden', 'Empty', 'Nobody']) {
      const outcome = await runLookups(requestedOf({ kind: 'player_random_photo', ign }), setup(), createCallBudget());
      assert.equal(outcome.photoOf, null, ign);
    }
  });

  it('counts the photo the command will fetch as one of the three calls', async () => {
    const asked = routes({
      '/v1/bot/players/A': ok({ ...PLAYER, ign: 'A' }),
      '/v1/bot/players/B': ok({ ...PLAYER, ign: 'B' }),
      '/v1/bot/players/C': ok({ ...PLAYER, ign: 'C' }),
    });
    // A: profile + reserved photo, B: profile. That is the three calls
    const fits = await runLookups(requestedOf({ kind: 'player_random_photo', ign: 'A' }, { kind: 'player', ign: 'B' }), setup(), createCallBudget(3));
    assert.equal(fits.photoOf, 'A');
    assert.equal(asked.length, 2);
  });

  it('drops the photo and the lookup that does not fit in the three calls, and says so', async () => {
    routes({
      '/v1/bot/players/A': ok({ ...PLAYER, ign: 'A' }),
      '/v1/bot/players/B': ok({ ...PLAYER, ign: 'B' }),
      '/v1/bot/players/C': ok({ ...PLAYER, ign: 'C' }),
    });
    // Three profiles use the three calls, so the photo of A can not be reserved
    const { results, photoOf } = await runLookups(requestedOf({ kind: 'player_random_photo', ign: 'A' }, { kind: 'player', ign: 'B' }, { kind: 'player', ign: 'C' }), setup(), createCallBudget(3));
    assert.equal(photoOf, null);
    assert.deepEqual(results[0], { kind: 'failed', reason: 'busy' });
    assert.equal(results[1].kind, 'player');
    assert.equal(results[2].kind, 'player');
  });

  it('answers a failed lookup on its own and still answers the others', async () => {
    routes({ '/v1/bot/community/donors': () => apiError(500, 'internal_error'), '/v1/bot/players/Ana': ok(PLAYER) });
    const warnings: string[] = [];
    const { results } = await runLookups(requestedOf({ kind: 'donors' }, { kind: 'player', ign: 'Ana' }), { ...setup(), warn: m => warnings.push(m) }, createCallBudget());

    assert.deepEqual(results[0], { kind: 'failed', reason: 'unavailable' });
    assert.equal(results[1].kind, 'player');
    assert.equal(warnings.length, 1);
    assert.ok(!warnings[0].includes('Ana'), 'the log never carries what was asked');
  });

  it('serves repeated questions from memory', async () => {
    const asked = routes({ '/v1/bot/players/Ana': ok(PLAYER) });
    const deps = setup();
    await runLookups(requestedOf({ kind: 'player', ign: 'Ana' }), deps, createCallBudget());
    await runLookups(requestedOf({ kind: 'player', ign: 'ana' }), deps, createCallBudget());
    assert.equal(asked.length, 1);
  });
});
