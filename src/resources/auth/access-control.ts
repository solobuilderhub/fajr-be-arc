/**
 * Access Control — AC + Role Definitions
 *
 * 3 org-level roles: admin, staff, member
 * Includes accounting resource statements.
 */

import { createAccessControl } from 'better-auth/plugins/access';

export const statements = {
  organization: ['read', 'update', 'delete'],
  member: ['create', 'read', 'update', 'delete'],
  invitation: ['create', 'read', 'cancel'],
  // Accounting resources
  account: ['create', 'read', 'update', 'delete'],
  journalEntry: ['create', 'read', 'update', 'delete'],
  fiscalPeriod: ['create', 'read', 'update', 'delete'],
  report: ['read'],
  auditLog: ['read'],
} as const;

export const ac = createAccessControl(statements);

/** admin — Organization owner, full access to everything. */
export const admin = ac.newRole({
  organization: ['read', 'update', 'delete'],
  member: ['create', 'read', 'update', 'delete'],
  invitation: ['create', 'read', 'cancel'],
  account: ['create', 'read', 'update', 'delete'],
  journalEntry: ['create', 'read', 'update', 'delete'],
  fiscalPeriod: ['create', 'read', 'update', 'delete'],
  report: ['read'],
  auditLog: ['read'],
});

/** staff — Employee. Manages entries, reads accounts. */
export const staff = ac.newRole({
  organization: ['read'],
  member: ['read'],
  invitation: [],
  account: ['read'],
  journalEntry: ['create', 'read', 'update'],
  fiscalPeriod: ['read'],
  report: ['read'],
  auditLog: ['read'],
});

/** member — External collaborator. Read-only access. */
export const member = ac.newRole({
  organization: ['read'],
  member: [],
  invitation: [],
  account: ['read'],
  journalEntry: ['read'],
  fiscalPeriod: ['read'],
  report: ['read'],
  auditLog: [],
});
