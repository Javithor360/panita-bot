import { apiError, ok, silenceApiLogs, stubFetch } from './support';
import { afterEach, beforeEach, mock, test } from 'node:test';
import assert from 'node:assert/strict';
import { ApiError } from '../src/lib/api/errors';
import {
  createPanel,
  createTicket,
  deletePanel,
  findOpenTicketByCreator,
  findTicketByChannel,
  getPanel,
  listPanels,
  nextTicketNumber,
  PanelExistsError,
  PanelNotFoundError,
  setTicketStatus,
  TicketAlreadyOpenError,
  TicketChannelTakenError,
  updatePanel,
} from '../src/services/tickets';

beforeEach(() => silenceApiLogs());
afterEach(() => mock.restoreAll());

const GUILD = '745678901234567890';
const panel = {
  id: 'soporte', guild_id: GUILD, channel_id: '756789012345678901', message_id: '767890123456789012', title: 'Soporte',
  description: null, category_id: null, staff_role_id: null, ticket_counter: 3, show_panel_id_in_name: true,
};
const ticket = { id: 't1', panel_id: 'soporte', channel_id: '790123456789012345', creator_id: '812345678901234567', status: 'OPEN', created_at: '2026-01-01T00:00:00.000Z' };

const again = () => { mock.restoreAll(); silenceApiLogs(); };

test('listPanels filters by guild', async () => {
  const calls = stubFetch(ok([panel], { meta: { count: 1 } }));

  assert.deepEqual(await listPanels(GUILD), [panel]);
  assert.deepEqual(calls, [{ method: 'GET', path: `/v1/ticket-panels?guild_id=${GUILD}`, body: undefined }]);
});

test('getPanel: found, 404 is null, and a malformed id makes no request', async () => {
  let calls = stubFetch(ok(panel));
  assert.deepEqual(await getPanel('soporte'), panel);
  assert.deepEqual(calls, [{ method: 'GET', path: '/v1/ticket-panels/soporte', body: undefined }]);

  again();
  stubFetch(apiError(404, 'not_found'));
  assert.equal(await getPanel('soporte'), null);

  again();
  calls = stubFetch(ok(panel));
  assert.equal(await getPanel('Soporte'), null);
  assert.equal(await getPanel(''), null);
  assert.equal(calls.length, 0);
});

test('createPanel posts the panel and maps a taken id', async () => {
  let calls = stubFetch(ok(panel, {}, 201));
  await createPanel({ id: 'soporte', guildId: GUILD, channelId: panel.channel_id, messageId: panel.message_id, title: 'Soporte', description: 'Pulsa' });
  assert.deepEqual(calls, [{
    method: 'POST',
    path: '/v1/ticket-panels',
    body: { id: 'soporte', guild_id: GUILD, channel_id: panel.channel_id, message_id: panel.message_id, title: 'Soporte', description: 'Pulsa' },
  }]);

  again();
  stubFetch(apiError(409, 'conflict', { field: 'id' }));
  await assert.rejects(
    createPanel({ id: 'soporte', guildId: GUILD, channelId: '1', messageId: '2', title: 't', description: 'd' }),
    PanelExistsError,
  );
});

test('updatePanel sends only the given fields; 404 is null; malformed id makes no request', async () => {
  let calls = stubFetch(ok(panel));
  await updatePanel('soporte', { staff_role_id: '778901234567890123' });
  assert.deepEqual(calls, [{ method: 'PATCH', path: '/v1/ticket-panels/soporte', body: { staff_role_id: '778901234567890123' } }]);

  again();
  stubFetch(apiError(404, 'not_found'));
  assert.equal(await updatePanel('soporte', { ticket_counter: 5 }), null);

  again();
  calls = stubFetch(ok(panel));
  assert.equal(await updatePanel('BAD ID', { ticket_counter: 5 }), null);
  assert.equal(calls.length, 0);
});

test('deletePanel: true when deleted, false on 404 or a malformed id', async () => {
  let calls = stubFetch(ok({ deleted: true }));
  assert.equal(await deletePanel('soporte'), true);
  assert.deepEqual(calls, [{ method: 'DELETE', path: '/v1/ticket-panels/soporte', body: undefined }]);

  again();
  stubFetch(apiError(404, 'not_found'));
  assert.equal(await deletePanel('soporte'), false);

  again();
  calls = stubFetch(ok({ deleted: true }));
  assert.equal(await deletePanel('Soporte'), false);
  assert.equal(calls.length, 0);
});

test('nextTicketNumber posts and returns the updated panel; 404 is null; never retried', async () => {
  let calls = stubFetch(ok({ ...panel, ticket_counter: 4 }));
  assert.equal((await nextTicketNumber('soporte'))?.ticket_counter, 4);
  assert.deepEqual(calls, [{ method: 'POST', path: '/v1/ticket-panels/soporte/next-number', body: undefined }]);

  again();
  stubFetch(apiError(404, 'not_found'));
  assert.equal(await nextTicketNumber('soporte'), null);

  again();
  calls = stubFetch(apiError(503, 'http_503'));
  await assert.rejects(nextTicketNumber('soporte'), ApiError);
  assert.equal(calls.length, 1);
});

test('findTicketByChannel: found, and 404 (any channel that is not a ticket) is null', async () => {
  const calls = stubFetch(ok({ ...ticket, panel }));
  assert.equal((await findTicketByChannel('790123456789012345'))?.panel.id, 'soporte');
  assert.deepEqual(calls, [{ method: 'GET', path: '/v1/tickets/by-channel/790123456789012345', body: undefined }]);

  again();
  stubFetch(apiError(404, 'not_found'));
  assert.equal(await findTicketByChannel('1'), null);
});

test('findTicketByChannel honours a custom timeout and can opt out of retries', async () => {
  let attempts = 0;
  mock.method(globalThis, 'fetch', (_url: string, init: RequestInit) => {
    attempts++;
    return new Promise((_resolve, reject) => init.signal?.addEventListener('abort', () => reject(init.signal?.reason)));
  });
  const keepAlive = setTimeout(() => {}, 5_000);

  try {
    await assert.rejects(
      findTicketByChannel('1', { timeoutMs: 20, idempotent: false }),
      (error: unknown) => error instanceof ApiError && error.code === 'timeout',
    );
    assert.equal(attempts, 1);
  } finally {
    clearTimeout(keepAlive);
  }
});

test('findOpenTicketByCreator returns the ticket or null', async () => {
  let calls = stubFetch(ok(ticket));
  assert.deepEqual(await findOpenTicketByCreator(ticket.creator_id, GUILD), ticket);
  assert.deepEqual(calls, [{ method: 'GET', path: `/v1/tickets/open?creator_id=${ticket.creator_id}&guild_id=${GUILD}`, body: undefined }]);

  again();
  calls = stubFetch(ok(null));
  assert.equal(await findOpenTicketByCreator(ticket.creator_id, GUILD), null);
});

test('createTicket posts the ticket and is never retried', async () => {
  const calls = stubFetch(apiError(503, 'http_503'));

  await assert.rejects(createTicket({ channelId: ticket.channel_id, panelId: 'soporte', creatorId: ticket.creator_id }), ApiError);

  assert.deepEqual(calls, [{
    method: 'POST',
    path: '/v1/tickets',
    body: { channel_id: ticket.channel_id, panel_id: 'soporte', creator_id: ticket.creator_id },
  }]);
});

test('createTicket maps each rejection to a typed error', async () => {
  const input = { channelId: ticket.channel_id, panelId: 'soporte', creatorId: ticket.creator_id };

  stubFetch(ok(ticket, {}, 201));
  assert.deepEqual(await createTicket(input), ticket);

  again();
  stubFetch(apiError(409, 'conflict', { reason: 'already_open', channel_id: '555555555555555555' }));
  await assert.rejects(createTicket(input), (e: unknown) => e instanceof TicketAlreadyOpenError && e.channelId === '555555555555555555');

  again();
  stubFetch(apiError(409, 'conflict', { reason: 'already_open' }));
  await assert.rejects(createTicket(input), (e: unknown) => e instanceof TicketAlreadyOpenError && e.channelId === undefined);

  again();
  stubFetch(apiError(409, 'conflict', { reason: 'channel_taken' }));
  await assert.rejects(createTicket(input), TicketChannelTakenError);

  again();
  stubFetch(apiError(400, 'invalid_request', { reason: 'unknown_id' }));
  await assert.rejects(createTicket(input), PanelNotFoundError);

  again();
  stubFetch(apiError(400, 'invalid_request', { fields: ['channel_id'] }));
  await assert.rejects(createTicket(input), ApiError);
});

test('setTicketStatus patches the status', async () => {
  const calls = stubFetch(ok({ ...ticket, status: 'CLOSED' }));

  assert.equal((await setTicketStatus('t1', 'CLOSED')).status, 'CLOSED');
  assert.deepEqual(calls, [{ method: 'PATCH', path: '/v1/tickets/t1', body: { status: 'CLOSED' } }]);
});
