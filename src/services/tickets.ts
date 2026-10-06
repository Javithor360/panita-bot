import { api, ApiError, isApiError } from '../lib/api';
import type { RequestOptions } from '../lib/api/client';
import type { Ticket, TicketPanel, TicketStatus, TicketWithPanel } from '../lib/api/types';

export type { Ticket, TicketPanel, TicketStatus, TicketWithPanel };

export const TICKET_STATUS = {
  open: 'OPEN',
  closed: 'CLOSED',
} as const satisfies Record<string, TicketStatus>;

/** Panel IDs are used in custom IDs and channel names, so they're kept simple. */
export const PANEL_ID_PATTERN = /^[a-z0-9_-]{1,32}$/;

export type PanelConfigUpdate = Partial<Pick<
  TicketPanel,
  'staff_role_id' | 'category_id' | 'ticket_counter' | 'show_panel_id_in_name' | 'channel_id' | 'message_id'
>>;

/** A panel with that id already exists. */
export class PanelExistsError extends Error {}
/** The panel a ticket was being recorded for no longer exists. */
export class PanelNotFoundError extends Error {}
/** The creator already has an open ticket, in `channelId`. */
export class TicketAlreadyOpenError extends Error {
  constructor(readonly channelId: string | undefined) {
    super('The creator already has an open ticket');
  }
}
/** The channel already belongs to a ticket. */
export class TicketChannelTakenError extends Error {}

export type LookupOptions = Pick<RequestOptions, 'timeoutMs' | 'idempotent'>;

// Panels

/** The panel, or `null` when it doesn't exist (an id the API would refuse can't exist either). */
export const getPanel = async (id: string): Promise<TicketPanel | null> => {
  if (!PANEL_ID_PATTERN.test(id)) return null;
  try {
    return await api.get<TicketPanel>('/v1/ticket-panels/{id}', { params: { id } });
  } catch (error) {
    if (isApiError(error, 404)) return null;
    throw error;
  }
};

export const listPanels = (guildId: string) =>
  api.get<TicketPanel[]>('/v1/ticket-panels', { query: { guild_id: guildId } });

/** Registers a panel the bot has already posted. Throws `PanelExistsError` when the id is taken. */
export const createPanel = async (panel: {
  id: string;
  guildId: string;
  channelId: string;
  messageId: string;
  title: string;
  description: string;
}): Promise<TicketPanel> => {
  try {
    return await api.post<TicketPanel>('/v1/ticket-panels', {
      id: panel.id,
      guild_id: panel.guildId,
      channel_id: panel.channelId,
      message_id: panel.messageId,
      title: panel.title,
      description: panel.description,
    });
  } catch (error) {
    if (isApiError(error, 409) && error.details?.field === 'id') throw new PanelExistsError(panel.id);
    throw error;
  }
};

/** Returns the updated panel, or `null` when it doesn't exist. */
export const updatePanel = async (id: string, data: PanelConfigUpdate): Promise<TicketPanel | null> => {
  if (!PANEL_ID_PATTERN.test(id)) return null;
  try {
    // The fields are set to absolute values, so repeating a failed call changes nothing
    return await api.patch<TicketPanel>('/v1/ticket-panels/{id}', data, { params: { id }, idempotent: true });
  } catch (error) {
    if (isApiError(error, 404)) return null;
    throw error;
  }
};

/** Deletes the panel and its tickets. Returns false when it didn't exist. */
export const deletePanel = async (id: string): Promise<boolean> => {
  if (!PANEL_ID_PATTERN.test(id)) return false;
  try {
    await api.delete('/v1/ticket-panels/{id}', { params: { id } });
    return true;
  } catch (error) {
    if (isApiError(error, 404)) return false;
    throw error;
  }
};

/** Atomically increments the panel counter and returns the updated panel, or `null` when it doesn't exist. */
export const nextTicketNumber = async (panelId: string): Promise<TicketPanel | null> => {
  if (!PANEL_ID_PATTERN.test(panelId)) return null;
  try {
    return await api.post<TicketPanel>('/v1/ticket-panels/{id}/next-number', undefined, { params: { id: panelId } });
  } catch (error) {
    if (isApiError(error, 404)) return null;
    throw error;
  }
};

// Tickets

/** The ticket of a channel with its panel; `null` in any channel that isn't a ticket. */
export const findTicketByChannel = async (channelId: string, options: LookupOptions = {}): Promise<TicketWithPanel | null> => {
  try {
    return await api.get<TicketWithPanel>('/v1/tickets/by-channel/{channelId}', { params: { channelId }, ...options });
  } catch (error) {
    if (isApiError(error, 404)) return null;
    throw error;
  }
};

export const findOpenTicketByCreator = (creatorId: string, guildId: string, options: LookupOptions = {}) =>
  api.get<Ticket | null>('/v1/tickets/open', { query: { creator_id: creatorId, guild_id: guildId }, ...options });

/**
 * Records a ticket whose channel was just created. Throws `TicketAlreadyOpenError` (the creator has one
 * already), `TicketChannelTakenError` or `PanelNotFoundError`; the caller must then remove its channel.
 */
export const createTicket = async (ticket: { channelId: string; panelId: string; creatorId: string }): Promise<Ticket> => {
  try {
    return await api.post<Ticket>('/v1/tickets', {
      channel_id: ticket.channelId,
      panel_id: ticket.panelId,
      creator_id: ticket.creatorId,
    });
  } catch (error) {
    if (error instanceof ApiError) {
      const reason = error.details?.reason;
      if (error.status === 409 && reason === 'already_open') {
        const channelId = error.details?.channel_id;
        throw new TicketAlreadyOpenError(typeof channelId === 'string' ? channelId : undefined);
      }
      if (error.status === 409 && reason === 'channel_taken') throw new TicketChannelTakenError(ticket.channelId);
      if (error.status === 400 && reason === 'unknown_id') throw new PanelNotFoundError(ticket.panelId);
    }
    throw error;
  }
};

export const setTicketStatus = (ticketId: string, status: TicketStatus) =>
  // The status is set whatever it was, so repeating a failed call changes nothing
  api.patch<Ticket>('/v1/tickets/{id}', { status }, { params: { id: ticketId }, idempotent: true });
