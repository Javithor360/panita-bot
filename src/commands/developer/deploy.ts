import { ChatInputCommandInteraction, SlashCommandBuilder } from 'discord.js';
import { exec } from 'child_process';
import util from 'util';

const execPromise = util.promisify(exec);

export const data = new SlashCommandBuilder()
  .setName('deploy')
  .setDescription('Ejecuta yarn deploy internamente para registrar los comandos Slash.');

export const metadata = {
  aliases: ['deploycommands'],
  category: 'Desarrollador',
  description: 'Ejecuta yarn deploy internamente para registrar los comandos Slash.',
  usage: 'deploy',
  slashOnly: false,
  devOnly: true,
  staffOnly: false
};

export const execute = async (interaction: ChatInputCommandInteraction | any) => {
  // If it's a prefix command, there's no deferReply, but for slash there is.
  // We'll handle both cases since slashOnly is false.
  const isPrefix = !interaction.isCommand;
  let replyMessage: any;

  if (isPrefix) {
    replyMessage = await interaction.reply('⏳ Ejecutando `yarn deploy`...');
  } else {
    await interaction.deferReply({ ephemeral: true });
  }

  try {
    const { stdout, stderr } = await execPromise('yarn deploy');
    
    let response = '✅ **Comandos desplegados correctamente:**\n```\n';
    
    if (stdout) {
      const out = stdout.length > 1000 ? stdout.substring(stdout.length - 1000) : stdout;
      response += out + '\n';
    }
    response += '```';

    if (stderr && stderr.trim().length > 0) {
      const err = stderr.length > 800 ? stderr.substring(stderr.length - 800) : stderr;
      response += `\n⚠️ **Advertencias/Errores:**\n\`\`\`\n${err}\n\`\`\``;
    }

    if (isPrefix) {
      await replyMessage.edit(response);
    } else {
      await interaction.editReply(response);
    }
  } catch (error: any) {
    console.error('Error executing yarn deploy:', error);
    const errorMsg = `❌ **Error al ejecutar yarn deploy:**\n\`\`\`\n${error.message}\n\`\`\``;
    
    if (isPrefix) {
      await replyMessage.edit(errorMsg);
    } else {
      await interaction.editReply(errorMsg);
    }
  }
};
