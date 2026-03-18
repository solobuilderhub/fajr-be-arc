/**
 * Audit Log Repository — MongoKit-powered data access (read-heavy).
 */

import { Repository } from '@classytic/mongokit';
import { AuditLog } from './audit-log.model.js';

const auditLogRepository = new Repository(AuditLog);

export default auditLogRepository;
