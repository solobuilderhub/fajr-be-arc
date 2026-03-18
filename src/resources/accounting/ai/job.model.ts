/**
 * Job Model — Async Job Tracking
 *
 * Tracks background jobs (e.g. AI journal generation).
 * Auto-deletes after 7 days via TTL index.
 */

import mongoose from 'mongoose';

const jobSchema = new mongoose.Schema(
  {
    type: {
      type: String,
      required: true,
      enum: ['AI_JOURNAL_GENERATION'],
    },
    organizationId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'organization',
    },
    referenceId: {
      type: String,
      default: null,
    },
    status: {
      type: String,
      enum: ['pending', 'processing', 'completed', 'failed'],
      default: 'pending',
    },
    metadata: {
      type: mongoose.Schema.Types.Mixed,
      default: {},
    },
    error: String,
    startedAt: Date,
    completedAt: Date,
  },
  { timestamps: true },
);

jobSchema.index({ type: 1, organizationId: 1, status: 1 });
jobSchema.index({ referenceId: 1 }, { unique: true, sparse: true });
// Auto-delete 7 days after creation
jobSchema.index({ createdAt: 1 }, { expireAfterSeconds: 60 * 60 * 24 * 7 });

export const Job = mongoose.models.Job || mongoose.model('Job', jobSchema);
export default Job;
