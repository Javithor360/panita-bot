import { getRegistry } from '../core/registry';
import { deploySlashCommands } from '../services/commandDeploy';

// `npm run deploy` registers globally; `npm run deploy -- --guild` registers only in GUILD_ID.
const scope = process.argv.includes('--guild') ? 'guild' : 'global';

deploySlashCommands(getRegistry(), { scope })
  .then(({ scope, count }) => {
    console.log(`Successfully registered ${count} ${scope} slash commands.`);
  })
  .catch(error => {
    console.error('Failed to register slash commands:', error);
    process.exit(1);
  });
