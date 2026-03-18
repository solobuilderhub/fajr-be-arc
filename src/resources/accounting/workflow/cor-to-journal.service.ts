/**
 * COR-to-Journal Service
 *
 * Converts parsed COR file data into journal entries.
 * - Ensures accounts exist in Chart of Accounts (creates if missing)
 * - Determines debit/credit based on GIFI account category normal balance
 * - Adds balancing entry to Retained Earnings (GIFI 3600) when needed
 * - Creates draft journal entry with COR_IMPORT type
 * - Optionally auto-posts the entry
 */

import mongoose from 'mongoose';
import { Money, getNormalBalance } from '@classytic/ledger';
import type { MainType } from '@classytic/ledger';
import { canadaPack } from '#config/accounting.js';
import { Account } from '../account/account.model.js';
import { JournalEntry } from '../journal-entry/journal-entry.model.js';
import accountRepository from '../account/account.repository.js';
import journalEntryRepository from '../journal-entry/journal-entry.repository.js';

// ─── Types ──────────────────────────────────────────────────────────────────

export interface CORAccount {
  gifiCode: string;
  accountName: string;
  value: number | null;
  category: string;
  isTotal?: boolean;
  schedule?: number;
  scheduleName?: string;
}

export interface CORCorporation {
  name: string;
  number?: string;
  taxYear?: number | string;
  fiscalPeriod?: {
    start?: string | Date | null;
    end?: string | Date | null;
  };
}

export interface CORImportOptions {
  skipTotals?: boolean;
  createMissingAccounts?: boolean;
  autoPost?: boolean;
  journalName?: string;
}

export interface CORImportInput {
  corporation: CORCorporation;
  accounts: CORAccount[];
  entryDate?: string | Date;
  description?: string;
  options?: CORImportOptions;
}

interface JournalItem {
  account: mongoose.Types.ObjectId;
  label: string;
  debit: number;
  credit: number;
  taxDetails: never[];
}

interface ConversionStats {
  processed: number;
  skipped: number;
  created: number;
  errors: { gifiCode: string; accountName: string; reason: string }[];
}

// ─── Helpers ────────────────────────────────────────────────────────────────

/**
 * Ensure a Chart of Accounts record exists for the given GIFI code.
 * Creates the account if missing and `createIfMissing` is true.
 */
async function ensureAccountExists(
  gifiCode: string,
  organizationId: string,
  createIfMissing: boolean,
  session: mongoose.ClientSession | null,
) {
  const query: any = { organizationId, accountTypeCode: gifiCode };
  const findQuery = Account.findOne(query);
  if (session) findQuery.session(session);
  let account = await findQuery;

  if (account) return account;
  if (!createIfMissing) return null;

  // Validate GIFI code
  const accountType = canadaPack.getAccountType(gifiCode);
  if (!accountType) {
    throw new Error(`Invalid GIFI code: ${gifiCode}. Not found in account type constants.`);
  }

  if (!canadaPack.isPostingAccount(gifiCode)) {
    const reason = (accountType as any).isGroup ? 'structural/group node' : 'calculated total';
    throw new Error(
      `Cannot create account for GIFI code ${gifiCode} (${accountType.name}). ` +
        `This is a ${reason}, not a posting account.`,
    );
  }

  // Create via model (session-aware)
  const orgObjectId = new mongoose.Types.ObjectId(organizationId);
  const createOpts = session ? { session } : {};
  const [created] = await Account.create(
    [
      {
        organizationId: orgObjectId,
        accountTypeCode: gifiCode,
        active: true,
        isCashAccount: gifiCode === '1000',
      },
    ],
    createOpts,
  );

  return created;
}

/**
 * Convert an array of COR accounts into journal items.
 */
async function convertAccountsToJournalItems(
  accounts: CORAccount[],
  organizationId: string,
  options: CORImportOptions,
  session: mongoose.ClientSession | null,
): Promise<{ journalItems: JournalItem[]; stats: ConversionStats }> {
  const { skipTotals = true, createMissingAccounts = true } = options;

  const journalItems: JournalItem[] = [];
  const stats: ConversionStats = { processed: 0, skipped: 0, created: 0, errors: [] };

  for (const acct of accounts) {
    const { gifiCode, value, isTotal, accountName } = acct;

    // Skip zero / null values
    if (value == null || value === 0) {
      stats.skipped++;
      continue;
    }

    // Skip total accounts when option is set
    if (skipTotals && isTotal) {
      stats.skipped++;
      continue;
    }

    try {
      const chartAccount = await ensureAccountExists(
        gifiCode,
        organizationId,
        createMissingAccounts,
        session,
      );

      if (!chartAccount) {
        stats.errors.push({ gifiCode, accountName, reason: 'Account not found and creation disabled' });
        stats.skipped++;
        continue;
      }

      // Determine debit vs credit from GIFI category → mainType → normalBalance
      // Category format: "Balance Sheet-Asset", "Income Statement-Income", etc.
      const accountType = canadaPack.getAccountType(gifiCode);
      const categoryParts = accountType?.category?.split('-');
      const mainType = (categoryParts?.length === 2 ? categoryParts[1] : null) as MainType | null;
      const normalBalance = mainType ? getNormalBalance(mainType) : 'debit';

      let debit = 0;
      let credit = 0;

      if (normalBalance === 'debit') {
        debit = Money.fromDecimal(Math.abs(value));
      } else {
        credit = Money.fromDecimal(Math.abs(value));
      }

      journalItems.push({
        account: chartAccount._id,
        label: `Opening balance - ${accountName}`,
        debit,
        credit,
        taxDetails: [],
      });

      stats.created++;
      stats.processed++;
    } catch (err: any) {
      stats.errors.push({ gifiCode, accountName, reason: err.message });
      stats.skipped++;
    }
  }

  return { journalItems, stats };
}

// ─── Main Service ───────────────────────────────────────────────────────────

/**
 * Import parsed COR data as a journal entry.
 *
 * Runs inside a MongoDB transaction so account creation + journal entry
 * are atomic. Returns the created journal entry and conversion statistics.
 */
export async function importCORToJournal(
  input: CORImportInput,
  organizationId: string,
): Promise<{
  journalEntry: any;
  statistics: {
    totalAccounts: number;
    journalItemsCreated: number;
    balanced: boolean;
  } & ConversionStats;
}> {
  // Try to use a transaction for atomicity; fall back to no-session
  // when the MongoDB instance doesn't support transactions (e.g. standalone / tests).
  let session: mongoose.ClientSession | null = null;
  let useTransaction = false;

  try {
    const s = await mongoose.startSession();
    s.startTransaction();
    // Probe: run a lightweight op to verify transactions actually work
    await mongoose.connection.db!.admin().ping({ session: s });
    session = s;
    useTransaction = true;
  } catch {
    // Transactions not supported — proceed without session
    session = null;
  }

  try {
    const {
      corporation,
      accounts,
      entryDate,
      description,
      options = {},
    } = input;

    // 1. Convert accounts to journal items
    const { journalItems, stats } = await convertAccountsToJournalItems(
      accounts,
      organizationId,
      options,
      session,
    );

    if (journalItems.length === 0) {
      throw new Error('No valid accounts to import. All accounts were skipped.');
    }

    // 2. Determine effective date
    let effectiveDate = new Date();
    if (entryDate) {
      effectiveDate = new Date(entryDate);
    } else if (corporation.fiscalPeriod?.end) {
      effectiveDate = new Date(corporation.fiscalPeriod.end);
    }

    // 3. Add balancing entry to Retained Earnings (GIFI 3600) if needed
    const totalDebit = journalItems.reduce((sum, item) => sum + item.debit, 0);
    const totalCredit = journalItems.reduce((sum, item) => sum + item.credit, 0);
    const difference = Math.abs(totalDebit - totalCredit);

    if (difference !== 0) {
      const retainedEarnings = await ensureAccountExists('3600', organizationId, true, session);
      if (!retainedEarnings) {
        throw new Error('Failed to find or create Retained Earnings (GIFI 3600) account');
      }

      journalItems.push({
        account: retainedEarnings._id,
        label: 'Balancing entry - Retained Earnings',
        debit: totalDebit > totalCredit ? 0 : difference,
        credit: totalDebit > totalCredit ? difference : 0,
        taxDetails: [],
      });
    }

    // 4. Create journal entry
    const entryLabel =
      description ||
      options.journalName ||
      `COR Import - ${corporation.taxYear || new Date().getFullYear()}`;

    const createOpts = session ? { session } : {};
    const journalEntry = await journalEntryRepository.create(
      {
        organizationId,
        journalType: 'MISC',
        date: effectiveDate,
        label: entryLabel,
        journalItems,
        state: 'draft',
      },
      createOpts,
    );

    // 5. Auto-post if requested
    if (options.autoPost) {
      await (journalEntryRepository as any).post(journalEntry._id, organizationId, createOpts);
    }

    if (useTransaction && session) {
      await session.commitTransaction();
    }

    // Return populated entry
    const populated = await JournalEntry.findById(journalEntry._id)
      .populate('journalItems.account')
      .lean();

    return {
      journalEntry: populated,
      statistics: {
        ...stats,
        totalAccounts: accounts.length,
        journalItemsCreated: journalItems.length,
        balanced: difference === 0,
      },
    };
  } catch (err) {
    if (useTransaction && session) {
      await session.abortTransaction();
    }
    throw err;
  } finally {
    if (session) {
      session.endSession();
    }
  }
}
