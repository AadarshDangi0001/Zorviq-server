import './src/config/env.js';
import http from 'http';
import { connectDB } from './src/config/db.js';
import { createApp } from './src/app.js';

const PORT = Number(process.env.PORT ?? 4000);
const app = createApp();

async function startServer() {
  await connectDB();

  const server = http.createServer(app);
  server.listen(PORT, () => {
    console.log(`Server running in ${process.env.NODE_ENV ?? 'development'} mode on port ${PORT}`);
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
