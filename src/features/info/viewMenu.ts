import { ActionRowBuilder, StringSelectMenuBuilder, StringSelectMenuOptionBuilder } from 'discord.js';

/** One entry of a menu of views: what the command sends back, and the label and the line under it. */
export interface ViewOption<V extends string> {
  value: V;
  label: string;
  description: string;
}

/** Discord shows at most this many options in a menu. */
export const MENU_MAX = 25;

/**
 * The menu under `server` and `user` that switches the view in place: the same options as the command's flags, with the
 * one on screen marked. `customId` is the one the router sends to the command's `view` component, so the menu carries
 * whatever the next view needs (the person) and needs no memory.
 */
export const viewMenu = <V extends string>(
  customId: string,
  options: readonly ViewOption<V>[],
  current: V,
  placeholder: string,
): ActionRowBuilder<StringSelectMenuBuilder> => {
  if (options.length > MENU_MAX) throw new Error(`[ViewMenu] ${options.length} options do not fit a menu`);
  return new ActionRowBuilder<StringSelectMenuBuilder>().addComponents(
    new StringSelectMenuBuilder()
      .setCustomId(customId)
      .setPlaceholder(placeholder)
      .addOptions(
        options.map(option =>
          new StringSelectMenuOptionBuilder()
            .setValue(option.value)
            .setLabel(option.label)
            .setDescription(option.description)
            .setDefault(option.value === current),
        ),
      ),
  );
};
