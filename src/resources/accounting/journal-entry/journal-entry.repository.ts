/**
 * Journal Entry Repository — MongoKit-powered data access.
 *
 * Uses @classytic/ledger engine to wire post/reverse domain logic.
 * Double-entry and fiscal-lock plugins enforce immutability and period checks.
 */

import { Repository, timestampPlugin } from '@classytic/mongokit';
import { doubleEntryPlugin, fiscalLockPlugin } from '@classytic/ledger';
import { Account } from '../account/account.model.js';
import { JournalEntry } from './journal-entry.model.js';
import { FiscalPeriod } from '../fiscal-period/fiscal-period.model.js';
import accounting from '#config/accounting.js';

const journalEntryRepository = new Repository(JournalEntry, [
  timestampPlugin(),
  doubleEntryPlugin({
    JournalEntryModel: JournalEntry,
    AccountModel: Account,
    orgField: 'organizationId',
  }),
  fiscalLockPlugin({
    FiscalPeriodModel: FiscalPeriod,
    JournalEntryModel: JournalEntry,
    orgField: 'organizationId',
  }),
]);

// Wire post/reverse from the accounting engine
accounting.wireJournalEntryRepository(journalEntryRepository, JournalEntry);

export default journalEntryRepository;
