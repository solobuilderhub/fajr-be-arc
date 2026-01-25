/**
 * Resources Registry
 *
 * Central registry for all API resources.
 * Flat structure - no barrels, direct imports.
 */

import type { FastifyInstance } from "fastify";

// Auth resources (register, login, /users/me)
import { authResource, userProfileResource } from "./auth/auth.resource.js";

// App resources
import directoryResource from "./directory/directory.resource.js";
// Add more resources here:
// import productResource from './product/product.resource.js';

/**
 * All registered resources
 */
export const resources = [
  authResource,
  userProfileResource,
  directoryResource,
] as const;

/**
 * Register all resources with the app
 */
export async function registerResources(app: FastifyInstance): Promise<void> {
  for (const resource of resources) {
    await app.register(resource.toPlugin());
  }
}
