/**
 * Account Resource — Chart of Accounts CRUD + Custom Actions
 *
 * Arc's BaseController handles standard CRUD automatically.
 * orgScoped preset ensures multi-tenant filtering by organizationId.
 * Custom routes: seed, bulk create, enable/disable accounts.
 */

import { defineResource } from '@classytic/arc';
import { QueryParser } from '@classytic/mongokit';
import { createAdapter } from '#shared/adapter.js';
import { accountingPermissions, requireOrgManager, requireOrgOwner } from '#shared/permissions.js';
import { orgScoped } from '#shared/presets/index.js';
import { Account } from './account.model.js';
import { JournalEntry } from '../journal-entry/journal-entry.model.js';
import accountRepository from './account.repository.js';

const queryParser = new QueryParser({ maxLimit: 1000 });

const accountResource = defineResource({
  name: 'account',
  displayName: 'Chart of Accounts',
  prefix: '/accounts',

  adapter: createAdapter(Account, accountRepository),
  queryParser,
  presets: [orgScoped],
  permissions: accountingPermissions,

  additionalRoutes: [
    // POST /accounts/seed — Create default GIFI chart for the organization
    {
      method: 'POST',
      path: '/seed',
      summary: 'Seed default GIFI chart of accounts',
      permissions: requireOrgOwner(),
      wrapHandler: false,
      handler: async (req: any, reply: any) => {
        const orgId = req.scope?.organizationId;
        if (!orgId) {
          return reply.status(400).send({ error: 'Organization context required' });
        }
        const result = await (accountRepository as any).seedAccounts(orgId);
        return reply.status(201).send({ success: true, data: result });
      },
    },

    // POST /accounts/bulk — Bulk create accounts
    {
      method: 'POST',
      path: '/bulk',
      summary: 'Bulk create accounts',
      permissions: requireOrgManager(),
      wrapHandler: false,
      handler: async (req: any, reply: any) => {
        const orgId = req.scope?.organizationId;
        if (!orgId) {
          return reply.status(400).send({ error: 'Organization context required' });
        }
        const { accounts } = req.body;
        const result = await (accountRepository as any).bulkCreate(accounts, orgId);
        const status = result.summary?.created > 0 ? 201 : 200;
        return reply.status(status).send({ success: true, data: result });
      },
    },

    // PATCH /accounts/:id/enable — Activate an account
    {
      method: 'PATCH',
      path: '/:id/enable',
      summary: 'Enable (activate) an account',
      permissions: requireOrgManager(),
      wrapHandler: false,
      handler: async (req: any, reply: any) => {
        const orgId = req.scope?.organizationId;
        if (!orgId) {
          return reply.status(400).send({ error: 'Organization context required' });
        }
        const account = await Account.findOne({
          _id: req.params.id,
          organizationId: orgId,
        });
        if (!account) {
          return reply.status(404).send({ error: 'Account not found' });
        }
        const doc = await accountRepository.update(req.params.id, {
          active: true,
        });
        return reply.send({ success: true, data: doc });
      },
    },

    // PATCH /accounts/:id/disable — Deactivate an account
    {
      method: 'PATCH',
      path: '/:id/disable',
      summary: 'Disable (deactivate) an account',
      permissions: requireOrgManager(),
      wrapHandler: false,
      handler: async (req: any, reply: any) => {
        const orgId = req.scope?.organizationId;
        if (!orgId) {
          return reply.status(400).send({ error: 'Organization context required' });
        }
        const account = await Account.findOne({
          _id: req.params.id,
          organizationId: orgId,
        });
        if (!account) {
          return reply.status(404).send({ error: 'Account not found' });
        }

        // Check for existing journal entries referencing this account
        const hasEntries = await JournalEntry.findOne({
          'journalItems.account': req.params.id,
          organizationId: orgId,
        }).lean();
        if (hasEntries) {
          return reply.status(400).send({
            error: 'Cannot disable account with existing transactions',
          });
        }

        const doc = await accountRepository.update(req.params.id, {
          active: false,
        });
        return reply.send({ success: true, data: doc });
      },
    },
  ],
});

export default accountResource;
