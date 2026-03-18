/**
 * COR-to-Journal Workflow Routes
 *
 * Import parsed COR file data as accounting journal entries.
 * Receives structured COR data (from /cor/parse), converts to
 * journal items with proper debit/credit, and creates a draft entry.
 *
 * Endpoints:
 *   POST /workflow/cor-to-journal  — Import COR accounts as journal entry
 */

import type { FastifyPluginAsync } from 'fastify';
import { importCORToJournal, type CORImportInput } from './cor-to-journal.service.js';

const corToJournalRoutes: FastifyPluginAsync = async (fastify) => {
  // Require authentication for all workflow routes
  const authenticate = (fastify as any).authenticate;
  if (authenticate) {
    fastify.addHook('preHandler', authenticate);
  }

  // POST /workflow/cor-to-journal
  fastify.post('/cor-to-journal', async (req: any, reply) => {
    const orgId = req.scope?.organizationId;
    if (!orgId) {
      return reply.status(400).send({ error: 'Organization context required' });
    }

    // Validate org role — only admin/staff can import
    const orgRoles: string[] = req.scope?.orgRoles ?? [];
    if (!orgRoles.some((r: string) => ['admin', 'staff'].includes(r))) {
      return reply.status(403).send({
        error: 'Forbidden',
        message: 'Org admin or staff role required to import COR data',
      });
    }

    const body = req.body as CORImportInput;

    // Basic validation
    if (!body.corporation?.name) {
      return reply.status(400).send({ error: 'corporation.name is required' });
    }
    if (!body.accounts || !Array.isArray(body.accounts) || body.accounts.length === 0) {
      return reply.status(400).send({ error: 'At least one account is required' });
    }

    try {
      const result = await importCORToJournal(body, orgId);
      return reply.status(201).send({ success: true, data: result });
    } catch (err: any) {
      const statusCode = err.message?.includes('skipped') || err.message?.includes('required') ? 400 : 500;
      return reply.status(statusCode).send({ error: err.message });
    }
  });
};

export default corToJournalRoutes;
