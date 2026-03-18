/**
 * Audit Log Model
 *
 * Tracks user actions on accounting resources for compliance and audit trail.
 * Not factory-generated — lightweight custom schema.
 */

import mongoose, { Schema } from 'mongoose';

export interface IAuditLog {
  organizationId: mongoose.Types.ObjectId;
  userId: string;
  action: 'CREATE' | 'UPDATE' | 'DELETE' | 'POST' | 'REVERSE' | 'CLOSE' | 'REOPEN';
  resource: string;
  resourceId?: mongoose.Types.ObjectId;
  changes?: Array<{
    field: string;
    oldValue: unknown;
    newValue: unknown;
  }>;
  metadata?: Record<string, unknown>;
  createdAt?: Date;
  updatedAt?: Date;
}

const ChangeSchema = new Schema(
  {
    field: { type: String, required: true },
    oldValue: { type: Schema.Types.Mixed },
    newValue: { type: Schema.Types.Mixed },
  },
  { _id: false },
);

const AuditLogSchema = new Schema<IAuditLog>(
  {
    organizationId: {
      type: Schema.Types.ObjectId,
      required: true,
      index: true,
    },
    userId: { type: String, required: true },
    action: {
      type: String,
      enum: ['CREATE', 'UPDATE', 'DELETE', 'POST', 'REVERSE', 'CLOSE', 'REOPEN'],
      required: true,
    },
    resource: { type: String, required: true },
    resourceId: { type: Schema.Types.ObjectId },
    changes: [ChangeSchema],
    metadata: { type: Schema.Types.Mixed },
  },
  { timestamps: true },
);

AuditLogSchema.index({ organizationId: 1, resource: 1, resourceId: 1 });
AuditLogSchema.index({ organizationId: 1, userId: 1, createdAt: -1 });

export const AuditLog = mongoose.model('AuditLog', AuditLogSchema);
export default AuditLog;
