/**
 * Permission Helpers
 *
 * Clean, type-safe permission definitions for resources.
 */

import {
  requireAuth,
  requireRoles,
  requireOwnership,
  requireOrgRole,
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
  requireOrgRole,
  allOf,
  anyOf,
  denyAll,
  when,
};

// ============================================================================
// Platform-Level Permission Helpers (user.role — superadmin, admin, user)
// ============================================================================

/** Require any authenticated user */
export const requireAuthenticated = (): PermissionCheck =>
  requireRoles(['user', 'admin', 'superadmin']);

/** Require platform admin or superadmin */
export const requireAdmin = (): PermissionCheck =>
  requireRoles(['admin', 'superadmin']);

/** Require platform superadmin only */
export const requireSuperadmin = (): PermissionCheck =>
  requireRoles(['superadmin']);

// ============================================================================
// Org-Level Permission Helpers (scope.orgRoles — admin, staff, member)
// ============================================================================

/** Require org admin (owner-level) */
export const requireOrgOwner = (): PermissionCheck =>
  requireOrgRole(['admin']);

/** Require org admin or staff (manager-level) */
export const requireOrgManager = (): PermissionCheck =>
  requireOrgRole(['admin', 'staff']);

/** Require any org member (staff-level read access) */
export const requireOrgStaff = (): PermissionCheck =>
  requireOrgRole(['admin', 'staff', 'member']);

// ============================================================================
// Standard Permission Sets
// ============================================================================

/** Public read, authenticated write */
export const publicReadPermissions = {
  list: allowPublic(),
  get: allowPublic(),
  create: requireAuth(),
  update: requireAuth(),
  delete: requireAuth(),
};

/** All operations require authentication */
export const authenticatedPermissions = {
  list: requireAuth(),
  get: requireAuth(),
  create: requireAuth(),
  update: requireAuth(),
  delete: requireAuth(),
};

/** Admin only permissions */
export const adminPermissions = {
  list: requireAdmin(),
  get: requireAdmin(),
  create: requireSuperadmin(),
  update: requireSuperadmin(),
  delete: requireSuperadmin(),
};

/** Organization staff permissions */
export const orgStaffPermissions = {
  list: requireOrgStaff(),
  get: requireOrgStaff(),
  create: requireOrgManager(),
  update: requireOrgManager(),
  delete: requireOrgOwner(),
};

// ============================================================================
// Accounting Permissions
// ============================================================================

/** Accounting resource permissions (any member reads, admin+staff writes, admin deletes) */
export const accountingPermissions = {
  list: requireOrgStaff(),
  get: requireOrgStaff(),
  create: requireOrgManager(),
  update: requireOrgManager(),
  delete: requireOrgOwner(),
};

/** Report permissions (read-only for any org member) */
export const reportPermissions = {
  list: requireOrgStaff(),
  get: requireOrgStaff(),
  create: denyAll(),
  update: denyAll(),
  delete: denyAll(),
};

/** Fiscal period permissions (admin-only management) */
export const fiscalPeriodPermissions = {
  list: requireOrgStaff(),
  get: requireOrgStaff(),
  create: requireOrgOwner(),
  update: requireOrgOwner(),
  delete: denyAll(),
};
