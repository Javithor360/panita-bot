import { ActionRowBuilder, ButtonBuilder, ButtonStyle } from 'discord.js';

/** Splits a list into pages. An empty list is one empty page, so there is always something to show. */
export const paginate = <T>(items: readonly T[], perPage: number): T[][] => {
  const pages: T[][] = [];
  for (let start = 0; start < items.length; start += perPage) pages.push(items.slice(start, start + perPage));
  return pages.length > 0 ? pages : [[]];
};

/** The page to show for a requested number: a number that is out of range or not a number becomes the nearest page. */
export const clampPage = (page: number, total: number): number =>
  Math.min(Math.max(0, Number.isFinite(page) ? Math.floor(page) : 0), Math.max(0, total - 1));

export type PageSlot = 'prev' | 'here' | 'next';

/**
 * The buttons under a list: back, `3/7` (not a button, only a label) and next. The page lives in the custom id, so the
 * buttons need no memory and keep working for as long as the message exists. `null` when everything fits in one page.
 */
export const pageRow = (
  makeId: (page: number, slot: PageSlot) => string,
  page: number,
  total: number,
): ActionRowBuilder<ButtonBuilder> | null => {
  if (total <= 1) return null;
  return new ActionRowBuilder<ButtonBuilder>().addComponents(
    new ButtonBuilder().setCustomId(makeId(page - 1, 'prev')).setLabel('◀').setStyle(ButtonStyle.Secondary).setDisabled(page <= 0),
    new ButtonBuilder().setCustomId(makeId(page, 'here')).setLabel(`${page + 1}/${total}`).setStyle(ButtonStyle.Secondary).setDisabled(true),
    new ButtonBuilder().setCustomId(makeId(page + 1, 'next')).setLabel('▶').setStyle(ButtonStyle.Secondary).setDisabled(page >= total - 1),
  );
};
