/**
 * Accounting Engine Configuration
 *
 * Single instance of the accounting engine used across the app.
 * Configured for multi-tenant (organization-scoped) Canadian accounting.
 *
 * Usage:
 *   import { accounting, canadaPack } from '#config/accounting.js';
 *
 *   const AccountSchema = accounting.createAccountSchema();
 *   const reports = accounting.createReports({ Account, JournalEntry });
 */

import { createAccountingEngine } from '@classytic/ledger';
import { canadaPack } from '@classytic/ledger-ca';

export { canadaPack };

export const accounting = createAccountingEngine({
  country: canadaPack,
  currency: 'CAD',
  multiTenant: {
    orgField: 'organizationId',
    orgRef: 'organization',
  },
  fiscalYearStartMonth: 1,
});

export default accounting;
