/**
 * Fiscal Period Resource — CRUD + Close/Reopen Actions
 *
 * Manages fiscal periods for the organization.
 * Close prevents posting entries to that period; reopen allows it again.
 */

import { defineResource } from '@classytic/arc';
import { QueryParser } from '@classytic/mongokit';
import { closeFiscalPeriod, reopenFiscalPeriod } from '@classytic/ledger';
import { createAdapter } from '#shared/adapter.js';
import { fiscalPeriodPermissions, requireOrgOwner } from '#shared/permissions.js';
import { orgScoped } from '#shared/presets/index.js';
import { FiscalPeriod } from './fiscal-period.model.js';
import fiscalPeriodRepository from './fiscal-period.repository.js';
import { canadaPack } from '#config/accounting.js';
import { Account } from '../account/account.model.js';
import { JournalEntry } from '../journal-entry/journal-entry.model.js';

const queryParser = new QueryParser({ maxLimit: 100 });

const fiscalPeriodResource = defineResource({
  name: 'fiscal-period',
  displayName: 'Fiscal Periods',
  prefix: '/fiscal-periods',

  adapter: createAdapter(FiscalPeriod, fiscalPeriodRepository),
  queryParser,
  presets: [orgScoped],
  permissions: fiscalPeriodPermissions,

  additionalRoutes: [
    // PATCH /fiscal-periods/:id/close — Close a fiscal period
    {
      method: 'PATCH',
      path: '/:id/close',
      summary: 'Close a fiscal period (prevents posting)',
      permissions: requireOrgOwner(),
      wrapHandler: false,
      handler: async (req: any, reply: any) => {
        const orgId = req.scope?.organizationId;
        if (!orgId) {
          return reply.status(400).send({ error: 'Organization context required' });
        }
        const userId = req.scope?.userId || req.user?.id;
        const result = await closeFiscalPeriod(
          {
            AccountModel: Account,
            JournalEntryModel: JournalEntry,
            FiscalPeriodModel: FiscalPeriod,
            country: canadaPack,
            orgField: 'organizationId',
          },
          {
            periodId: req.params.id,
            organizationId: orgId,
            closedBy: userId,
          },
        );
        return reply.send({ success: true, data: result });
      },
    },

    // PATCH /fiscal-periods/:id/reopen — Reopen a closed fiscal period
    {
      method: 'PATCH',
      path: '/:id/reopen',
      summary: 'Reopen a closed fiscal period',
      permissions: requireOrgOwner(),
      wrapHandler: false,
      handler: async (req: any, reply: any) => {
        const orgId = req.scope?.organizationId;
        if (!orgId) {
          return reply.status(400).send({ error: 'Organization context required' });
        }
        const userId = req.scope?.userId || req.user?.id;
        const result = await reopenFiscalPeriod(
          {
            AccountModel: Account,
            JournalEntryModel: JournalEntry,
            FiscalPeriodModel: FiscalPeriod,
            orgField: 'organizationId',
          },
          {
            periodId: req.params.id,
            organizationId: orgId,
            reopenedBy: userId,
          },
        );
        return reply.send({ success: true, data: result });
      },
    },
  ],
});

export default fiscalPeriodResource;
