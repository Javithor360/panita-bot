import { DiscordAPIError, EmbedBuilder, RESTJSONErrorCodes, type GuildMember, type User } from 'discord.js';
import { MODERATION } from '../../config/constants';
import type { CommandContext } from '../../core/context';
import { UserError } from '../../core/errors';
import { isDeveloper, isStaff } from '../../lib/discord';
import { moderationDenial } from './checks';
import { clip, denialMessage, type Denial } from './messages';
import { modlogOf } from './modlog';

/** What the bot needs from the target for the sanction it is about to apply (`none`: it only records something). */
export type Needs = 'kickable' | 'bannable' | 'moderatable' | 'manageable' | 'none';

/** The member of the server, or `null` when the user is not in it. */
export const memberOf = (ctx: CommandContext, user: User): Promise<GuildMember | null> =>
  ctx.guild.members.fetch(user.id).catch(() => null);

/** A declaration, not an arrow, so that TypeScript knows the code after `if (!x) refuse(...)` has `x`. */
export function refuse(reason: Denial): never {
  throw new UserError(denialMessage(reason));
}

/** Who a case is about, as the case embed shows it. */
export const subjectOf = (user: User) => ({ id: user.id, name: user.username, avatarUrl: user.displayAvatarURL() });

/**
 * Stops the command when the sanction is not allowed: not on yourself, the bot, the owner, other staff or someone
 * with a role above yours, and not on someone the bot cannot reach. `member` is `null` for a user outside the server.
 */
export const guardTarget = (ctx: CommandContext, user: User, member: GuildMember | null, needs: Needs): void => {
  const denial = moderationDenial({
    moderatorId: ctx.user.id,
    moderatorIsDeveloper: isDeveloper(ctx.user.id),
    moderatorRolePosition: ctx.member.roles.highest.position,
    moderatorIsOwner: ctx.guild.ownerId === ctx.user.id,
    targetId: user.id,
    target: member
      ? { isStaff: isStaff(member), rolePosition: member.roles.highest.position, manageable: needs === 'none' || member[needs] }
      : null,
    botId: ctx.client.user.id,
    guildOwnerId: ctx.guild.ownerId,
  });
  if (denial) refuse(denial);
};

/** The reason written in Discord's own audit log: the text, and who asked for it. */
export const auditReason = (ctx: CommandContext, reason: string | null | undefined): string =>
  clip(`${reason?.trim() || 'Sin razón'} | Responsable: ${ctx.user.tag}`, MODERATION.reasonMax);

/** Tells the member by DM. A member with closed DMs is not an error. */
export const notifyMember = async (user: User, embed: EmbedBuilder): Promise<void> => {
  await user.send({ embeds: [embed], allowedMentions: { parse: [] } }).catch(() => {});
};

/** Runs a Discord call and turns "I cannot" and "it is not there" into answers the moderator can read. */
export const discordAction = async <T>(call: () => Promise<T>): Promise<T> => {
  try {
    return await call();
  } catch (error) {
    if (error instanceof DiscordAPIError) {
      if (error.code === RESTJSONErrorCodes.MissingPermissions || error.code === RESTJSONErrorCodes.MissingAccess) {
        refuse('noPermission');
      }
      if (error.code === RESTJSONErrorCodes.UnknownMember) refuse('notInServer');
      if (error.code === RESTJSONErrorCodes.UnknownBan) refuse('notBanned');
    }
    throw error;
  }
};

/**
 * Answers in the channel where the command ran and leaves a copy of the case, with that channel, in the log channel.
 * `text` opens the answer; `logged` are the embeds the log receives (by default the same ones).
 */
export const announce = async (
  ctx: CommandContext,
  { text, embeds, logged = embeds, ephemeral = false }: { text: string; embeds: EmbedBuilder[]; logged?: EmbedBuilder[]; ephemeral?: boolean },
): Promise<void> => {
  await ctx.reply({ content: text, embeds, allowedMentions: { parse: [] }, ephemeral });

  const where = ctx.channel ? `<#${ctx.channel.id}>` : null;
  const entries = logged.map(embed => {
    const copy = EmbedBuilder.from(embed.toJSON());
    return where ? copy.addFields({ name: 'Canal', value: where, inline: true }) : copy;
  });
  await modlogOf(ctx.client).post({ embeds: entries });
};
