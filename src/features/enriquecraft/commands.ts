import type { CommandContext } from '../../core/context';
import { features } from '../../data/enriquecraft';
import { single } from './features';
import type { View } from './look';

/** The utility commands are a feature of their own; this is the same text, one word away. */
export const view = (): View => single(features.find(feature => feature.id === 'comandos')!);

export const run = async (ctx: CommandContext): Promise<void> => {
  await ctx.reply(view());
};
