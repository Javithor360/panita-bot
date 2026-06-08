import { REST, Routes } from 'discord.js';
import { config } from 'dotenv';
import fs from 'fs';
import path from 'path';

config();

const token = process.env.DISCORD_TOKEN;
if (!token) {
  console.error("DISCORD_TOKEN is missing");
  process.exit(1);
}

// Extract client ID from token
const clientId = Buffer.from(token.split('.')[0], 'base64').toString();

const commands = [];
const commandsPath = path.join(__dirname, 'commands');
const commandFolders = fs.readdirSync(commandsPath);

for (const folder of commandFolders) {
  const folderPath = path.join(commandsPath, folder);
  if (!fs.statSync(folderPath).isDirectory()) continue;

  const commandFiles = fs.readdirSync(folderPath).filter(file => file.endsWith('.ts') || file.endsWith('.js'));
  
  for (const file of commandFiles) {
    const command = require(path.join(folderPath, file));
    if ('data' in command && 'execute' in command) {
      const baseData = command.data.toJSON();
      commands.push(baseData);

      // Aliases as standalone Slash Commands
      if (command.metadata?.aliases && Array.isArray(command.metadata.aliases)) {
        for (const alias of command.metadata.aliases) {
          commands.push({ ...baseData, name: alias });
        }
      }
    } else {
      console.warn(`[WARNING] The command at ${file} is missing a required "data" or "execute" property.`);
    }
  }
}

const rest = new REST().setToken(token);

(async () => {
  try {
    console.log(`Started refreshing ${commands.length} application (/) commands.`);
    
    const guildId = process.env.GUILD_ID;
    if (guildId) {
      // Clear global commands to avoid duplicates if we are testing locally
      await rest.put(
        Routes.applicationCommands(clientId),
        { body: [] },
      );
      console.log('Successfully cleared old global commands.');

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
