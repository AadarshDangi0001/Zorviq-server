import dns from 'dns';
import http from 'http';

import { config } from './src/config/env.js';
import './src/config/redis.js';
import { connectDB } from './src/config/db.js';
import { createApp } from './src/app.js';
import { logger } from './src/lib/logger.js';

dns.setServers(['8.8.8.8', '8.8.4.4']);
dns.setDefaultResultOrder('ipv4first');

const PORT = config.PORT;
const app = createApp();

type ServerListenError = Error & {
  address?: string;
  code?: string;
  errno?: number;
  port?: number;
  syscall?: string;
};

const getServerErrorMessage = (error: ServerListenError): string => {
  if (error.code === 'EADDRINUSE') {
    return `Port ${error.port ?? PORT} is already in use. Stop the existing process or set PORT to a different value.`;
  }

  return 'Server failed to start';
};

async function startServer() {
  await connectDB();

  const server = http.createServer(app);
  server.listen(PORT, () => {
    logger.info(`Server running in ${config.NODE_ENV} mode on port ${PORT}`, {
      event: 'Server Started',
      mode: config.NODE_ENV,
      port: PORT,
    });
  });

  server.on('error', (error: ServerListenError) => {
    logger.error(getServerErrorMessage(error), {
      event: 'server.start_failed',
      address: error.address,
      code: error.code,
      errno: error.errno,
      port: error.port,
      syscall: error.syscall,
      error,
    });
    process.exit(1);
  });
}

startServer().catch((error) => {
  logger.error('Server startup failed', { event: 'server.startup_error', error });
  process.exit(1);
});
