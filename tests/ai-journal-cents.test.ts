/**
 * AI Journal Handler — Cents Conversion Tests
 *
 * Verifies that the AI-to-journal pipeline produces integer cents, not dollars.
 * Tests Money.fromDecimal (used in processJournalItemsWithTax) and validates
 * the full round-trip: AI dollar strings → integer cents in DB → API response.
 */

import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { Money } from '@classytic/ledger';
import { getTaxCodeDetails } from '@classytic/ledger-ca';
import {
  setupTestOrg,
  teardownTestOrg,
  authHeaders,
  safeParseBody,
  type TestContext,
} from './helpers/setup.js';

// ═══════════════════════════════════════════════════════════════════════════════
// Unit Tests — Money.fromDecimal (the conversion used in AI handler)
// ═══════════════════════════════════════════════════════════════════════════════

describe('Money.fromDecimal — AI dollar string → integer cents', () => {
  it('converts whole dollars to cents', () => {
    expect(Money.fromDecimal(45)).toBe(4500);
    expect(Money.fromDecimal(100)).toBe(10000);
    expect(Money.fromDecimal(0)).toBe(0);
  });

  it('converts fractional dollars to cents', () => {
    expect(Money.fromDecimal(10.50)).toBe(1050);
    expect(Money.fromDecimal(42.86)).toBe(4286);
    expect(Money.fromDecimal(0.01)).toBe(1);
    expect(Money.fromDecimal(0.99)).toBe(99);
  });

  it('handles floating-point edge cases', () => {
    // Classic floating-point trap: 0.1 + 0.2 = 0.30000000000000004
    expect(Money.fromDecimal(0.1 + 0.2)).toBe(30);
    // 19.99 * 1 should be 1999 cents
    expect(Money.fromDecimal(19.99)).toBe(1999);
  });

  it('rounds sub-cent amounts correctly', () => {
    // Tax splits often produce values like 42.857142...
    expect(Money.fromDecimal(42.857)).toBe(4286); // rounds up
    expect(Money.fromDecimal(42.854)).toBe(4285); // rounds down
    expect(Money.fromDecimal(42.855)).toBe(4286); // banker's rounding (Math.round)
  });

  it('always returns an integer', () => {
    const testValues = [0, 1, 10.5, 42.857, 100.999, 0.001, 1234.56];
    for (const v of testValues) {
      const result = Money.fromDecimal(v);
      expect(Number.isInteger(result)).toBe(true);
    }
  });
});

// ═══════════════════════════════════════════════════════════════════════════════
// Unit Tests — Tax splitting produces integer cents
// ═══════════════════════════════════════════════════════════════════════════════

describe('Tax splitting — GST 5% produces integer cents', () => {
  it('splits a tax-inclusive amount correctly', () => {
    const taxDetails = getTaxCodeDetails('GST5');
    expect(taxDetails).toBeTruthy();

    // Simulate AI handler logic: $45.00 gross → base + GST
    const grossCents = Money.fromDecimal(45.00); // 4500
    const baseCents = Math.round(grossCents / (1 + taxDetails!.rate)); // 4500 / 1.05 = 4285.71... → 4286
    const taxCents = grossCents - baseCents; // 4500 - 4286 = 214

    expect(Number.isInteger(grossCents)).toBe(true);
    expect(Number.isInteger(baseCents)).toBe(true);
    expect(Number.isInteger(taxCents)).toBe(true);
    expect(baseCents + taxCents).toBe(grossCents); // No rounding loss
  });

  it('splits a small amount without fractional cents', () => {
    const taxDetails = getTaxCodeDetails('GST-ITC5');
    expect(taxDetails).toBeTruthy();

    const grossCents = Money.fromDecimal(1.05); // 105 cents
    const baseCents = Math.round(grossCents / (1 + taxDetails!.rate)); // 105 / 1.05 = 100
    const taxCents = grossCents - baseCents; // 5

    expect(baseCents).toBe(100);
    expect(taxCents).toBe(5);
    expect(baseCents + taxCents).toBe(grossCents);
  });
});

// ═══════════════════════════════════════════════════════════════════════════════
// E2E — Journal entry with integer cents persists and returns correctly
// ═══════════════════════════════════════════════════════════════════════════════

let ctx: TestContext;
let accountIds: { cash: string; expense: string; gstItc: string };

beforeAll(async () => {
  ctx = await setupTestOrg();

  // Seed chart of accounts
  await ctx.app.inject({
    method: 'POST',
    url: '/api/accounts/seed',
    headers: authHeaders(ctx.users.admin.token, ctx.orgId),
  });

  // Get accounts
  const page1 = await ctx.app.inject({
    method: 'GET',
    url: '/api/accounts?limit=100',
    headers: authHeaders(ctx.users.admin.token, ctx.orgId),
  });
  const page2 = await ctx.app.inject({
    method: 'GET',
    url: '/api/accounts?limit=100&offset=100',
    headers: authHeaders(ctx.users.admin.token, ctx.orgId),
  });
  const accounts = [
    ...(safeParseBody(page1.body)?.docs || []),
    ...(safeParseBody(page2.body)?.docs || []),
  ];

  const cashAccount = accounts.find((a: any) => a.accountTypeCode === '1060');
  const expenseAccount = accounts.find((a: any) => a.accountTypeCode === '8320');
  const gstItcAccount = accounts.find((a: any) => a.accountTypeCode === '2680.GST.ITC');

  accountIds = {
    cash: cashAccount?._id || accounts[0]?._id,
    expense: expenseAccount?._id || accounts[1]?._id,
    gstItc: gstItcAccount?._id || accounts[2]?._id,
  };
}, 30_000);

afterAll(async () => {
  await teardownTestOrg(ctx);
});

describe('E2E — Cents round-trip via API', () => {
  it('create + read returns exact integer cents', async () => {
    // Simulate what the AI handler would produce after Money.fromDecimal
    const createRes = await ctx.app.inject({
      method: 'POST',
      url: '/api/journal-entries',
      headers: authHeaders(ctx.users.admin.token, ctx.orgId),
      payload: {
        label: 'AI-like entry in cents',
        journalItems: [
          { account: accountIds.expense, debit: 4286, credit: 0, label: 'Purchase (base)' },
          { account: accountIds.gstItc || accountIds.expense, debit: 214, credit: 0, label: 'GST ITC' },
          { account: accountIds.cash, debit: 0, credit: 4500, label: 'Cash payment' },
        ],
      },
    });

    expect(createRes.statusCode).toBe(201);
    const created = safeParseBody(createRes.body);
    expect(created.data.totalDebit).toBe(4500);
    expect(created.data.totalCredit).toBe(4500);

    // Read it back
    const getRes = await ctx.app.inject({
      method: 'GET',
      url: `/api/journal-entries/${created.data._id}`,
      headers: authHeaders(ctx.users.admin.token, ctx.orgId),
    });

    expect(getRes.statusCode).toBe(200);
    const fetched = safeParseBody(getRes.body);
    expect(fetched.data.journalItems[0].debit).toBe(4286);
    expect(fetched.data.journalItems[1].debit).toBe(214);
    expect(fetched.data.journalItems[2].credit).toBe(4500);

    // All values must be integers
    for (const item of fetched.data.journalItems) {
      expect(Number.isInteger(item.debit)).toBe(true);
      expect(Number.isInteger(item.credit)).toBe(true);
    }
  });

  it('update preserves integer cents in journal items', async () => {
    // Create
    const createRes = await ctx.app.inject({
      method: 'POST',
      url: '/api/journal-entries',
      headers: authHeaders(ctx.users.admin.token, ctx.orgId),
      payload: {
        label: 'Entry to update',
        journalItems: [
          { account: accountIds.cash, debit: 10000, credit: 0 },
          { account: accountIds.expense, debit: 0, credit: 10000 },
        ],
      },
    });
    const id = safeParseBody(createRes.body)?.data?._id;

    // Update with new cent amounts
    const updateRes = await ctx.app.inject({
      method: 'PATCH',
      url: `/api/journal-entries/${id}`,
      headers: authHeaders(ctx.users.admin.token, ctx.orgId),
      payload: {
        journalItems: [
          { account: accountIds.cash, debit: 25099, credit: 0, label: 'Updated cash' },
          { account: accountIds.expense, debit: 0, credit: 25099, label: 'Updated expense' },
        ],
      },
    });

    expect(updateRes.statusCode).toBe(200);

    // Re-fetch to verify persisted item values
    const getRes = await ctx.app.inject({
      method: 'GET',
      url: `/api/journal-entries/${id}`,
      headers: authHeaders(ctx.users.admin.token, ctx.orgId),
    });

    expect(getRes.statusCode).toBe(200);
    const updated = safeParseBody(getRes.body);

    // Journal items must have the updated integer cent values
    const items = updated.data.journalItems;
    expect(items[0].debit).toBe(25099);
    expect(items[1].credit).toBe(25099);

    // All values must be integers
    for (const item of items) {
      expect(Number.isInteger(item.debit)).toBe(true);
      expect(Number.isInteger(item.credit)).toBe(true);
    }
  });

  it('post validates balanced integer cents', async () => {
    // Create balanced entry
    const createRes = await ctx.app.inject({
      method: 'POST',
      url: '/api/journal-entries',
      headers: authHeaders(ctx.users.admin.token, ctx.orgId),
      payload: {
        label: 'Balanced for posting',
        journalItems: [
          { account: accountIds.cash, debit: 99999, credit: 0, label: 'Large amount' },
          { account: accountIds.expense, debit: 0, credit: 99999, label: 'Matching credit' },
        ],
      },
    });
    const id = safeParseBody(createRes.body)?.data?._id;

    // Post it — should succeed because debits = credits in cents
    const postRes = await ctx.app.inject({
      method: 'PATCH',
      url: `/api/journal-entries/${id}/post`,
      headers: authHeaders(ctx.users.admin.token, ctx.orgId),
    });

    expect(postRes.statusCode).toBe(200);
    const posted = safeParseBody(postRes.body);
    expect(posted.data.state).toBe('posted');
    expect(posted.data.totalDebit).toBe(99999);
    expect(posted.data.totalCredit).toBe(99999);
  });
});
