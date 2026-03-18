/**
 * COR Parsing & COR-to-Journal Workflow Tests
 *
 * Tests:
 *   POST /api/cor/parse              — Upload & parse COR file
 *   POST /api/workflow/cor-to-journal — Import COR data as journal entry
 */

import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import {
  setupTestOrg,
  teardownTestOrg,
  authHeaders,
  safeParseBody,
  type TestContext,
} from './helpers/setup.js';

let ctx: TestContext;

// ── Sample COR content (trimmed from real Algo Clan Inc file) ────────────────
const SAMPLE_COR = `2001
001766163216RC0001
002Algo Clan Inc.
099FT28
1012024.1
06020230313
06120231231
01002
02002
0301
031118 Sanderling Road NW
035Calgary
036AB
037CA
038T3K3S3
0401
284Software development
285100
750AB
950RAHMAN
951MOMOTAJ
954Director
95520240712
9565879889169
9571
9901
0881
089rohan@algoclan.com
100045944
159945944
259945944
349925885
350010
368020049
360020049
362020059
364045944
384920049
800050800
829950800
851950800
936730751
936830751
936920049
EOD`;

beforeAll(async () => {
  ctx = await setupTestOrg();

  // Seed chart of accounts so journal import can find/create accounts
  await ctx.app.inject({
    method: 'POST',
    url: '/api/accounts/seed',
    headers: authHeaders(ctx.users.admin.token, ctx.orgId),
  });
}, 30_000);

afterAll(async () => {
  await teardownTestOrg(ctx);
});

// ═══════════════════════════════════════════════════════════════════════════════
// COR File Parsing
// ═══════════════════════════════════════════════════════════════════════════════

describe('COR File Parsing — POST /api/cor/parse', () => {
  it('unauthenticated user cannot parse COR file', async () => {
    const res = await ctx.app.inject({
      method: 'POST',
      url: '/api/cor/parse',
      // No auth
    });
    expect(res.statusCode).toBeGreaterThanOrEqual(400);
  });

  it('rejects non-.cor file extension', async () => {
    const boundary = '----TestBoundary';
    const payload = [
      `--${boundary}`,
      'Content-Disposition: form-data; name="file"; filename="data.txt"',
      'Content-Type: text/plain',
      '',
      'some text content',
      `--${boundary}--`,
    ].join('\r\n');

    const res = await ctx.app.inject({
      method: 'POST',
      url: '/api/cor/parse',
      headers: {
        ...authHeaders(ctx.users.admin.token, ctx.orgId),
        'content-type': `multipart/form-data; boundary=${boundary}`,
      },
      payload,
    });

    expect(res.statusCode).toBe(400);
    const body = safeParseBody(res.body);
    expect(body.error).toMatch(/\.cor/i);
  });

  it('admin can upload and parse a valid COR file', async () => {
    const boundary = '----TestBoundary';
    const payload = [
      `--${boundary}`,
      'Content-Disposition: form-data; name="file"; filename="algo-clan.cor"',
      'Content-Type: application/octet-stream',
      '',
      SAMPLE_COR,
      `--${boundary}--`,
    ].join('\r\n');

    const res = await ctx.app.inject({
      method: 'POST',
      url: '/api/cor/parse',
      headers: {
        ...authHeaders(ctx.users.admin.token, ctx.orgId),
        'content-type': `multipart/form-data; boundary=${boundary}`,
      },
      payload,
    });

    expect(res.statusCode).toBe(200);
    const body = safeParseBody(res.body);
    expect(body.success).toBe(true);
    expect(body.data).toBeTruthy();

    // Check corporation info
    expect(body.data.corporation.name).toBe('Algo Clan Inc.');
    expect(body.data.corporation.number).toBeTruthy();

    // Check schedules are present
    expect(body.data.schedules).toHaveLength(2);
    expect(body.data.schedules[0].id).toBe(100); // Balance Sheet
    expect(body.data.schedules[1].id).toBe(125); // Income Statement

    // Check accounts exist
    expect(body.data.schedules[0].accounts.length).toBeGreaterThan(0);
  });

  it('staff can parse COR file', async () => {
    const boundary = '----TestBoundary';
    const payload = [
      `--${boundary}`,
      'Content-Disposition: form-data; name="file"; filename="test.cor"',
      'Content-Type: application/octet-stream',
      '',
      SAMPLE_COR,
      `--${boundary}--`,
    ].join('\r\n');

    const res = await ctx.app.inject({
      method: 'POST',
      url: '/api/cor/parse',
      headers: {
        ...authHeaders(ctx.users.staff.token, ctx.orgId),
        'content-type': `multipart/form-data; boundary=${boundary}`,
      },
      payload,
    });

    expect(res.statusCode).toBe(200);
  });
});

// ═══════════════════════════════════════════════════════════════════════════════
// COR-to-Journal Workflow
// ═══════════════════════════════════════════════════════════════════════════════

describe('COR-to-Journal Workflow — POST /api/workflow/cor-to-journal', () => {
  it('unauthenticated user cannot import COR data', async () => {
    const res = await ctx.app.inject({
      method: 'POST',
      url: '/api/workflow/cor-to-journal',
      payload: {
        corporation: { name: 'Test Corp' },
        accounts: [{ gifiCode: '1000', accountName: 'Cash', value: 100, category: 'Assets' }],
      },
    });
    expect(res.statusCode).toBeGreaterThanOrEqual(400);
  });

  it('member cannot import COR data (requires admin/staff)', async () => {
    const res = await ctx.app.inject({
      method: 'POST',
      url: '/api/workflow/cor-to-journal',
      headers: {
        ...authHeaders(ctx.users.member.token, ctx.orgId),
        'content-type': 'application/json',
      },
      payload: {
        corporation: { name: 'Test Corp' },
        accounts: [{ gifiCode: '1000', accountName: 'Cash', value: 100, category: 'Assets' }],
      },
    });
    expect(res.statusCode).toBe(403);
  });

  it('rejects empty accounts array', async () => {
    const res = await ctx.app.inject({
      method: 'POST',
      url: '/api/workflow/cor-to-journal',
      headers: {
        ...authHeaders(ctx.users.admin.token, ctx.orgId),
        'content-type': 'application/json',
      },
      payload: {
        corporation: { name: 'Test Corp' },
        accounts: [],
      },
    });
    expect(res.statusCode).toBe(400);
  });

  it('admin can import COR accounts as a draft journal entry', async () => {
    const res = await ctx.app.inject({
      method: 'POST',
      url: '/api/workflow/cor-to-journal',
      headers: {
        ...authHeaders(ctx.users.admin.token, ctx.orgId),
        'content-type': 'application/json',
      },
      payload: {
        corporation: {
          name: 'Algo Clan Inc.',
          taxYear: 2023,
          fiscalPeriod: { start: '2023-03-13', end: '2023-12-31' },
        },
        entryDate: '2023-12-31',
        description: 'COR Import Test',
        accounts: [
          { gifiCode: '1000', accountName: 'Cash and Deposits', value: 45944, category: 'Assets', isTotal: false },
          { gifiCode: '3600', accountName: 'Retained Earnings', value: 25885, category: 'Equity', isTotal: false },
          { gifiCode: '8000', accountName: 'Sales of Goods', value: 50800, category: 'Income', isTotal: false },
        ],
        options: { skipTotals: true, createMissingAccounts: true, autoPost: false },
      },
    });

    expect(res.statusCode).toBe(201);
    const body = safeParseBody(res.body);
    expect(body.success).toBe(true);
    expect(body.data.journalEntry).toBeTruthy();
    expect(body.data.statistics).toBeTruthy();
    expect(body.data.statistics.journalItemsCreated).toBeGreaterThan(0);

    // Entry should be in draft state
    expect(body.data.journalEntry.state).toBe('draft');
    expect(body.data.journalEntry.label).toBe('COR Import Test');
  });

  it('staff can import COR data', async () => {
    const res = await ctx.app.inject({
      method: 'POST',
      url: '/api/workflow/cor-to-journal',
      headers: {
        ...authHeaders(ctx.users.staff.token, ctx.orgId),
        'content-type': 'application/json',
      },
      payload: {
        corporation: { name: 'Test Corp' },
        accounts: [
          { gifiCode: '1000', accountName: 'Cash', value: 5000, category: 'Assets', isTotal: false },
        ],
        options: { createMissingAccounts: true },
      },
    });

    expect(res.statusCode).toBe(201);
    const body = safeParseBody(res.body);
    expect(body.success).toBe(true);
  });

  it('creates balancing entry to Retained Earnings when debits != credits', async () => {
    const res = await ctx.app.inject({
      method: 'POST',
      url: '/api/workflow/cor-to-journal',
      headers: {
        ...authHeaders(ctx.users.admin.token, ctx.orgId),
        'content-type': 'application/json',
      },
      payload: {
        corporation: { name: 'Unbalanced Corp' },
        accounts: [
          // Only debit-normal accounts → will need balancing credit to Retained Earnings
          { gifiCode: '1000', accountName: 'Cash', value: 10000, category: 'Assets', isTotal: false },
          { gifiCode: '1060', accountName: 'Accounts Receivable', value: 5000, category: 'Assets', isTotal: false },
        ],
        options: { createMissingAccounts: true },
      },
    });

    expect(res.statusCode).toBe(201);
    const body = safeParseBody(res.body);

    // Should have 3 items: 2 accounts + 1 balancing entry
    expect(body.data.statistics.journalItemsCreated).toBe(3);
    expect(body.data.statistics.balanced).toBe(false); // was not originally balanced

    // Find the balancing entry
    const items = body.data.journalEntry.journalItems;
    const balancingItem = items.find((i: any) =>
      i.label?.includes('Retained Earnings'),
    );
    expect(balancingItem).toBeTruthy();
  });

  it('skips total accounts when skipTotals is true', async () => {
    const res = await ctx.app.inject({
      method: 'POST',
      url: '/api/workflow/cor-to-journal',
      headers: {
        ...authHeaders(ctx.users.admin.token, ctx.orgId),
        'content-type': 'application/json',
      },
      payload: {
        corporation: { name: 'Skip Totals Corp' },
        accounts: [
          { gifiCode: '1000', accountName: 'Cash', value: 1000, category: 'Assets', isTotal: false },
          { gifiCode: '1599', accountName: 'Total Current Assets', value: 1000, category: 'Assets', isTotal: true },
        ],
        options: { skipTotals: true, createMissingAccounts: true },
      },
    });

    expect(res.statusCode).toBe(201);
    const body = safeParseBody(res.body);
    expect(body.data.statistics.skipped).toBeGreaterThanOrEqual(1);
    // Only the Cash account should have been imported (+ possible balancing)
    expect(body.data.statistics.created).toBe(1);
  });
});
