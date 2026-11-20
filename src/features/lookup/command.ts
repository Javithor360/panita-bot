import type { BaseMessageOptions, StringSelectMenuInteraction } from 'discord.js';
import type { CommandContext } from '../../core/context';
import { UserError } from '../../core/errors';
import { pickMenu } from './pick';
import { discordSource, lookupFailureText, resolveTarget } from './resolve';

/**
 * The flow of every command that takes a person, with the options `usuario` (a user) and `buscar` (a name, an ID or a
 * mention): find them, ask which one when several match, or answer. `flags` are what the command needs to finish after
 * the menu (such as `badges`); they travel in the custom id of the menu.
 */
export const answerFor = async (
  ctx: CommandContext,
  flags: string[],
  render: (userId: string) => Promise<BaseMessageOptions>,
): Promise<void> => {
  await ctx.defer();

  const query = ctx.options.getString('buscar');
  const result = await resolveTarget(discordSource(ctx.guild, ctx.client), {
    user: ctx.options.getUser('usuario'),
    query,
    selfId: ctx.user.id,
  });

  if (result.kind === 'none') throw new UserError(lookupFailureText(result.reason));
  if (result.kind === 'ask') {
    return ctx.reply(pickMenu(ctx.member, query ?? '', result.candidates, ctx.customId('pick', flags, { owned: true })));
  }
  await ctx.reply(await render(result.userId));
};

/** The menu was answered: the question is replaced by the answer. */
export const finishPick = async (
  interaction: StringSelectMenuInteraction,
  render: (userId: string) => Promise<BaseMessageOptions>,
): Promise<void> => {
  await interaction.deferUpdate();
  const answer = await render(interaction.values[0]);
  await interaction.editReply({ ...answer, content: '', components: answer.components ?? [] });
};
