/**
 * Shared Utilities
 *
 * Central exports for resource definitions.
 * Import from here for clean, consistent code.
 */

// Adapter factory
export { createAdapter } from './adapter.js';

// Core Arc exports
export { createMongooseAdapter, defineResource } from '@classytic/arc';

// Permission helpers
export {
  allowPublic,
  requireAuth,
  requireRoles,
  requireOwnership,
  allOf,
  anyOf,
  denyAll,
  when,
  type PermissionCheck,
} from '@classytic/arc/permissions';

// Application permissions
export * from './permissions.js';

// Presets
export * from './presets/index.js';
