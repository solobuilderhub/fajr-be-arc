/**
 * App Plugins Registry
 *
 * Register your app-specific plugins here.
 * Dependencies are passed explicitly (no shims, no magic).
 */

import type { FastifyInstance } from 'fastify';
import type { AppConfig } from '../config/index.js';
import { openApiPlugin, scalarPlugin } from '@classytic/arc/docs';
import { organizationPlugin } from '@classytic/arc/org';

/**
 * Register all app-specific plugins
 *
 * @param app - Fastify instance
 * @param deps - Explicit dependencies (config, services, etc.)
 */
export async function registerPlugins(
  app: FastifyInstance,
  deps: { config: AppConfig }
): Promise<void> {
  const { config } = deps;

  // API Documentation (Scalar UI)
  // OpenAPI spec: /_docs/openapi.json
  // Scalar UI: /docs
  await app.register(openApiPlugin, {
    title: 'fajr-be-arc API',
    version: '1.0.0',
    description: 'API documentation for fajr-be-arc',
  });
  await app.register(scalarPlugin, {
    routePrefix: '/docs',
    theme: 'default',
  });

  // Multi-tenant org scope
  // organizationPlugin requires an adapter — registered via Better Auth in app.ts
  // Uncomment when org adapter is wired:
  // await app.register(organizationPlugin, { adapter: orgAdapter });

  // Add your custom plugins here:
  // await app.register(myCustomPlugin, { ...options });
}
