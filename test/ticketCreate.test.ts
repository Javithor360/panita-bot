import './support';
import { mock, test } from 'node:test';
import assert from 'node:assert/strict';
import { ApiError } from '../src/lib/api/errors';
import { createTicketFlow, type CreateTicketDeps } from '../src/features/tickets/create';
import {
  PanelNotFoundError,
  TicketAlreadyOpenError,
  TicketChannelTakenError,
  type Ticket,
  type TicketPanel,
} from '../src/services/tickets';

const panel: TicketPanel = {
  id: 'soporte', guild_id: 'g1', channel_id: 'c1', message_id: 'm1', title: 'Soporte', description: null,
  category_id: null, staff_role_id: 'r1', ticket_counter: 7, show_panel_id_in_name: true,
};
const ticket: Ticket = { id: 't1', panel_id: 'soporte', channel_id: 'new-channel', creator_id: 'u1', status: 'OPEN', created_at: '2026-01-01T00:00:00.000Z' };
const input = { panelId: 'soporte', guildId: 'g1', creatorId: 'u1' };

/** Fake dependencies that record the order of operations; override pieces per test. */
const makeDeps = (overrides: Partial<CreateTicketDeps> = {}) => {
  const log: string[] = [];
  const deps: CreateTicketDeps = {
    findOpenTicketByCreator: async () => (log.push('findOpen'), null),
    getPanel: async () => (log.push('getPanel'), panel),
    nextTicketNumber: async () => (log.push('next'), panel),
    createTicket: async () => (log.push('createTicket'), ticket),
    findTicketByChannel: async () => (log.push('findByChannel'), null),
    createChannel: async () => (log.push('createChannel'), { id: 'new-channel' }),
    deleteChannel: async id => void log.push(`deleteChannel:${id}`),
    ...overrides,
  };
  return { deps, log };
};

test('success: records the ticket after creating the channel and keeps the channel', async () => {
  const { deps, log } = makeDeps();

  const result = await createTicketFlow(input, deps);

  assert.deepEqual(result, { status: 'created', channelId: 'new-channel', panel });
  assert.deepEqual(log, ['findOpen', 'getPanel', 'next', 'createChannel', 'createTicket']);
});

test('fast path: an existing open ticket creates nothing', async () => {
  const { deps, log } = makeDeps({ findOpenTicketByCreator: async () => ticket });

  assert.deepEqual(await createTicketFlow(input, deps), { status: 'already_open', channelId: 'new-channel' });
  assert.deepEqual(log, []);
});

test('an unknown panel creates nothing, before or after the counter moves', async () => {
  let { deps, log } = makeDeps({ getPanel: async () => null });
  assert.deepEqual(await createTicketFlow(input, deps), { status: 'panel_not_found' });
  assert.ok(!log.includes('createChannel') && !log.includes('next'));

  ({ deps, log } = makeDeps({ nextTicketNumber: async () => null }));
  assert.deepEqual(await createTicketFlow(input, deps), { status: 'panel_not_found' });
  assert.ok(!log.includes('createChannel'));
});

test('the channel is created with the updated panel (its counter is the ticket number)', async () => {
  const updated = { ...panel, ticket_counter: 8 };
  const seen: number[] = [];
  const { deps } = makeDeps({
    nextTicketNumber: async () => updated,
    createChannel: async p => (seen.push(p.ticket_counter), { id: 'new-channel' }),
  });

  await createTicketFlow(input, deps);

  assert.deepEqual(seen, [8]);
});

test('409 already_open: deletes the new channel and points to the existing one', async () => {
  const { deps, log } = makeDeps({
    createTicket: async () => { throw new TicketAlreadyOpenError('old-channel'); },
  });

  const result = await createTicketFlow(input, deps);

  assert.deepEqual(result, { status: 'already_open', channelId: 'old-channel' });
  assert.deepEqual(log.filter(l => l.startsWith('delete')), ['deleteChannel:new-channel']);
});

test('400 unknown_id (panel deleted meanwhile): deletes the channel', async () => {
  const { deps, log } = makeDeps({ createTicket: async () => { throw new PanelNotFoundError(); } });

  assert.deepEqual(await createTicketFlow(input, deps), { status: 'panel_not_found' });
  assert.deepEqual(log.filter(l => l.startsWith('delete')), ['deleteChannel:new-channel']);
});

test('409 channel_taken: deletes the channel, logs and fails', async () => {
  const errors = mock.method(console, 'error', () => {});
  const { deps, log } = makeDeps({ createTicket: async () => { throw new TicketChannelTakenError(); } });

  await assert.rejects(createTicketFlow(input, deps), TicketChannelTakenError);

  assert.deepEqual(log.filter(l => l.startsWith('delete')), ['deleteChannel:new-channel']);
  assert.equal(errors.mock.callCount(), 1);
  mock.restoreAll();
});

test('a definite failure (4xx) deletes the channel without asking the API about it', async () => {
  const { deps, log } = makeDeps({ createTicket: async () => { throw new ApiError(400, 'invalid_request', 'x'); } });

  await assert.rejects(createTicketFlow(input, deps), ApiError);

  assert.deepEqual(log.filter(l => l.startsWith('delete')), ['deleteChannel:new-channel']);
  assert.ok(!log.includes('findByChannel'));
});

test('an unknown outcome (timeout, network, 5xx) that was not recorded deletes the channel', async () => {
  for (const error of [new ApiError(0, 'timeout', 'x'), new ApiError(0, 'network', 'x'), new ApiError(503, 'http_503', 'x'), new ApiError(500, 'internal_error', 'x')]) {
    const { deps, log } = makeDeps({ createTicket: async () => { throw error; } });

    await assert.rejects(createTicketFlow(input, deps), (e: unknown) => e === error);

    assert.deepEqual(log.filter(l => l.startsWith('delete')), ['deleteChannel:new-channel'], `status ${error.status}`);
    assert.ok(log.includes('findByChannel'));
  }
});

test('an unknown outcome that WAS recorded keeps the channel and counts as created', async () => {
  const { deps, log } = makeDeps({
    createTicket: async () => { throw new ApiError(0, 'timeout', 'x'); },
    findTicketByChannel: async () => ({ ...ticket, panel }),
  });

  assert.deepEqual(await createTicketFlow(input, deps), { status: 'created', channelId: 'new-channel', panel });
  assert.deepEqual(log.filter(l => l.startsWith('delete')), []);
});

test('an unknown outcome whose verification also fails still deletes the channel', async () => {
  const { deps, log } = makeDeps({
    createTicket: async () => { throw new ApiError(0, 'network', 'x'); },
    findTicketByChannel: async () => { throw new ApiError(0, 'network', 'x'); },
  });

  await assert.rejects(createTicketFlow(input, deps), ApiError);

  assert.deepEqual(log.filter(l => l.startsWith('delete')), ['deleteChannel:new-channel']);
});

test('a failing channel deletion is logged and does not hide the original outcome', async () => {
  const errors = mock.method(console, 'error', () => {});
  const { deps } = makeDeps({
    createTicket: async () => { throw new TicketAlreadyOpenError('old-channel'); },
    deleteChannel: async () => { throw new Error('Missing Permissions'); },
  });

  assert.deepEqual(await createTicketFlow(input, deps), { status: 'already_open', channelId: 'old-channel' });
  assert.equal(errors.mock.callCount(), 1);
  mock.restoreAll();
});

test('a failure creating the channel creates no ticket record and deletes nothing', async () => {
  const { deps, log } = makeDeps({ createChannel: async () => { throw new Error('Missing Permissions'); } });

  await assert.rejects(createTicketFlow(input, deps), /Missing Permissions/);

  assert.ok(!log.includes('createTicket'));
  assert.deepEqual(log.filter(l => l.startsWith('delete')), []);
});

test('two simultaneous creates for one user leave exactly one channel', async () => {
  // The API lets one POST /v1/tickets win; the loser gets 409 already_open
  const channels = new Set<string>();
  let recorded: string | null = null;
  let nextChannel = 0;
  const deps = (): CreateTicketDeps => ({
    findOpenTicketByCreator: async () => null, // both clicks pass the fast path
    getPanel: async () => panel,
    nextTicketNumber: async () => panel,
    findTicketByChannel: async () => null,
    createChannel: async () => {
      const id = `channel-${++nextChannel}`;
      channels.add(id);
      return { id };
    },
    deleteChannel: async id => void channels.delete(id),
    createTicket: async ({ channelId }) => {
      if (recorded) throw new TicketAlreadyOpenError(recorded);
      recorded = channelId;
      return { ...ticket, channel_id: channelId };
    },
  });

  const results = await Promise.all([createTicketFlow(input, deps()), createTicketFlow(input, deps())]);

  assert.deepEqual(results.map(r => r.status).sort(), ['already_open', 'created']);
  assert.deepEqual([...channels], [recorded]);
});
