/**
 * Organization Profile Resource
 *
 * 1:1 with Better Auth organization (singleton-per-org via getOrCreate).
 * Replaces the old Business resource from fajr-be-old.
 *
 * Prefix: /business — matches legacy frontend API calls.
 * Delete disabled — org profiles are permanent.
 *
 * Custom routes:
 *   POST /business/generate-defaults — Seed chart of accounts & mark setup complete
 */

import { defineResource } from '@classytic/arc';
import { createAdapter } from '#shared/adapter.js';
import { orgScoped } from '#shared/presets/index.js';
import {
  requireOrgStaff,
  requireOrgManager,
  requireOrgOwner,
} from '#shared/permissions.js';
import OrgProfile from './org-profile.model.js';
import orgProfileRepository from './org-profile.repository.js';
import orgProfileController from './org-profile.controller.js';
import accountRepository from '../accounting/account/account.repository.js';
import { FiscalPeriod } from '../accounting/fiscal-period/fiscal-period.model.js';

const orgProfileResource = defineResource({
  name: 'org-profile',
  displayName: 'Business Profile',
  prefix: '/business',

  adapter: createAdapter(OrgProfile, orgProfileRepository),
  controller: orgProfileController,
  presets: [orgScoped],

  permissions: {
    list: requireOrgStaff(),
    get: requireOrgStaff(),
    create: requireOrgManager(),
    update: requireOrgManager(),
  },

  disabledRoutes: ['delete'],

  additionalRoutes: [
    // POST /business/generate-defaults — Seed accounts & mark setup complete
    {
      method: 'POST',
      path: '/generate-defaults',
      summary: 'Generate default chart of accounts and complete business setup',
      permissions: requireOrgOwner(),
      wrapHandler: false,
      handler: async (req: any, reply: any) => {
        const orgId = req.scope?.organizationId;
        if (!orgId) {
          return reply
            .status(400)
            .send({ success: false, error: 'Organization context required' });
        }

        // Check if already completed
        const profile = await OrgProfile.findOne({ organizationId: orgId });
        if (!profile) {
          return reply
            .status(404)
            .send({ success: false, error: 'Business profile not found. Create one first.' });
        }

        if (profile.status === 'completed') {
          return reply
            .status(400)
            .send({ success: false, error: 'Business setup is already completed' });
        }

        // Seed chart of accounts
        await (accountRepository as any).seedAccounts(orgId);

        // Create first fiscal period (current calendar year)
        const year = new Date().getFullYear();
        const existingPeriod = await FiscalPeriod.findOne({ organizationId: orgId });
        if (!existingPeriod) {
          await FiscalPeriod.create({
            organizationId: orgId,
            name: `FY ${year}`,
            startDate: new Date(year, 0, 1),
            endDate: new Date(year, 11, 31),
            closed: false,
          });
        }

        // Mark setup as completed
        profile.status = 'completed';
        await profile.save();

        return reply.send({
          success: true,
          data: {
            accounts: 'Generated default chart of accounts',
            taxes: 'Taxes available via constants',
            fiscalPeriod: `Created FY ${year}`,
          },
        });
      },
    },
  ],
});

export default orgProfileResource;
