import { ChatInputCommandInteraction, SlashCommandBuilder } from 'discord.js';
import { prisma } from '../lib/prisma';

export const data = new SlashCommandBuilder()
  .setName('cleanalts')
  .setDescription('Elimina de la base de datos las cuentas secundarias');

export const metadata = {
  aliases: [],
  category: 'Desarrollador',
  description: 'Elimina de la base de datos las cuentas secundarias (multicuentas).',
  usage: 'cleanalts',
  slashOnly: true,
  devOnly: true
};

export const execute = async (interaction: ChatInputCommandInteraction) => {
  await interaction.deferReply({ ephemeral: true });

  try {
    const guild = interaction.guild;
    if (!guild) {
      return interaction.editReply('Este comando solo se puede usar en un servidor.');
    }

    const members = await guild.members.fetch();
    const altIds: string[] = [];

    for (const [, member] of members) {
      if (member.roles.cache.has('900215815855546389')) {
        altIds.push(member.user.id);
      }
    }

    if (altIds.length === 0) {
      return interaction.editReply('No se encontraron cuentas secundarias en el servidor.');
    }

    const deleteResult = await prisma.user.deleteMany({
      where: {
        discord_id: { in: altIds }
      }
    });

    await interaction.editReply(`✅ Se han eliminado **${deleteResult.count}** cuentas secundarias de la base de datos.`);
  } catch (error) {
    console.error('[CleanAlts Error]', error);
    await interaction.editReply('Ocurrió un error al intentar eliminar las cuentas secundarias.');
  }
};
