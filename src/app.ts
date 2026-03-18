/**
 * fajr-be-arc - App Factory
 *
 * Creates and configures the Fastify app instance with Better Auth
 * and Arc framework for resource-oriented REST API.
 */

import type { FastifyInstance } from 'fastify';
import config from '#config/index.js';
import { createApp } from '@classytic/arc/factory';
import { createBetterAuthAdapter } from '@classytic/arc/auth';
import { getAuth } from '#resources/auth/auth.config.js';

import { registerPlugins } from '#plugins/index.js';
import { registerResources } from '#resources/index.js';

/**
 * Create a fully configured app instance
 */
export async function createAppInstance(): Promise<FastifyInstance> {
  const app = await createApp({
    preset: config.isProd ? 'production' : 'development',
    auth: {
      type: 'betterAuth',
      betterAuth: createBetterAuthAdapter({
        auth: getAuth(),
        orgContext: true,
      }),
    },
    cors: {
      origin: config.cors.origins,
      methods: config.cors.methods,
      allowedHeaders: config.cors.allowedHeaders,
      credentials: config.cors.credentials,
    },
    trustProxy: true,
    errorHandler: {
      includeStack: config.isDev,
    },
  });

  // Register app-specific plugins (explicit dependency injection)
  await registerPlugins(app, { config });

  // Register all resources
  await registerResources(app);

  return app;
}

export default createAppInstance;
