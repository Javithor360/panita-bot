import './support';
import assert from 'node:assert/strict';
import { afterEach, describe, it, mock } from 'node:test';
import { matchEdition, matchForm, MAX_LOOKUPS, parseRouterOutput, ROUTER_SCHEMA } from '../src/features/ask/lookups';
import { ROUTER_INSTRUCTIONS, routeQuestion } from '../src/features/ask/router';
import { createOpenAiClient, OpenAiError } from '../src/services/openai';

const edition = (id: string, name: string) => ({ id, name, started_at: null, ended_at: null, is_canon: true });
const EDITIONS = [edition('tezzlar', 'Tezzlar'), edition('tezzlar2', 'Tezzlar II'), edition('tezzlar3', 'Tezzlar III'), edition('panitacraft-275', 'Panitacraft 2.75'), edition('panitamon', 'Panitamon')];

describe('router output', () => {
  it('keeps a valid lookup of each kind', () => {
    const lookups = parseRouterOutput({
      lookups: [
        { kind: 'player', ign: 'Javithor360', name: null, year: null },
        { kind: 'edition', ign: null, name: 'Panitamon', year: null },
        { kind: 'panita_picks', ign: null, name: null, year: 2026 },
      ],
    });
    assert.deepEqual(lookups, [
      { kind: 'player', ign: 'Javithor360' },
      { kind: 'edition', name: 'Panitamon' },
      { kind: 'panita_picks', year: 2026 },
    ]);
  });

  it('takes the current year when the router gives none', () => {
    assert.deepEqual(parseRouterOutput({ lookups: [{ kind: 'panita_picks', ign: null, name: null, year: null }] }), [{ kind: 'panita_picks', year: null }]);
  });

  it('drops an unknown kind, a bad ign and a year out of range', () => {
    const lookups = parseRouterOutput({
      lookups: [
        { kind: 'delete_everything', ign: 'a', name: null, year: null },
        { kind: 'player', ign: '../etc/passwd', name: null, year: null },
        { kind: 'player', ign: 'has space', name: null, year: null },
        { kind: 'player', ign: 'x'.repeat(33), name: null, year: null },
        { kind: 'player', ign: null, name: null, year: null },
        { kind: 'panita_picks', ign: null, name: null, year: 1999 },
        { kind: 'panita_picks', ign: null, name: null, year: 2101 },
        { kind: 'panita_picks', ign: null, name: null, year: 2026.5 },
        { kind: 'panita_picks', ign: null, name: null, year: '2026' },
        { kind: 'edition', ign: null, name: '', year: null },
        { kind: 'edition', ign: null, name: 'x'.repeat(200), year: null },
        { kind: 'donors', ign: null, name: null, year: null },
      ],
    });
    assert.deepEqual(lookups, [{ kind: 'donors' }]);
  });

  it('accepts a leading @ on an ign and trims it', () => {
    assert.deepEqual(parseRouterOutput({ lookups: [{ kind: 'player', ign: '  @Pepe_1 ', name: null, year: null }] }), [{ kind: 'player', ign: 'Pepe_1' }]);
  });

  it('keeps no more than three, and no repeats', () => {
    const many = ['A', 'B', 'C', 'D', 'E'].map(ign => ({ kind: 'player', ign, name: null, year: null }));
    assert.equal(MAX_LOOKUPS, 3);
    assert.deepEqual(parseRouterOutput({ lookups: many }).map(l => ('ign' in l ? l.ign : '')), ['A', 'B', 'C']);
    assert.equal(parseRouterOutput({ lookups: [many[0], many[0], many[1]] }).length, 2);
  });

  it('gives nothing for output that is not the expected shape', () => {
    for (const raw of [null, undefined, 'text', 3, [], {}, { lookups: 'x' }, { lookups: [null, 4, 'x'] }]) {
      assert.deepEqual(parseRouterOutput(raw), []);
    }
  });

  it('describes a strict schema whose kinds are the enum', () => {
    assert.equal(ROUTER_SCHEMA.additionalProperties, false);
    assert.equal(ROUTER_SCHEMA.properties.lookups.maxItems, 3);
    assert.ok(ROUTER_SCHEMA.properties.lookups.items.properties.kind.enum.includes('player_random_photo'));
  });
});

describe('matching a name to the lists of the API', () => {
  it('prefers the exact name, without accents or case', () => {
    assert.equal(matchEdition('tezzlar', EDITIONS)?.id, 'tezzlar');
    assert.equal(matchEdition('TEZZLAR II', EDITIONS)?.id, 'tezzlar2');
    assert.equal(matchEdition('panitamón', EDITIONS)?.id, 'panitamon');
  });

  it('reads a digit as the roman numeral, but leaves 2.75 alone', () => {
    assert.equal(matchEdition('Tezzlar 3', EDITIONS)?.id, 'tezzlar3');
    assert.equal(matchEdition('Panitacraft 2.75', EDITIONS)?.id, 'panitacraft-275');
  });

  it('matches by id too', () => {
    assert.equal(matchEdition('tezzlar3', EDITIONS)?.id, 'tezzlar3');
  });

  it('takes the only item that contains the text, and refuses to guess between several', () => {
    assert.equal(matchEdition('mon', EDITIONS)?.id, 'panitamon');
    assert.equal(matchEdition('tezz', EDITIONS), null);
    assert.equal(matchEdition('Tezzlar IV', EDITIONS), null);
  });

  it('never finds an edition that is not in the list', () => {
    assert.equal(matchEdition('Algo Secreto', EDITIONS), null);
    assert.equal(matchEdition('Algo Secreto', []), null);
  });

  it('matches a form by title or slug', () => {
    const forms = [{ slug: 'survey-tezzlar3', title: 'Formulario Diagnóstico ~ Tezzlar III', description: null, is_open: true, require_login: true, question_count: 4 }];
    assert.equal(matchForm('survey-tezzlar3', forms)?.slug, 'survey-tezzlar3');
    assert.equal(matchForm('formulario diagnostico', forms)?.slug, 'survey-tezzlar3');
    assert.equal(matchForm('otro', forms), null);
  });
});

describe('router call', () => {
  afterEach(() => mock.restoreAll());

  const json = (body: unknown) => new Response(JSON.stringify(body), { status: 200, headers: { 'content-type': 'application/json' } });
  const message = (text: string) => json({ status: 'completed', output: [{ type: 'message', content: [{ type: 'output_text', text }] }] });
  const client = () => createOpenAiClient({ apiKey: 'sk-test', model: 'main-model', routerModel: 'router-model', routerMaxOutputTokens: 123, baseUrl: 'https://openai.test.invalid/v1' });

  const stub = (response: Response) => {
    const requests: Array<{ url: string; body: Record<string, unknown> }> = [];
    mock.method(globalThis, 'fetch', async (url: string, init: RequestInit) => {
      requests.push({ url, body: JSON.parse(String(init.body)) });
      return response.clone();
    });
    return requests;
  };

  it('sends only the question, a strict schema, the router model and no tools', async () => {
    const requests = stub(message('{"lookups":[{"kind":"donors","ign":null,"name":null,"year":null}]}'));
    const lookups = await routeQuestion(client(), '¿Quién donó más?', 'anon');

    assert.deepEqual(lookups, [{ kind: 'donors' }]);
    const { body } = requests[0];
    const format = (body.text as { format: { strict: boolean; type: string } }).format;
    assert.equal(body.model, 'router-model');
    assert.equal(body.input, '¿Quién donó más?');
    assert.equal(body.instructions, ROUTER_INSTRUCTIONS);
    assert.equal(body.max_output_tokens, 123);
    assert.equal(body.store, false);
    assert.equal(body.safety_identifier, 'anon');
    assert.equal(format.strict, true);
    assert.equal(format.type, 'json_schema');
    assert.ok(!('tools' in body) && !('tool_choice' in body), 'no tool is ever enabled');
  });

  it('never gives the router the knowledge or the data', () => {
    assert.ok(!ROUTER_INSTRUCTIONS.includes('KNOWLEDGE'));
    assert.ok(!ROUTER_INSTRUCTIONS.includes('[DATOS]'));
  });

  it('fails with an OpenAI error when the answer is not JSON', async () => {
    stub(message('lo siento'));
    await assert.rejects(routeQuestion(client(), 'hola', 'anon'), (error: unknown) => error instanceof OpenAiError && error.failure === 'empty');
  });

  it('uses the main model when no router model is set', async () => {
    const requests = stub(message('{"lookups":[]}'));
    await routeQuestion(createOpenAiClient({ apiKey: 'sk-test', model: 'main-model', baseUrl: 'https://openai.test.invalid/v1' }), 'hola', 'anon');
    assert.equal(requests[0].body.model, 'main-model');
  });
});
