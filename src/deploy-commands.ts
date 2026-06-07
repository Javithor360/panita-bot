import { REST, Routes } from 'discord.js';
import { config } from 'dotenv';
import { data as systemsync } from './commands/systemsync';

config();

const token = process.env.DISCORD_TOKEN;
if (!token) {
  console.error("DISCORD_TOKEN is missing");
  process.exit(1);
}

// Extract client ID from token
const clientId = Buffer.from(token.split('.')[0], 'base64').toString();
const commands = [systemsync.toJSON()];

const rest = new REST().setToken(token);

(async () => {
  try {
    console.log(`Started refreshing ${commands.length} application (/) commands.`);
    
    const guildId = process.env.GUILD_ID;
    if (guildId) {
      await rest.put(
        Routes.applicationGuildCommands(clientId, guildId),
        { body: commands },
      );
      console.log(`Successfully registered commands for guild ${guildId}.`);
    } else {
      await rest.put(
        Routes.applicationCommands(clientId),
        { body: commands },
      );
      console.log('Successfully registered global commands.');
    }
  } catch (error) {
    console.error(error);
  }
})();
