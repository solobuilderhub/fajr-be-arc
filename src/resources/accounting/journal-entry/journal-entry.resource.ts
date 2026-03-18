/**
 * Journal Entry Resource — CRUD + Post/Reverse Actions
 *
 * Arc's BaseController handles standard CRUD automatically.
 * orgScoped preset ensures multi-tenant filtering by organizationId.
 * Custom routes: post, unpost, reverse, duplicate.
 */

import { defineResource } from '@classytic/arc';
import { QueryParser } from '@classytic/mongokit';
import { createAdapter } from '#shared/adapter.js';
import { accountingPermissions, requireOrgManager } from '#shared/permissions.js';
import { orgScoped } from '#shared/presets/index.js';
import { JournalEntry } from './journal-entry.model.js';
import journalEntryRepository from './journal-entry.repository.js';

const queryParser = new QueryParser({ maxLimit: 100 });

const journalEntryResource = defineResource({
  name: 'journal-entry',
  displayName: 'Journal Entries',
  prefix: '/journal-entries',

  adapter: createAdapter(JournalEntry, journalEntryRepository),
  queryParser,
  presets: [orgScoped],
  permissions: accountingPermissions,

  additionalRoutes: [
    // PATCH /journal-entries/:id/post — Draft -> Posted transition
    {
      method: 'PATCH',
      path: '/:id/post',
      summary: 'Post a draft journal entry',
      permissions: requireOrgManager(),
      wrapHandler: false,
      handler: async (req: any, reply: any) => {
        const orgId = req.scope?.organizationId;
        if (!orgId) {
          return reply.status(400).send({ error: 'Organization context required' });
        }
        const entry = await (journalEntryRepository as any).post(
          req.params.id,
          orgId,
        );
        return reply.send({ success: true, data: entry });
      },
    },

    // PATCH /journal-entries/:id/reverse — Create correcting reversal entry
    {
      method: 'PATCH',
      path: '/:id/reverse',
      summary: 'Reverse a posted journal entry',
      permissions: requireOrgManager(),
      wrapHandler: false,
      handler: async (req: any, reply: any) => {
        const orgId = req.scope?.organizationId;
        if (!orgId) {
          return reply.status(400).send({ error: 'Organization context required' });
        }
        const result = await (journalEntryRepository as any).reverse(
          req.params.id,
          orgId,
          { reversalDate: req.body?.reversalDate ? new Date(req.body.reversalDate) : undefined },
        );
        return reply.send({ success: true, data: result });
      },
    },

    // PATCH /journal-entries/:id/unpost — Revert posted entry back to draft
    {
      method: 'PATCH',
      path: '/:id/unpost',
      summary: 'Unpost a journal entry (revert to draft)',
      permissions: requireOrgManager(),
      wrapHandler: false,
      handler: async (req: any, reply: any) => {
        const orgId = req.scope?.organizationId;
        if (!orgId) {
          return reply.status(400).send({ error: 'Organization context required' });
        }
        const entry = await (journalEntryRepository as any).unpost(
          req.params.id,
          orgId,
        );
        return reply.send({ success: true, data: entry });
      },
    },

    // POST /journal-entries/:id/duplicate — Create a draft copy of an entry
    {
      method: 'POST',
      path: '/:id/duplicate',
      summary: 'Duplicate a journal entry as a new draft',
      permissions: requireOrgManager(),
      wrapHandler: false,
      handler: async (req: any, reply: any) => {
        const orgId = req.scope?.organizationId;
        if (!orgId) {
          return reply.status(400).send({ error: 'Organization context required' });
        }
        const entry = await (journalEntryRepository as any).duplicate(
          req.params.id,
          orgId,
        );
        return reply.send({ success: true, data: entry });
      },
    },
  ],
});

export default journalEntryResource;
