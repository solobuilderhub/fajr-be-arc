/**
 * Financial Reports Tests
 *
 * Tests report endpoints with seeded data.
 */

import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { setupTestOrg, teardownTestOrg, authHeaders, safeParseBody, type TestContext } from './helpers/setup.js';

let ctx: TestContext;

beforeAll(async () => {
  ctx = await setupTestOrg();

  // Seed chart of accounts
  await ctx.app.inject({
    method: 'POST',
    url: '/api/accounts/seed',
    headers: authHeaders(ctx.users.admin.token, ctx.orgId),
  });
}, 30_000);

afterAll(async () => {
  await teardownTestOrg(ctx);
});

describe('Financial Reports', () => {
  // ── Trial Balance ──────────────────────────────────────────────────────────

  it('admin can get trial balance', async () => {
    const res = await ctx.app.inject({
      method: 'GET',
      url: '/api/reports/trial-balance',
      headers: authHeaders(ctx.users.admin.token, ctx.orgId),
    });

    expect(res.statusCode).toBe(200);
    const body = safeParseBody(res.body);
    expect(body.success).toBe(true);
    expect(body.data).toBeTruthy();
  });

  it('staff can get trial balance', async () => {
    const res = await ctx.app.inject({
      method: 'GET',
      url: '/api/reports/trial-balance',
      headers: authHeaders(ctx.users.staff.token, ctx.orgId),
    });

    expect(res.statusCode).toBe(200);
  });

  // ── Balance Sheet ──────────────────────────────────────────────────────────

  it('admin can get balance sheet', async () => {
    const res = await ctx.app.inject({
      method: 'GET',
      url: '/api/reports/balance-sheet',
      headers: authHeaders(ctx.users.admin.token, ctx.orgId),
    });

    expect(res.statusCode).toBe(200);
    const body = safeParseBody(res.body);
    expect(body.success).toBe(true);
  });

  // ── Income Statement ───────────────────────────────────────────────────────

  it('admin can get income statement', async () => {
    const res = await ctx.app.inject({
      method: 'GET',
      url: '/api/reports/income-statement',
      headers: authHeaders(ctx.users.admin.token, ctx.orgId),
    });

    expect(res.statusCode).toBe(200);
    const body = safeParseBody(res.body);
    expect(body.success).toBe(true);
  });

  // ── General Ledger ─────────────────────────────────────────────────────────

  it('admin can get general ledger', async () => {
    const res = await ctx.app.inject({
      method: 'GET',
      url: '/api/reports/general-ledger',
      headers: authHeaders(ctx.users.admin.token, ctx.orgId),
    });

    expect(res.statusCode).toBe(200);
    const body = safeParseBody(res.body);
    expect(body.success).toBe(true);
  });

  // ── Cash Flow ──────────────────────────────────────────────────────────────

  it('admin can get cash flow', async () => {
    const res = await ctx.app.inject({
      method: 'GET',
      url: '/api/reports/cash-flow',
      headers: authHeaders(ctx.users.admin.token, ctx.orgId),
    });

    expect(res.statusCode).toBe(200);
    const body = safeParseBody(res.body);
    expect(body.success).toBe(true);
  });

  // ── Date Options ───────────────────────────────────────────────────────────

  it('trial balance supports custom date range', async () => {
    const res = await ctx.app.inject({
      method: 'GET',
      url: '/api/reports/trial-balance?dateOption=custom&startDate=2025-01-01&endDate=2025-12-31',
      headers: authHeaders(ctx.users.admin.token, ctx.orgId),
    });

    expect(res.statusCode).toBe(200);
  });

  it('trial balance supports month filter', async () => {
    const res = await ctx.app.inject({
      method: 'GET',
      url: '/api/reports/trial-balance?dateOption=month&month=2025-03',
      headers: authHeaders(ctx.users.admin.token, ctx.orgId),
    });

    expect(res.statusCode).toBe(200);
  });

  // ── No org context ─────────────────────────────────────────────────────────

  it('unauthenticated user cannot access reports', async () => {
    const res = await ctx.app.inject({
      method: 'GET',
      url: '/api/reports/trial-balance',
      // No auth token at all
    });

    expect(res.statusCode).toBeGreaterThanOrEqual(400);
  });
});

describe('Tax Reports', () => {
  it('admin can get GST/HST return', async () => {
    const res = await ctx.app.inject({
      method: 'GET',
      url: '/api/tax-reports/gst-hst?startDate=2025-01-01&endDate=2025-03-31',
      headers: authHeaders(ctx.users.admin.token, ctx.orgId),
    });

    expect(res.statusCode).toBe(200);
    const body = safeParseBody(res.body);
    expect(body.success).toBe(true);
    expect(body.data.period).toBeTruthy();
    expect(body.data.craLines).toBeTruthy();
    expect(body.data.summary).toBeTruthy();
  });

  it('GST/HST return requires date params', async () => {
    const res = await ctx.app.inject({
      method: 'GET',
      url: '/api/tax-reports/gst-hst',
      headers: authHeaders(ctx.users.admin.token, ctx.orgId),
    });

    expect(res.statusCode).toBe(400);
  });

  it('admin can get tax payable breakdown', async () => {
    const res = await ctx.app.inject({
      method: 'GET',
      url: '/api/tax-reports/tax-breakdown',
      headers: authHeaders(ctx.users.admin.token, ctx.orgId),
    });

    expect(res.statusCode).toBe(200);
    const body = safeParseBody(res.body);
    expect(body.success).toBe(true);
    expect(body.data.breakdown).toBeTruthy();
  });
});
