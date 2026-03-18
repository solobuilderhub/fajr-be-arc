/**
 * Journal Entry CRUD + Action Tests
 *
 * Tests journal entry resource operations, RBAC, and post/reverse actions.
 */

import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { setupTestOrg, teardownTestOrg, authHeaders, safeParseBody, type TestContext } from './helpers/setup.js';

let ctx: TestContext;
let accountIds: { cash: string; revenue: string };

beforeAll(async () => {
  ctx = await setupTestOrg();

  // Seed chart of accounts first
  await ctx.app.inject({
    method: 'POST',
    url: '/api/accounts/seed',
    headers: authHeaders(ctx.users.admin.token, ctx.orgId),
  });

  // Find two accounts to use in journal entries (cash + revenue)
  // Paginate to get all accounts (maxLimit=100)
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

  // Find a cash account (1060) and a revenue account (8000)
  const cashAccount = accounts.find((a: any) => a.accountTypeCode === '1060');
  const revenueAccount = accounts.find((a: any) => a.accountTypeCode === '8000');

  // Fallback: pick any two distinct posting accounts
  accountIds = {
    cash: cashAccount?._id || accounts[0]?._id,
    revenue: revenueAccount?._id || accounts[1]?._id,
  };
}, 30_000);

afterAll(async () => {
  await teardownTestOrg(ctx);
});

describe('Journal Entry CRUD', () => {
  let entryId: string;

  // ── Create ──────────────────────────────────────────────────────────────────

  it('admin can create a draft journal entry', async () => {
    const res = await ctx.app.inject({
      method: 'POST',
      url: '/api/journal-entries',
      headers: authHeaders(ctx.users.admin.token, ctx.orgId),
      payload: {
        label: 'Test Revenue Entry',
        journalItems: [
          { account: accountIds.cash, debit: 10000, credit: 0, label: 'Cash received' },
          { account: accountIds.revenue, debit: 0, credit: 10000, label: 'Revenue earned' },
        ],
      },
    });

    expect(res.statusCode).toBe(201);
    const body = safeParseBody(res.body);
    expect(body.data).toBeTruthy();
    expect(body.data.label).toBe('Test Revenue Entry');
    expect(body.data.state).toBe('draft');
    entryId = body.data._id;
  });

  it('member cannot create a journal entry', async () => {
    const res = await ctx.app.inject({
      method: 'POST',
      url: '/api/journal-entries',
      headers: authHeaders(ctx.users.member.token, ctx.orgId),
      payload: {
        label: 'Should Not Create',
        journalItems: [
          { account: accountIds.cash, debit: 5000, credit: 0 },
          { account: accountIds.revenue, debit: 0, credit: 5000 },
        ],
      },
    });

    expect(res.statusCode).toBeGreaterThanOrEqual(403);
  });

  // ── List ────────────────────────────────────────────────────────────────────

  it('admin can list journal entries', async () => {
    const res = await ctx.app.inject({
      method: 'GET',
      url: '/api/journal-entries',
      headers: authHeaders(ctx.users.admin.token, ctx.orgId),
    });

    expect(res.statusCode).toBe(200);
    const body = safeParseBody(res.body);
    expect(body.docs).toBeTruthy();
    expect(body.docs.length).toBeGreaterThanOrEqual(1);
  });

  // ── Get Single ──────────────────────────────────────────────────────────────

  it('admin can get a single journal entry', async () => {
    const res = await ctx.app.inject({
      method: 'GET',
      url: `/api/journal-entries/${entryId}`,
      headers: authHeaders(ctx.users.admin.token, ctx.orgId),
    });

    expect(res.statusCode).toBe(200);
    const body = safeParseBody(res.body);
    expect(body.data._id).toBe(entryId);
  });

  // ── Post Action ─────────────────────────────────────────────────────────────

  it('admin can post a draft journal entry', async () => {
    const res = await ctx.app.inject({
      method: 'PATCH',
      url: `/api/journal-entries/${entryId}/post`,
      headers: authHeaders(ctx.users.admin.token, ctx.orgId),
    });

    expect(res.statusCode).toBe(200);
    const body = safeParseBody(res.body);
    expect(body.success).toBe(true);
    expect(body.data.state).toBe('posted');
  });

  it('posted entry cannot be posted again', async () => {
    const res = await ctx.app.inject({
      method: 'PATCH',
      url: `/api/journal-entries/${entryId}/post`,
      headers: authHeaders(ctx.users.admin.token, ctx.orgId),
    });

    // Should fail since it's already posted
    expect(res.statusCode).toBeGreaterThanOrEqual(400);
  });

  // ── Reverse Action ──────────────────────────────────────────────────────────

  it('admin can reverse a posted journal entry', async () => {
    const res = await ctx.app.inject({
      method: 'PATCH',
      url: `/api/journal-entries/${entryId}/reverse`,
      headers: authHeaders(ctx.users.admin.token, ctx.orgId),
    });

    expect(res.statusCode).toBe(200);
    const body = safeParseBody(res.body);
    expect(body.success).toBe(true);
  });

  // ── Cents Validation ─────────────────────────────────────────────────────

  it('rejects non-integer (fractional) debit/credit values', async () => {
    const res = await ctx.app.inject({
      method: 'POST',
      url: '/api/journal-entries',
      headers: authHeaders(ctx.users.admin.token, ctx.orgId),
      payload: {
        label: 'Fractional cents should fail',
        journalItems: [
          { account: accountIds.cash, debit: 100.50, credit: 0, label: 'Bad debit' },
          { account: accountIds.revenue, debit: 0, credit: 100.50, label: 'Bad credit' },
        ],
      },
    });

    expect(res.statusCode).toBeGreaterThanOrEqual(400);
  });

  it('accepts integer cents for debit/credit', async () => {
    const res = await ctx.app.inject({
      method: 'POST',
      url: '/api/journal-entries',
      headers: authHeaders(ctx.users.admin.token, ctx.orgId),
      payload: {
        label: 'Integer cents entry',
        journalItems: [
          { account: accountIds.cash, debit: 15099, credit: 0, label: 'Cash in' },
          { account: accountIds.revenue, debit: 0, credit: 15099, label: 'Revenue' },
        ],
      },
    });

    expect(res.statusCode).toBe(201);
    const body = safeParseBody(res.body);
    expect(body.data.journalItems[0].debit).toBe(15099);
    expect(body.data.journalItems[1].credit).toBe(15099);
    expect(body.data.totalDebit).toBe(15099);
    expect(body.data.totalCredit).toBe(15099);
  });

  it('rejects negative debit/credit values', async () => {
    const res = await ctx.app.inject({
      method: 'POST',
      url: '/api/journal-entries',
      headers: authHeaders(ctx.users.admin.token, ctx.orgId),
      payload: {
        label: 'Negative values should fail',
        journalItems: [
          { account: accountIds.cash, debit: -5000, credit: 0 },
          { account: accountIds.revenue, debit: 0, credit: 5000 },
        ],
      },
    });

    expect(res.statusCode).toBeGreaterThanOrEqual(400);
  });

  it('update with fractional cents is rejected', async () => {
    // Create a valid draft first
    const createRes = await ctx.app.inject({
      method: 'POST',
      url: '/api/journal-entries',
      headers: authHeaders(ctx.users.admin.token, ctx.orgId),
      payload: {
        label: 'Will update with bad data',
        journalItems: [
          { account: accountIds.cash, debit: 5000, credit: 0 },
          { account: accountIds.revenue, debit: 0, credit: 5000 },
        ],
      },
    });
    const draftId = safeParseBody(createRes.body)?.data?._id;

    // Try to PATCH with fractional cents
    const res = await ctx.app.inject({
      method: 'PATCH',
      url: `/api/journal-entries/${draftId}`,
      headers: authHeaders(ctx.users.admin.token, ctx.orgId),
      payload: {
        journalItems: [
          { account: accountIds.cash, debit: 42.857, credit: 0 },
          { account: accountIds.revenue, debit: 0, credit: 42.857 },
        ],
      },
    });

    expect(res.statusCode).toBeGreaterThanOrEqual(400);
  });

  it('member cannot post a journal entry', async () => {
    // Create another draft first
    const createRes = await ctx.app.inject({
      method: 'POST',
      url: '/api/journal-entries',
      headers: authHeaders(ctx.users.admin.token, ctx.orgId),
      payload: {
        label: 'Draft for member post test',
        journalItems: [
          { account: accountIds.cash, debit: 2000, credit: 0 },
          { account: accountIds.revenue, debit: 0, credit: 2000 },
        ],
      },
    });
    const draftId = safeParseBody(createRes.body)?.data?._id;

    const res = await ctx.app.inject({
      method: 'PATCH',
      url: `/api/journal-entries/${draftId}/post`,
      headers: authHeaders(ctx.users.member.token, ctx.orgId),
    });

    expect(res.statusCode).toBeGreaterThanOrEqual(403);
  });
});
