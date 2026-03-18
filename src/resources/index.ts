/**
 * Resources Registry
 *
 * Central registry for all API resources.
 * All resources are mounted under /api prefix.
 *
 * Resources with state transitions or custom routes
 * use plugins that combine CRUD + action routers.
 */

import type { FastifyInstance } from 'fastify';

// Simple CRUD resources
import directoryResource from './directory/directory.resource.js';
import orgProfileResource from './org-profile/org-profile.resource.js';

// Plugin-based resources (CRUD + action routers / reports)
import { accountingPlugin } from './accounting/accounting.plugin.js';

/** Simple CRUD resources (registered via .toPlugin()) */
export const resources = [directoryResource, orgProfileResource] as const;

/** Plugin-based resources (CRUD + custom routes) */
const plugins = [accountingPlugin] as const;

/**
 * Register all resources with the app
 */
export async function registerResources(
  app: FastifyInstance,
  prefix = '/api',
): Promise<void> {
  await app.register(
    async (scope) => {
      // Register simple CRUD resources
      for (const resource of resources) {
        await scope.register(resource.toPlugin());
      }

      // Register plugin-based resources
      for (const plugin of plugins) {
        await scope.register(plugin);
      }
    },
    { prefix },
  );
}
