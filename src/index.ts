/**
 * fajr-be-arc - Server Entry Point
 *
 * Starts the HTTP server with Better Auth + Arc framework.
 */

// Load environment FIRST (before any other imports)
import '#config/env.js';

import config from '#config/index.js';
import mongoose from 'mongoose';
import { createAppInstance } from './app.js';

async function syncIndexesInDev(): Promise<void> {
  if (config.isProd) return;
  const modelNames = mongoose.modelNames();
  await Promise.allSettled(
    modelNames.map((name) => mongoose.model(name).syncIndexes()),
  );
  console.log(`Synced indexes for ${modelNames.length} models (dev only)`);
}

async function main(): Promise<void> {
  console.log(`Environment: ${config.env}`);

  await mongoose.connect(config.database.uri);
  console.log('Connected to MongoDB');

  const app = await createAppInstance();
  await syncIndexesInDev();

  await app.listen({ port: config.server.port, host: config.server.host });
  console.log(
    `Server running at http://${config.server.host}:${config.server.port}`,
  );
}

main().catch((err) => {
  console.error('Failed to start server:', err);
  process.exit(1);
});
