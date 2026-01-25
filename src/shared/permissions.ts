/**
 * Permission Helpers
 *
 * Clean, type-safe permission definitions for resources.
 */

import {
  requireAuth,
  requireRoles,
  requireOwnership,
  allowPublic,
  anyOf,
  allOf,
  denyAll,
  when,
  type PermissionCheck,
} from '@classytic/arc/permissions';

// Re-export core helpers
export {
  allowPublic,
  requireAuth,
  requireRoles,
  requireOwnership,
  allOf,
  anyOf,
  denyAll,
  when,
};

// ============================================================================
// Permission Helpers
// ============================================================================

/**
 * Require any authenticated user
 */
export const requireAuthenticated = (): PermissionCheck =>
  requireRoles(['user', 'admin', 'superadmin']);

/**
 * Require admin or superadmin
 */
export const requireAdmin = (): PermissionCheck =>
  requireRoles(['admin', 'superadmin']);

/**
 * Require superadmin only
 */
export const requireSuperadmin = (): PermissionCheck =>
  requireRoles(['superadmin']);

/**
 * Require organization owner
 */
export const requireOrgOwner = (): PermissionCheck =>
  requireRoles(['owner'], { bypassRoles: ['admin', 'superadmin'] });

/**
 * Require organization manager or higher
 */
export const requireOrgManager = (): PermissionCheck =>
  requireRoles(['owner', 'manager'], { bypassRoles: ['admin', 'superadmin'] });

/**
 * Require organization staff (any org member)
 */
export const requireOrgStaff = (): PermissionCheck =>
  requireRoles(['owner', 'manager', 'staff'], { bypassRoles: ['admin', 'superadmin'] });

// ============================================================================
// Standard Permission Sets
// ============================================================================

/**
 * Public read, authenticated write (default for most resources)
 * Uses requireAuth() - just checks if logged in, no role check
 */
export const publicReadPermissions = {
  list: allowPublic(),
  get: allowPublic(),
  create: requireAuth(),
  update: requireAuth(),
  delete: requireAuth(),
};

/**
 * All operations require authentication
 */
export const authenticatedPermissions = {
  list: requireAuth(),
  get: requireAuth(),
  create: requireAuth(),
  update: requireAuth(),
  delete: requireAuth(),
};

/**
 * Admin only permissions
 */
export const adminPermissions = {
  list: requireAdmin(),
  get: requireAdmin(),
  create: requireSuperadmin(),
  update: requireSuperadmin(),
  delete: requireSuperadmin(),
};

/**
 * Organization staff permissions
 */
export const orgStaffPermissions = {
  list: requireOrgStaff(),
  get: requireOrgStaff(),
  create: requireOrgManager(),
  update: requireOrgManager(),
  delete: requireOrgOwner(),
};
