import express from 'express';

export const keepAlive = () => {
  const app = express();
  
  app.all('/', (req, res) => {
    res.send('Bot is alive!');
  });
  
  const port = process.env.PORT || 3005;
  
  app.listen(port, () => {
    console.log(`[Server] Keep-alive server running on port ${port}`);
  });
};
