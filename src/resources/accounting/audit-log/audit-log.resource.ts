/**
 * Audit Log Resource — Read-Only CRUD
 *
 * Provides read access to accounting audit trail.
 * Write operations are disabled — logs are created programmatically.
 */

import { defineResource } from '@classytic/arc';
import { QueryParser } from '@classytic/mongokit';
import { createAdapter } from '#shared/adapter.js';
import { reportPermissions } from '#shared/permissions.js';
import { orgScoped } from '#shared/presets/index.js';
import { AuditLog } from './audit-log.model.js';
import auditLogRepository from './audit-log.repository.js';

const queryParser = new QueryParser({ maxLimit: 200 });

const auditLogResource = defineResource({
  name: 'audit-log',
  displayName: 'Audit Logs',
  prefix: '/audit-logs',

  adapter: createAdapter(AuditLog as any, auditLogRepository),
  queryParser,
  presets: [orgScoped],
  permissions: reportPermissions,

  // Disable write operations — audit logs are append-only
  disabledRoutes: ['create', 'update', 'delete'],
});

export default auditLogResource;
