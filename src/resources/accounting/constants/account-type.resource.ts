/**
 * Account Type Resource — GIFI Account Type Lookups
 *
 * Static reference data from @classytic/ledger-ca.
 * No database — service resource with custom routes only.
 *
 * Endpoints:
 *   GET /account-types          — List all GIFI account types (filterable)
 *   GET /account-types/:code    — Get single account type by code
 */

import { defineResource } from '@classytic/arc';
import { requireAuth } from '#shared/permissions.js';
import { GIFI_ACCOUNT_TYPES } from '@classytic/ledger-ca';
import { accountTypeSchemas } from './constants.schemas.js';

function mapAccountType(at: any) {
  return {
    code: at.code,
    name: at.name,
    description: at.description ?? null,
    category: at.category,
    parentCode: at.parentCode ?? null,
    isTotal: at.isTotal ?? false,
    isGroup: at.isGroup ?? false,
    deprecated: at.deprecated ?? false,
    replacedBy: at.replacedBy ?? null,
    taxMetadata: at.taxMetadata ?? null,
    cashFlowCategory: at.cashFlowCategory ?? null,
  };
}

const accountTypeResource = defineResource({
  name: 'account-type',
  displayName: 'Account Types',
  prefix: '/account-types',

  disableDefaultRoutes: true,
  skipValidation: true,

  additionalRoutes: [
    // GET /account-types — List all GIFI account types
    {
      method: 'GET',
      path: '/',
      summary: 'List all GIFI account types',
      permissions: requireAuth(),
      wrapHandler: false,
      schema: accountTypeSchemas.list,
      handler: async (req: any) => {
        const { search, category, mainType } = req.query as any;

        let accountTypes = GIFI_ACCOUNT_TYPES.map(mapAccountType);

        if (search) {
          const s = String(search).toLowerCase();
          accountTypes = accountTypes.filter(
            (at) =>
              at.code.toLowerCase().includes(s) ||
              at.name.toLowerCase().includes(s),
          );
        }

        if (category) {
          accountTypes = accountTypes.filter((at) => at.category === category);
        }

        if (mainType) {
          accountTypes = accountTypes.filter((at) =>
            at.category.endsWith(`-${mainType}`),
          );
        }

        return { success: true, results: accountTypes.length, data: accountTypes };
      },
    },

    // GET /account-types/:code — Get single account type
    {
      method: 'GET',
      path: '/:code',
      summary: 'Get account type by GIFI code',
      permissions: requireAuth(),
      wrapHandler: false,
      schema: accountTypeSchemas.get,
      handler: async (req: any, reply: any) => {
        const { code } = req.params;
        const accountType = (GIFI_ACCOUNT_TYPES as any[]).find((at) => at.code === code);

        if (!accountType) {
          return reply
            .status(404)
            .send({ success: false, error: `Account type '${code}' not found` });
        }

        return {
          success: true,
          data: {
            ...mapAccountType(accountType),
            totalAccountTypes: accountType.totalAccountTypes ?? null,
          },
        };
      },
    },
  ],
});

export default accountTypeResource;
