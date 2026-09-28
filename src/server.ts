import express from 'express';
import { env } from './config/env';

/**
 * Minimal HTTP endpoint so the hosting provider (or an uptime monitor) can check the bot is alive.
 */
export const keepAlive = () => {
  const app = express();

  app.all('/', (req, res) => {
    res.send('Bot is alive!');
  });

  app.listen(env.PORT, () => {
    console.log(`[Server] Keep-alive server running on port ${env.PORT}`);
  });
};
