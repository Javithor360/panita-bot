import { ActivityType, SlashCommandBuilder, type PresenceStatusData } from 'discord.js';
import { CATEGORIES } from '../../config/constants';
import { defineCommand } from '../../core/command';

export default defineCommand({
  data: new SlashCommandBuilder()
    .setName('bot')
    .setDescription('Maneja el estado y la actividad del bot.')
    .addSubcommand(subcommand =>
      subcommand
        .setName('status')
        .setDescription('Cambia el estado del bot.')
        .addStringOption(option =>
          option.setName('state')
            .setDescription('El estado que quieres ponerle al bot.')
            .setRequired(true)
            .addChoices(
              { name: 'Disponible', value: 'online' },
              { name: 'Ausente', value: 'idle' },
              { name: 'No Molestar', value: 'dnd' },
              { name: 'Invisible', value: 'invisible' },
            ),
        ),
    )
    .addSubcommand(subcommand =>
      subcommand
        .setName('activity')
        .setDescription('Cambia el texto de la actividad del bot ("clear" para quitarla).')
        .addStringOption(option =>
          option.setName('text')
            .setDescription('El texto que quieres ponerle a la actividad del bot.')
            .setRequired(true),
        ),
    ),
  meta: {
    category: CATEGORIES.moderation,
    description: 'Permite cambiar el estado y la actividad del bot.',
    access: 'staff',
  },
  async run(ctx) {
    const user = ctx.client.user;

    if (ctx.options.getSubcommand() === 'status') {
      const state = ctx.options.getString('state', true) as PresenceStatusData;
      user.setStatus(state);
      return ctx.reply({ content: `✅ Estado del bot cambiado a **${state}**.`, ephemeral: true });
    }

    const text = ctx.options.getString('text', true);
    if (text.toLowerCase() === 'clear') {
      user.setActivity();
      return ctx.reply({ content: '✅ Actividad del bot eliminada.', ephemeral: true });
    }

    // Custom activities show just the text, without a "Playing" prefix
    user.setActivity({ name: 'Custom Status', type: ActivityType.Custom, state: text });
    await ctx.reply({ content: `✅ Actividad del bot actualizada a: **${text}**.`, ephemeral: true });
  },
});
