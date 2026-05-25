import dns from "dns";
dns.setServers(["8.8.8.8", "8.8.4.4"]);
dns.setDefaultResultOrder("ipv4first");


import { config } from './src/config/env.js';
import './src/config/redis.js';
import http from 'http';
import { connectDB } from './src/config/db.js';
import { createApp } from './src/app.js';

const PORT = config.PORT;
const app = createApp();

async function startServer() {
  await connectDB();

  const server = http.createServer(app);
  server.listen(PORT, () => {
    console.log(`Server running in ${config.NODE_ENV} mode on port ${PORT}`);
  });

  server.on('error', (error) => {
    console.error('Server failed to start', error);
    process.exit(1);
  });
}

startServer().catch((error) => {
  console.error('Startup error:', error);
  process.exit(1);
});
