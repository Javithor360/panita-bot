import { Prisma } from '../generated/prisma/client';
import { prisma } from '../lib/prisma';

export const TICKET_STATUS = {
  open: 'OPEN',
  closed: 'CLOSED',
} as const;

export type TicketStatus = (typeof TICKET_STATUS)[keyof typeof TICKET_STATUS];

/** Panel IDs are used in custom IDs and channel names, so they're kept simple. */
export const PANEL_ID_PATTERN = /^[a-z0-9_-]{1,32}$/;

export type PanelConfigUpdate = Partial<Pick<
  Prisma.TicketPanelUncheckedUpdateInput,
  'staff_role_id' | 'category_id' | 'ticket_counter' | 'show_panel_id_in_name' | 'channel_id' | 'message_id'
>>;

const isNotFound = (error: unknown) =>
  error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2025';

// Panels

export const getPanel = (id: string) => prisma.ticketPanel.findUnique({ where: { id } });

export const listPanels = (guildId: string) =>
  prisma.ticketPanel.findMany({ where: { guild_id: guildId }, orderBy: { id: 'asc' } });

export const createPanel = (panel: {
  id: string;
  guildId: string;
  channelId: string;
  messageId: string;
  title: string;
  description: string;
}) =>
  prisma.ticketPanel.create({
    data: {
      id: panel.id,
      guild_id: panel.guildId,
      channel_id: panel.channelId,
      message_id: panel.messageId,
      title: panel.title,
      description: panel.description,
    },
  });

/** Returns the updated panel, or `null` when it doesn't exist. */
export const updatePanel = async (id: string, data: PanelConfigUpdate) => {
  try {
    return await prisma.ticketPanel.update({ where: { id }, data });
  } catch (error) {
    if (isNotFound(error)) return null;
    throw error;
  }
};

export const deletePanel = (id: string) => prisma.ticketPanel.delete({ where: { id } });

/** Atomically increments the panel counter and returns the updated panel. */
export const nextTicketNumber = (panelId: string) =>
  prisma.ticketPanel.update({ where: { id: panelId }, data: { ticket_counter: { increment: 1 } } });

// Tickets

export const findTicketByChannel = (channelId: string) =>
  prisma.ticket.findUnique({ where: { channel_id: channelId }, include: { panel: true } });

export const findOpenTicketByCreator = (creatorId: string, guildId: string) =>
  prisma.ticket.findFirst({
    where: { creator_id: creatorId, status: TICKET_STATUS.open, panel: { guild_id: guildId } },
  });

export const createTicket = (ticket: { channelId: string; panelId: string; creatorId: string }) =>
  prisma.ticket.create({
    data: { channel_id: ticket.channelId, panel_id: ticket.panelId, creator_id: ticket.creatorId },
  });

export const setTicketStatus = (ticketId: string, status: TicketStatus) =>
  prisma.ticket.update({ where: { id: ticketId }, data: { status } });
