import { getRegistry } from '../core/registry';
import { deploySlashCommands } from '../services/commandDeploy';

deploySlashCommands(getRegistry())
  .then(({ scope, count }) => {
    console.log(`Successfully registered ${count} ${scope} slash commands.`);
  })
  .catch(error => {
    console.error('Failed to register slash commands:', error);
    process.exit(1);
  });
