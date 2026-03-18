/**
 * migrate-to-cents.js
 *
 * Converts existing dollar-based journal entry data to integer cents.
 *
 * Before:  { debit: 100.50, credit: 0, totalDebit: 100.50, totalCredit: 100.50 }
 * After:   { debit: 10050,  credit: 0, totalDebit: 10050,  totalCredit: 10050  }
 *
 * Idempotent: skips documents where ALL monetary values are already integers.
 * Non-destructive: does NOT delete or drop anything.
 * Manual: must be executed explicitly by an operator.
 *
 * Usage:
 *   node src/scripts/migrate-to-cents.js
 */

import mongoose from 'mongoose';
import dotenv from 'dotenv';
import { resolve, dirname } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));

// Load .env.dev from project root
dotenv.config({ path: resolve(__dirname, '../../.env.dev') });

const BATCH_SIZE = 500;
const MONGODB_URI = process.env.MONGODB_URI || process.env.MONGO_URI;

if (!MONGODB_URI) {
  console.error('Error: MONGODB_URI or MONGO_URI environment variable is required.');
  process.exit(1);
}

/**
 * Check if a value looks like it's already in cents (integer).
 */
function isAlreadyCents(value) {
  return Number.isInteger(value);
}

/**
 * Convert a dollar amount to integer cents.
 * Uses Math.round to handle floating-point artifacts (e.g. 100.50 * 100 = 10049.999...)
 */
function dollarsToCents(dollars) {
  return Math.round(dollars * 100);
}

/**
 * Check if a document needs migration.
 * Returns true if ANY monetary field is a non-integer (i.e. still in dollars).
 */
function needsMigration(doc) {
  // Check top-level totals
  if (!isAlreadyCents(doc.totalDebit) || !isAlreadyCents(doc.totalCredit)) {
    return true;
  }

  // Check journal items
  if (doc.journalItems && doc.journalItems.length > 0) {
    for (const item of doc.journalItems) {
      if (
        (item.debit !== undefined && !isAlreadyCents(item.debit)) ||
        (item.credit !== undefined && !isAlreadyCents(item.credit))
      ) {
        return true;
      }
    }
  }

  return false;
}

async function migrate() {
  console.log(`Connecting to MongoDB: ${MONGODB_URI}`);
  await mongoose.connect(MONGODB_URI);
  console.log('Connected.');

  const db = mongoose.connection.db;
  const collection = db.collection('journalentries');

  const totalDocs = await collection.countDocuments();
  console.log(`Found ${totalDocs} journal entries total.`);

  let cursor = collection.find({});
  let migrated = 0;
  let skipped = 0;
  let batchOps = [];
  let batchNum = 0;

  for await (const doc of cursor) {
    if (!needsMigration(doc)) {
      skipped++;
      continue;
    }

    // Build the update for this document
    const updatedItems = (doc.journalItems || []).map((item) => ({
      ...item,
      debit: item.debit !== undefined ? dollarsToCents(item.debit) : 0,
      credit: item.credit !== undefined ? dollarsToCents(item.credit) : 0,
    }));

    const updatedTotalDebit = dollarsToCents(doc.totalDebit || 0);
    const updatedTotalCredit = dollarsToCents(doc.totalCredit || 0);

    batchOps.push({
      updateOne: {
        filter: { _id: doc._id },
        update: {
          $set: {
            journalItems: updatedItems,
            totalDebit: updatedTotalDebit,
            totalCredit: updatedTotalCredit,
          },
        },
      },
    });

    // Flush batch
    if (batchOps.length >= BATCH_SIZE) {
      batchNum++;
      await collection.bulkWrite(batchOps, { ordered: false });
      migrated += batchOps.length;
      console.log(`Migrated batch ${batchNum} (${batchOps.length} docs) — ${migrated} total so far`);
      batchOps = [];
    }
  }

  // Flush remaining
  if (batchOps.length > 0) {
    batchNum++;
    await collection.bulkWrite(batchOps, { ordered: false });
    migrated += batchOps.length;
    console.log(`Migrated batch ${batchNum} (${batchOps.length} docs) — ${migrated} total`);
  }

  console.log('\n--- Migration Complete ---');
  console.log(`  Total documents: ${totalDocs}`);
  console.log(`  Migrated:        ${migrated}`);
  console.log(`  Skipped (already cents): ${skipped}`);

  await mongoose.disconnect();
  console.log('Disconnected.');
}

migrate().catch((err) => {
  console.error('Migration failed:', err);
  process.exit(1);
});
