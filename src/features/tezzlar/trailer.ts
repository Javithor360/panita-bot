import { EMOJIS, URLS } from '../../config/constants';
import type { CommandContext } from '../../core/context';

export const run = async (ctx: CommandContext): Promise<void> => {
  await ctx.reply(`${EMOJIS.tezzlar3} Puedes ver el tráiler de Tezzlar 3 aquí: ${URLS.trailer}`);
};
