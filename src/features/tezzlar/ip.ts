import { SERVER } from '../../config/constants';
import type { CommandContext } from '../../core/context';

export const run = async (ctx: CommandContext): Promise<void> => {
  const ip = ctx.options.getBoolean('numeric') ? SERVER.numericIp : SERVER.domain;
  await ctx.reply(`🌐 **IP del Servidor:** \`${ip}\``);
};
