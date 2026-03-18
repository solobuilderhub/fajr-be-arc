/**
 * Journal Type Resource — Journal Type Lookups
 *
 * Static reference data from @classytic/ledger.
 * No database — service resource with custom routes only.
 *
 * Endpoints:
 *   GET /journal-types          — List all journal types
 *   GET /journal-types/:code    — Get single journal type by code
 */

import { defineResource } from '@classytic/arc';
import { requireAuth } from '#shared/permissions.js';
import { JOURNAL_TYPES } from '@classytic/ledger';
import { journalTypeSchemas } from './constants.schemas.js';

const journalTypeResource = defineResource({
  name: 'journal-type',
  displayName: 'Journal Types',
  prefix: '/journal-types',

  disableDefaultRoutes: true,
  skipValidation: true,

  additionalRoutes: [
    // GET /journal-types — List all journal types
    {
      method: 'GET',
      path: '/',
      summary: 'List all journal types',
      permissions: requireAuth(),
      wrapHandler: false,
      schema: journalTypeSchemas.list,
      handler: async () => {
        const journalTypes = Object.values(JOURNAL_TYPES) as any[];
        return {
          success: true,
          results: journalTypes.length,
          data: journalTypes.map((jt) => ({
            code: jt.code,
            name: jt.name,
            description: jt.description ?? null,
          })),
        };
      },
    },

    // GET /journal-types/:code — Get single journal type
    {
      method: 'GET',
      path: '/:code',
      summary: 'Get journal type by code',
      permissions: requireAuth(),
      wrapHandler: false,
      schema: journalTypeSchemas.get,
      handler: async (req: any, reply: any) => {
        const { code } = req.params;
        const journalType = (JOURNAL_TYPES as Record<string, any>)[code];

        if (!journalType) {
          return reply
            .status(404)
            .send({ success: false, error: `Journal type '${code}' not found` });
        }

        return {
          success: true,
          data: {
            code: journalType.code,
            name: journalType.name,
            description: journalType.description ?? null,
          },
        };
      },
    },
  ],
});

export default journalTypeResource;
