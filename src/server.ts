import express from 'express';
import { env } from './config/env';

/**
 * Minimal HTTP endpoint so the hosting provider (or an uptime monitor) can check the bot is alive. The server it returns also
 * takes the WebSocket upgrades of the Minecraft bridge.
 */
export const keepAlive = () => {
  const app = express();

  app.all('/', (req, res) => {
    res.send('Bot is alive!');
  });

  const server = app.listen(env.PORT, () => {
    console.log(`[Server] Keep-alive server running on port ${env.PORT}`);
  });
  return { app, server };
};
