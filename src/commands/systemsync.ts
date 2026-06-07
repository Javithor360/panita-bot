import { ChatInputCommandInteraction, SlashCommandBuilder } from 'discord.js';
import { prisma } from '../lib/prisma';
import { setGlobalSyncLock } from '../utils/syncLock';

export const data = new SlashCommandBuilder()
  .setName('systemsync')
  .setDescription('Syncs the database with current Discord members (Developer Only)');

export const execute = async (interaction: ChatInputCommandInteraction) => {
  // Check if it's the developer
  if (interaction.user.id !== '409529980469641217') {
    return interaction.reply({ content: 'You are not authorized to run this command.', ephemeral: true });
  }

  await interaction.deferReply({ ephemeral: true });

  try {
    const guild = interaction.guild;
    if (!guild) {
      return interaction.editReply('This command can only be used in a server.');
    }

    setGlobalSyncLock(true);

    // Step 1: Clean test data (disconnect roles and delete UserEditions)
    console.log('Cleaning up old UserEdition and Role associations...');
    await prisma.userEdition.deleteMany({});
    
    const allUsers = await prisma.user.findMany();
    for (const user of allUsers) {
      await prisma.user.update({
        where: { id: user.id },
        data: { roles: { set: [] } }
      });
    }

    // Load necessary mapped roles and editions
    const dbRoles = await prisma.role.findMany({ where: { discord_role_id: { not: null } } });
    const dbEditions = await prisma.edition.findMany({ where: { discord_role_id: { not: null } } });

    // Step 2: Iterate over all members
    console.log('Fetching all guild members...');
    const members = await guild.members.fetch();
    console.log(`Processing ${members.size} members...`);

    let processedCount = 0;

    for (const [, member] of members) {
      // Ignore bots and alt accounts (multicuentas)
      if (member.user.bot) continue;
      if (member.roles.cache.has('900215815855546389')) continue;

      const discordId = member.user.id;
      const avatarUrl = member.user.displayAvatarURL({ size: 256, extension: 'png' });
      
      // Calculate roles and editions to link
      const memberRoleIds = Array.from(member.roles.cache.keys());
      const rolesToConnect = dbRoles.filter(r => memberRoleIds.includes(r.discord_role_id!)).map(r => ({ id: r.id }));
      const editionsToConnect = dbEditions.filter(e => memberRoleIds.includes(e.discord_role_id!)).map(e => e.id);

      // Upsert user
      const existingUser = await prisma.user.findUnique({ where: { discord_id: discordId } });

      let dbUser;
      if (existingUser) {
        // Update existing user's avatar and roles
        dbUser = await prisma.user.update({
          where: { id: existingUser.id },
          data: {
            avatar_url: avatarUrl,
            roles: { set: rolesToConnect }
          }
        });
      } else {
        // Create new user
        dbUser = await prisma.user.create({
          data: {
            discord_id: discordId,
            discord_name: member.user.username,
            ign: member.nickname || member.user.username,
            enabled: false,
            password: null,
            trusted_author: false,
            joined_at: member.joinedAt || new Date(),
            avatar_url: avatarUrl,
            roles: { connect: rolesToConnect }
          }
        });
      }

      // Re-create UserEdition relationships
      if (editionsToConnect.length > 0) {
        await prisma.userEdition.createMany({
          data: editionsToConnect.map(editionId => ({
            user_id: dbUser.id,
            edition_id: editionId,
            joined_at: new Date()
          }))
        });
      }

      processedCount++;
    }

    console.log(`Sync complete. Processed ${processedCount} users.`);
    await interaction.editReply(`Database synchronization complete. Successfully processed **${processedCount}** users.`);
  } catch (error) {
    console.error('Error during systemsync:', error);
    await interaction.editReply('An error occurred during synchronization. Check console for details.');
  } finally {
    setGlobalSyncLock(false);
  }
};
