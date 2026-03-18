/**
 * Journal Entry Model — Double-Entry Bookkeeping
 *
 * Factory-generated from @classytic/ledger engine.
 * Multi-tenant (organizationId), indexed, and validated automatically.
 * Includes AI job tracking for automated entry generation.
 */

import mongoose from 'mongoose';
import accounting from '#config/accounting.js';

const JournalEntrySchema = accounting.createJournalEntrySchema('Account', {
  indexes: true,
  autoReference: true,
  textSearch: true,
  extraFields: {
    aiJob: {
      jobId: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'Job',
        default: null,
      },
      status: {
        type: String,
        enum: [
          'pending',
          'processing',
          'completed',
          'failed',
          'cancelled',
          null,
        ],
        default: null,
      },
      error: { type: String, default: null },
      generatedAt: { type: Date, default: null },
      sourceDocument: {
        fileName: String,
        fileType: String,
        fileSize: Number,
      },
    },
  },
  extraIndexes: [
    { fields: { 'aiJob.jobId': 1 }, options: { sparse: true } },
    {
      fields: { organizationId: 1, 'aiJob.status': 1 },
      options: { sparse: true },
    },
  ],
});

export const JournalEntry = mongoose.model('JournalEntry', JournalEntrySchema);
export default JournalEntry;
