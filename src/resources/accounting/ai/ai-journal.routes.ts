/**
 * AI Journal Processing Routes
 *
 * Upload PDF documents for AI-powered journal entry generation.
 * Uses Gemini to extract transactions and map to Chart of Accounts.
 *
 * Endpoints:
 *   POST   /ai/process-file           — Upload PDF and queue AI processing
 *   GET    /ai/status/:journalEntryId — Get AI job status
 *   POST   /ai/cancel/:journalEntryId — Cancel an in-progress job
 */

import type { FastifyPluginAsync } from 'fastify';
import { JournalEntry } from '../journal-entry/journal-entry.model.js';
import Job from './job.model.js';
import jobQueue from './job-queue.js';
import { handleAIJournalGeneration } from './ai-journal.handler.js';

// Register the handler on module load
jobQueue.registerHandler('AI_JOURNAL_GENERATION', handleAIJournalGeneration);

const aiJournalRoutes: FastifyPluginAsync = async (fastify) => {
  // Require authentication
  const authenticate = (fastify as any).authenticate;
  if (authenticate) {
    fastify.addHook('preHandler', authenticate);
  }

  // POST /ai/process-file — Upload PDF and start AI processing
  fastify.post('/process-file', async (req: any, reply) => {
    const orgId = req.scope?.organizationId;
    if (!orgId) {
      return reply.status(400).send({ error: 'Organization context required' });
    }

    // Only admin/staff can trigger AI processing
    const orgRoles: string[] = req.scope?.orgRoles ?? [];
    if (!orgRoles.some((r: string) => ['admin', 'staff'].includes(r))) {
      return reply.status(403).send({ error: 'Org admin or staff role required' });
    }

    // Get uploaded file
    const file = await req.file();
    if (!file) {
      return reply.status(400).send({ error: 'PDF file is required' });
    }

    const { filename, mimetype } = file;
    if (!mimetype.includes('pdf')) {
      return reply.status(400).send({ error: 'Only PDF files are supported' });
    }

    // Read file buffer
    const chunks: Buffer[] = [];
    for await (const chunk of file.file) {
      chunks.push(chunk);
    }
    const pdfBuffer = Buffer.concat(chunks);

    // Parse fields from multipart
    const fields = file.fields as any;
    const userQuery = fields?.userQuery?.value ?? null;
    const journalEntryId = fields?.journalEntryId?.value ?? null;

    let draftEntry;

    if (journalEntryId) {
      // Use existing draft entry
      draftEntry = await JournalEntry.findOne({
        _id: journalEntryId,
        organizationId: orgId,
      });
      if (!draftEntry) {
        return reply.status(404).send({ error: 'Journal entry not found' });
      }
      if (draftEntry.state !== 'draft') {
        return reply.status(400).send({ error: 'Can only process AI for draft entries' });
      }

      draftEntry.aiJob = {
        status: 'pending',
        sourceDocument: {
          fileName: filename,
          fileType: mimetype,
          fileSize: pdfBuffer.length,
        },
      };
      await draftEntry.save();
    } else {
      // Create new draft entry
      draftEntry = new JournalEntry({
        organizationId: orgId,
        journalType: 'MISC',
        label: 'AI Processing...',
        date: new Date(),
        journalItems: [],
        totalDebit: 0,
        totalCredit: 0,
        state: 'draft',
        aiJob: {
          status: 'pending',
          sourceDocument: {
            fileName: filename,
            fileType: mimetype,
            fileSize: pdfBuffer.length,
          },
        },
      });
      await draftEntry.save();
    }

    // Clean up old jobs for this entry
    const referenceId = `ai-journal-${draftEntry._id}`;
    await Job.deleteMany({ referenceId });

    // Create job record
    const job = new Job({
      type: 'AI_JOURNAL_GENERATION',
      organizationId: orgId,
      referenceId,
      status: 'pending',
      metadata: {
        journalEntryId: draftEntry._id.toString(),
        fileName: filename,
        fileSize: pdfBuffer.length,
      },
    });
    await job.save();

    // Update entry with job ID
    draftEntry.aiJob.jobId = job._id;
    await draftEntry.save();

    // Queue the job
    jobQueue.add({
      jobId: job._id.toString(),
      type: 'AI_JOURNAL_GENERATION',
      data: {
        organizationId: orgId,
        pdfBuffer,
        pdfMimeType: mimetype,
        userQuery,
        journalEntryId: draftEntry._id.toString(),
      },
    });

    return reply.status(202).send({
      success: true,
      message: 'PDF received. Processing in background.',
      data: {
        journalEntryId: draftEntry._id,
        jobId: job._id,
        status: 'pending',
      },
    });
  });

  // GET /ai/status/:journalEntryId — Get job status
  fastify.get('/status/:journalEntryId', async (req: any, reply) => {
    const orgId = req.scope?.organizationId;
    if (!orgId) {
      return reply.status(400).send({ error: 'Organization context required' });
    }

    const { journalEntryId } = req.params;
    const entry = await JournalEntry.findOne({
      _id: journalEntryId,
      organizationId: orgId,
    }).lean();

    if (!entry) {
      return reply.status(404).send({ error: 'Journal entry not found' });
    }

    const aiJob = (entry as any).aiJob;
    return {
      success: true,
      data: {
        journalEntryId: entry._id,
        status: aiJob?.status ?? 'unknown',
        jobId: aiJob?.jobId ?? null,
        error: aiJob?.error ?? null,
        generatedAt: aiJob?.generatedAt ?? null,
        sourceDocument: aiJob?.sourceDocument ?? null,
        journalEntry:
          aiJob?.status === 'completed'
            ? {
                journalType: (entry as any).journalType,
                label: (entry as any).label,
                date: (entry as any).date,
                journalItems: (entry as any).journalItems,
                totalDebit: (entry as any).totalDebit,
                totalCredit: (entry as any).totalCredit,
              }
            : null,
      },
    };
  });

  // POST /ai/cancel/:journalEntryId — Cancel a job
  fastify.post('/cancel/:journalEntryId', async (req: any, reply) => {
    const orgId = req.scope?.organizationId;
    if (!orgId) {
      return reply.status(400).send({ error: 'Organization context required' });
    }

    const orgRoles: string[] = req.scope?.orgRoles ?? [];
    if (!orgRoles.some((r: string) => ['admin', 'staff'].includes(r))) {
      return reply.status(403).send({ error: 'Org admin or staff role required' });
    }

    const { journalEntryId } = req.params;
    const entry = await JournalEntry.findOne({
      _id: journalEntryId,
      organizationId: orgId,
    });

    if (!entry) {
      return reply.status(404).send({ error: 'Journal entry not found' });
    }

    const aiJob = (entry as any).aiJob;
    if (!aiJob?.jobId) {
      return reply.status(400).send({ error: 'No AI job associated with this entry' });
    }

    if (aiJob.status === 'completed' || aiJob.status === 'failed') {
      return reply
        .status(400)
        .send({ error: `Job already ${aiJob.status}. Cannot cancel.` });
    }

    await Job.findByIdAndUpdate(aiJob.jobId, {
      status: 'failed',
      error: 'Cancelled by user',
    });

    (entry as any).aiJob.status = 'cancelled';
    (entry as any).aiJob.error = 'Cancelled by user';
    await entry.save();

    return { success: true, message: 'Job cancelled', data: { journalEntryId, status: 'cancelled' } };
  });
};

export default aiJournalRoutes;
