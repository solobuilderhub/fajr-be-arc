/**
 * migrate-cleanup.js
 *
 * Post-migration cleanup for the accounting module:
 *
 * 1. Remove stale `balance` field from account documents
 *    (The engine computes balances from journal entries — no cached balances.)
 *
 * 2. Set human-readable account names from the Canada country pack
 *    (Accounts were bulk-seeded with name = accountTypeCode, e.g. "1000".)
 *
 * 3. Fix reference numbers on journal entries whose ref doesn't match date
 *    (Ref format: TYPE/YYYY/MM/NNNN — some were created with wrong dates.)
 *
 * 4. Delete empty draft journal entries (zero items, zero amounts)
 *
 * Idempotent: safe to run multiple times.
 * Non-destructive: only modifies metadata, never touches amounts.
 *
 * Usage:
 *   node src/scripts/migrate-cleanup.js                    # dry run (default)
 *   node src/scripts/migrate-cleanup.js --apply            # apply changes
 *   node src/scripts/migrate-cleanup.js --apply --org=ID   # single org only
 */

import mongoose from 'mongoose';
import dotenv from 'dotenv';
import { resolve, dirname } from 'path';
import { fileURLToPath } from 'url';
import { createAccountingEngine } from '@classytic/ledger';
import { canadaPack } from '@classytic/ledger-ca';

const __dirname = dirname(fileURLToPath(import.meta.url));
dotenv.config({ path: resolve(__dirname, '../../.env.dev') });

const MONGODB_URI = process.env.MONGODB_URI || process.env.MONGO_URI;
if (!MONGODB_URI) {
  console.error('ERROR: No MONGODB_URI or MONGO_URI found in .env.dev');
  process.exit(1);
}

const DRY_RUN = !process.argv.includes('--apply');
const ORG_FILTER = process.argv.find(a => a.startsWith('--org='))?.split('=')[1];

// ── Helpers ──────────────────────────────────────────────────────────────────

function log(msg) {
  console.log(`[cleanup] ${msg}`);
}

function buildOrgQuery() {
  if (ORG_FILTER) {
    return { organizationId: new mongoose.Types.ObjectId(ORG_FILTER) };
  }
  return {};
}

// ── Step 1: Remove stale balance field ───────────────────────────────────────

async function removeStaleBalances(db) {
  const accounts = db.collection('accounts');
  const filter = { balance: { $exists: true }, ...buildOrgQuery() };
  const count = await accounts.countDocuments(filter);

  if (count === 0) {
    log('Step 1: No accounts with stale balance field — skipped');
    return;
  }

  log(`Step 1: ${count} accounts have stale "balance" field`);

  if (DRY_RUN) {
    log('  [dry-run] Would $unset balance field');
    return;
  }

  const result = await accounts.updateMany(filter, { $unset: { balance: '' } });
  log(`  Removed balance field from ${result.modifiedCount} accounts`);
}

// ── Step 2: Set human-readable account names ─────────────────────────────────

async function fixAccountNames(db) {
  const accounts = db.collection('accounts');
  const query = { ...buildOrgQuery() };
  const allAccounts = await accounts.find(query).toArray();

  let fixCount = 0;
  const updates = [];

  for (const acc of allAccounts) {
    const code = acc.accountTypeCode;
    const at = canadaPack.getAccountType(code);
    if (!at) continue;

    // Only fix if name is still set to the raw code (not user-customized)
    if (acc.name === code || acc.name === acc.accountNumber) {
      updates.push({
        updateOne: {
          filter: { _id: acc._id },
          update: { $set: { name: at.name } },
        },
      });
      fixCount++;
    }
  }

  if (fixCount === 0) {
    log('Step 2: All account names already set — skipped');
    return;
  }

  log(`Step 2: ${fixCount}/${allAccounts.length} accounts need name update`);

  if (DRY_RUN) {
    // Show first 10 examples
    for (const u of updates.slice(0, 10)) {
      const name = u.updateOne.update.$set.name;
      const id = u.updateOne.filter._id;
      const acc = allAccounts.find(a => a._id.equals(id));
      log(`  [dry-run] ${acc.accountTypeCode}: "${acc.name}" → "${name}"`);
    }
    if (updates.length > 10) log(`  ... and ${updates.length - 10} more`);
    return;
  }

  const result = await accounts.bulkWrite(updates);
  log(`  Updated ${result.modifiedCount} account names`);
}

// ── Step 3: Fix reference numbers that don't match JE dates ──────────────────

async function fixReferenceNumbers(db) {
  const journalEntries = db.collection('journalentries');
  const query = {
    referenceNumber: { $exists: true },
    date: { $exists: true },
    ...buildOrgQuery(),
  };

  const entries = await journalEntries.find(query).toArray();
  const mismatches = [];

  for (const je of entries) {
    const ref = je.referenceNumber;
    const date = new Date(je.date);
    if (!ref || isNaN(date.getTime())) continue;

    // Parse ref: TYPE/YYYY/MM/NNNN
    const parts = ref.split('/');
    if (parts.length !== 4) continue;

    const [type, refYear, refMonth, seq] = parts;
    const actualYear = String(date.getFullYear());
    const actualMonth = String(date.getMonth() + 1).padStart(2, '0');

    if (refYear !== actualYear || refMonth !== actualMonth) {
      const newRef = `${type}/${actualYear}/${actualMonth}/${seq}`;
      mismatches.push({ _id: je._id, oldRef: ref, newRef, date: date.toISOString().slice(0, 10) });
    }
  }

  if (mismatches.length === 0) {
    log('Step 3: All reference numbers match dates — skipped');
    return;
  }

  log(`Step 3: ${mismatches.length} JEs have ref/date mismatch`);

  for (const m of mismatches) {
    log(`  ${m.oldRef} → ${m.newRef} (date: ${m.date})`);
  }

  if (DRY_RUN) {
    log('  [dry-run] Would update reference numbers');
    return;
  }

  // Check for conflicts first
  for (const m of mismatches) {
    const existing = await journalEntries.findOne({
      referenceNumber: m.newRef,
      ...buildOrgQuery(),
    });
    if (existing && !existing._id.equals(m._id)) {
      log(`  CONFLICT: ${m.newRef} already exists — skipping ${m.oldRef}`);
      continue;
    }
    await journalEntries.updateOne(
      { _id: m._id },
      { $set: { referenceNumber: m.newRef } },
    );
    log(`  Fixed: ${m.oldRef} → ${m.newRef}`);
  }
}

// ── Step 4: Delete empty draft journal entries ───────────────────────────────

async function deleteEmptyDrafts(db) {
  const journalEntries = db.collection('journalentries');
  const query = {
    state: 'draft',
    $or: [
      { journalItems: { $size: 0 } },
      { journalItems: { $exists: false } },
      { totalDebit: 0, totalCredit: 0, journalItems: { $size: 0 } },
    ],
    ...buildOrgQuery(),
  };

  const emptyDrafts = await journalEntries.find(query).toArray();

  if (emptyDrafts.length === 0) {
    log('Step 4: No empty draft JEs — skipped');
    return;
  }

  log(`Step 4: ${emptyDrafts.length} empty draft JEs found`);
  for (const je of emptyDrafts) {
    log(`  ${je.referenceNumber || '(no ref)'} — date: ${je.date ? new Date(je.date).toISOString().slice(0, 10) : 'none'}`);
  }

  if (DRY_RUN) {
    log('  [dry-run] Would delete empty drafts');
    return;
  }

  const result = await journalEntries.deleteMany({
    _id: { $in: emptyDrafts.map(d => d._id) },
  });
  log(`  Deleted ${result.deletedCount} empty draft JEs`);
}

// ── Main ─────────────────────────────────────────────────────────────────────

async function main() {
  log(DRY_RUN ? 'DRY RUN — no changes will be made' : 'APPLYING changes');
  if (ORG_FILTER) log(`Filtering to org: ${ORG_FILTER}`);
  log(`Connecting to: ${MONGODB_URI.replace(/\/\/.*@/, '//<redacted>@')}`);

  await mongoose.connect(MONGODB_URI);
  const db = mongoose.connection.db;
  log('Connected\n');

  await removeStaleBalances(db);
  log('');
  await fixAccountNames(db);
  log('');
  await fixReferenceNumbers(db);
  log('');
  await deleteEmptyDrafts(db);

  log('\nDone.');
  if (DRY_RUN) {
    log('Re-run with --apply to execute changes.');
  }

  await mongoose.disconnect();
}

main().catch((err) => {
  console.error('Migration failed:', err);
  process.exit(1);
});
