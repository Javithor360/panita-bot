import './support';
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { UserError } from '../src/core/errors';
import { COLORS } from '../src/config/constants';
import { playerListEmbed, tpsColor, tpsEmbed } from '../src/features/minecraft/embeds';
import { BridgeQueryError, BridgeUnavailableError } from '../src/features/minecraft/link';
import type { StatusData } from '../src/features/minecraft/protocol';
import { queryMinecraft } from '../src/features/minecraft/queries';
import { planNicknames, renderTopic, runSync, type NicknameMember, type NicknameState, type SyncDeps } from '../src/features/minecraft/sync';
import type { EnabledMember } from '../src/lib/api/types';

const STATUS: StatusData = { online: 3, max: 20, tps: 19.84, mspt: 12.1, uptimeSeconds: 3 * 3600 + 120, version: '26.3' };
const TEMPLATE = '🟢 {online}/{max} jugadores · TPS {tps} · activo hace {uptime}';

// The topic

test('writes the topic from the template and the status of the server', () => {
  assert.equal(renderTopic(TEMPLATE, STATUS), '🟢 3/20 jugadores · TPS 19.8 · activo hace 3h 2m 0s');
});

test('says the server is down when there is no status', () => {
  assert.equal(renderTopic(TEMPLATE, null), '🔴 Servidor sin conexión');
});

test('cuts a topic to what Discord accepts', () => {
  assert.equal(renderTopic('x'.repeat(2000), STATUS).length, 1024);
});

// The nicknames

const state = (overrides: Partial<NicknameState> = {}): NicknameState => ({
  discordId: '100000000000000001',
  ign: 'Alpha',
  current: null,
  manageable: true,
  ...overrides,
});

test('plans a change for a member whose nickname is not their Minecraft name', () => {
  const { changes } = planNicknames([state({ current: 'otro' }), state({ discordId: '2', ign: 'Bravo', current: null })]);

  assert.deepEqual(changes, [
    { discordId: '100000000000000001', ign: 'Alpha', from: 'otro' },
    { discordId: '2', ign: 'Bravo', from: null },
  ]);
});

test('plans nothing for a member whose nickname is already right', () => {
  assert.deepEqual(planNicknames([state({ current: 'Alpha' })]), { changes: [], unmanageable: 0 });
});

test('a nickname that differs only in case is changed, since the name is exact', () => {
  assert.equal(planNicknames([state({ current: 'alpha' })]).changes.length, 1);
});

test('counts the members the bot cannot rename instead of trying', () => {
  assert.deepEqual(planNicknames([state({ current: 'x', manageable: false }), state({ discordId: '2', current: 'Alpha' })]), {
    changes: [],
    unmanageable: 1,
  });
});

// One run of the sync

const syncSetup = (options: { topic?: string | null; connected?: boolean; dryRun?: boolean; request?: () => Promise<StatusData> } = {}) => {
  const log: string[] = [];
  const topics: string[] = [];
  const renamed: string[] = [];
  const members: EnabledMember[] = [
    { discord_id: '100000000000000001', ign: 'Alpha', minecraft_status: 'premium' },
    { discord_id: '100000000000000002', ign: 'Bravo', minecraft_status: 'cracked' },
  ];
  const nicknames: Record<string, string | null> = { '100000000000000001': 'otro', '100000000000000002': 'Bravo' };
  const deps: SyncDeps = {
    link: { connected: options.connected ?? true, request: (async () => (options.request ? options.request() : STATUS)) as never },
    topicChannel: async () => ({ topic: options.topic ?? null, setTopic: async text => void topics.push(text) }),
    directory: { refresh: async () => {}, all: () => members },
    fetchMember: async (id): Promise<NicknameMember | null> => ({
      nickname: nicknames[id] ?? null,
      manageable: true,
      setNickname: async nickname => void renamed.push(`${id}=${nickname}`),
    }),
    topicTemplate: TEMPLATE,
    dryRun: options.dryRun ?? false,
    logger: { log: text => void log.push(text), error: text => void log.push(`ERROR ${text}`) },
  };
  return { deps, log, topics, renamed };
};

test('sets the topic and fixes the nicknames that are wrong', async () => {
  const { deps, topics, renamed } = syncSetup();

  await runSync(deps);

  assert.deepEqual(topics, ['🟢 3/20 jugadores · TPS 19.8 · activo hace 3h 2m 0s']);
  assert.deepEqual(renamed, ['100000000000000001=Alpha']);
});

test('leaves the topic alone when it already says the same, to spare Discord an edit', async () => {
  const { deps, topics } = syncSetup({ topic: '🟢 3/20 jugadores · TPS 19.8 · activo hace 3h 2m 0s' });

  await runSync(deps);

  assert.deepEqual(topics, []);
});

test('says the server is down in the topic when it is not connected or does not answer', async () => {
  const notConnected = syncSetup({ connected: false });
  await runSync(notConnected.deps);
  const silent = syncSetup({ request: () => Promise.reject(new Error('timeout')) });
  await runSync(silent.deps);

  assert.deepEqual(notConnected.topics, ['🔴 Servidor sin conexión']);
  assert.deepEqual(silent.topics, ['🔴 Servidor sin conexión']);
});

test('in dry run it changes nothing and says what it would', async () => {
  const { deps, topics, renamed, log } = syncSetup({ dryRun: true });

  await runSync(deps);

  assert.deepEqual(topics, []);
  assert.deepEqual(renamed, []);
  assert.ok(log.some(line => line.includes('would set the topic')));
  assert.ok(log.some(line => line.includes('would set the nickname of 100000000000000001 to Alpha')));
});

test('a topic that fails does not stop the nicknames', async () => {
  const { deps, renamed, log } = syncSetup();
  deps.topicChannel = async () => ({ topic: null, setTopic: async () => Promise.reject(new Error('no permission')) });

  await runSync(deps);

  assert.deepEqual(renamed, ['100000000000000001=Alpha']);
  assert.ok(log.some(line => line.startsWith('ERROR [Minecraft] The topic sync failed')));
});

// The commands

test('asking the server turns the ways it can fail into messages for the member', async () => {
  await assert.rejects(queryMinecraft(null, 'tps'), (error: Error) => error instanceof UserError && /apagado/.test(error.message));
  await assert.rejects(
    queryMinecraft({ request: () => Promise.reject(new BridgeUnavailableError()) }, 'tps'),
    (error: Error) => error instanceof UserError && /no está conectado/.test(error.message),
  );
  await assert.rejects(
    queryMinecraft({ request: () => Promise.reject(new BridgeQueryError('timeout')) }, 'tps'),
    (error: Error) => error instanceof UserError && /no respondió/.test(error.message),
  );
});

test('asking the server returns its answer', async () => {
  assert.deepEqual(await queryMinecraft({ request: (async () => ({ tps: 20, mspt: 5 })) as never }, 'tps'), { tps: 20, mspt: 5 });
});

test('a failure that is not about the bridge is not hidden', async () => {
  await assert.rejects(queryMinecraft({ request: () => Promise.reject(new TypeError('bug')) }, 'tps'), TypeError);
});

test('the player list shows nicknames with the real name beside them', () => {
  const data = playerListEmbed({ online: [{ name: 'Javithor360', nickname: 'Javi' }, { name: 'Tezzlar', nickname: null }], max: 20 }).data;

  assert.equal(data.title, '👥 Jugadores en línea (2/20)');
  assert.equal(data.description, '• **Javi** (Javithor360)\n• **Tezzlar**');
});

test('the player list says when nobody is online', () => {
  assert.equal(playerListEmbed({ online: [], max: 20 }).data.description, 'No hay jugadores conectados.');
});

test('the player list is cut when it would not fit in an embed', () => {
  const online = Array.from({ length: 1000 }, (_, i) => ({ name: `Player${i}`, nickname: null }));
  const description = playerListEmbed({ online, max: 1000 }).data.description ?? '';

  assert.ok(description.length <= 4096);
  assert.match(description, /…y \d+ más$/);
});

test('the TPS embed shows both numbers and its color follows how the server is doing', () => {
  const data = tpsEmbed({ tps: 19.84, mspt: 12.13 }).data;

  assert.deepEqual(data.fields?.map(field => field.value), ['`19.8`', '`12.1 ms`']);
  assert.equal(data.color, COLORS.success);
  assert.equal(tpsColor(17), COLORS.warning);
  assert.equal(tpsColor(9), COLORS.error);
});
