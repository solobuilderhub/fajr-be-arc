/**
 * Account CRUD + RBAC Tests
 *
 * Tests Chart of Accounts resource operations and role-based access.
 * Uses valid GIFI account type codes (e.g. 1060=Cash, 8000+=Revenue).
 */

import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { setupTestOrg, teardownTestOrg, authHeaders, safeParseBody, type TestContext } from './helpers/setup.js';

let ctx: TestContext;

beforeAll(async () => {
  ctx = await setupTestOrg();
}, 30_000);

afterAll(async () => {
  await teardownTestOrg(ctx);
});

describe('Account CRUD', () => {
  let accountId: string;

  // ── Seed ────────────────────────────────────────────────────────────────────

  it('admin can seed default chart of accounts', async () => {
    const res = await ctx.app.inject({
      method: 'POST',
      url: '/api/accounts/seed',
      headers: authHeaders(ctx.users.admin.token, ctx.orgId),
    });

    expect(res.statusCode).toBe(201);
    const body = safeParseBody(res.body);
    expect(body.success).toBe(true);
    expect(body.data.created).toBeGreaterThan(0);
  });

  it('member cannot seed chart of accounts', async () => {
    const res = await ctx.app.inject({
      method: 'POST',
      url: '/api/accounts/seed',
      headers: authHeaders(ctx.users.member.token, ctx.orgId),
    });

    expect(res.statusCode).toBeGreaterThanOrEqual(403);
  });

  // ── Create ──────────────────────────────────────────────────────────────────

  it('admin can create an account', async () => {
    const res = await ctx.app.inject({
      method: 'POST',
      url: '/api/accounts',
      headers: authHeaders(ctx.users.admin.token, ctx.orgId),
      payload: {
        accountTypeCode: '1060',
        accountNumber: '1060-TEST',
        name: 'Test Cash Account',
        active: true,
      },
    });

    expect(res.statusCode).toBe(201);
    const body = safeParseBody(res.body);
    expect(body.data).toBeTruthy();
    expect(body.data.name).toBe('Test Cash Account');
    accountId = body.data._id;
  });

  it('staff can create an account', async () => {
    const res = await ctx.app.inject({
      method: 'POST',
      url: '/api/accounts',
      headers: authHeaders(ctx.users.staff.token, ctx.orgId),
      payload: {
        accountTypeCode: '1060',
        accountNumber: '1060-STAFF',
        name: 'Staff Cash Account',
        active: true,
      },
    });

    expect(res.statusCode).toBe(201);
  });

  it('member cannot create an account', async () => {
    const res = await ctx.app.inject({
      method: 'POST',
      url: '/api/accounts',
      headers: authHeaders(ctx.users.member.token, ctx.orgId),
      payload: {
        accountTypeCode: '1060',
        accountNumber: '1060-MEMBER',
        name: 'Should Not Create',
        active: true,
      },
    });

    expect(res.statusCode).toBeGreaterThanOrEqual(403);
  });

  // ── List ────────────────────────────────────────────────────────────────────

  it('staff can list accounts', async () => {
    const res = await ctx.app.inject({
      method: 'GET',
      url: '/api/accounts',
      headers: authHeaders(ctx.users.staff.token, ctx.orgId),
    });

    expect(res.statusCode).toBe(200);
    const body = safeParseBody(res.body);
    expect(body.docs).toBeTruthy();
    expect(body.docs.length).toBeGreaterThanOrEqual(1);
  });

  it('member can list accounts', async () => {
    const res = await ctx.app.inject({
      method: 'GET',
      url: '/api/accounts',
      headers: authHeaders(ctx.users.member.token, ctx.orgId),
    });

    expect(res.statusCode).toBe(200);
    const body = safeParseBody(res.body);
    expect(body.docs.length).toBeGreaterThanOrEqual(1);
  });

  // ── List with high limit ───────────────────────────────────────────────────

  it('respects limit=1000 (returns all seeded accounts)', async () => {
    const res = await ctx.app.inject({
      method: 'GET',
      url: '/api/accounts?limit=1000&page=1',
      headers: authHeaders(ctx.users.staff.token, ctx.orgId),
    });

    expect(res.statusCode).toBe(200);
    const body = safeParseBody(res.body);
    // After seeding, there should be ~196 GIFI posting accounts + 2 manually created
    // The key assertion: limit must NOT be capped at 100 by PaginationEngine
    expect(body.limit).toBe(1000);
    expect(body.docs.length).toBeGreaterThan(100);
    // All accounts returned in a single page (total < 1000)
    expect(body.docs.length).toBe(body.total);
  });

  // ── Get Single ──────────────────────────────────────────────────────────────

  it('admin can get a single account', async () => {
    const res = await ctx.app.inject({
      method: 'GET',
      url: `/api/accounts/${accountId}`,
      headers: authHeaders(ctx.users.admin.token, ctx.orgId),
    });

    expect(res.statusCode).toBe(200);
    const body = safeParseBody(res.body);
    expect(body.data._id).toBe(accountId);
  });

  // ── Update ──────────────────────────────────────────────────────────────────

  it('admin can update an account', async () => {
    const res = await ctx.app.inject({
      method: 'PATCH',
      url: `/api/accounts/${accountId}`,
      headers: authHeaders(ctx.users.admin.token, ctx.orgId),
      payload: {
        name: 'Updated Test Account',
      },
    });

    expect(res.statusCode).toBe(200);
    const body = safeParseBody(res.body);
    expect(body.data.name).toBe('Updated Test Account');
  });

  // ── Enable/Disable ─────────────────────────────────────────────────────────

  it('admin can disable an account', async () => {
    const res = await ctx.app.inject({
      method: 'PATCH',
      url: `/api/accounts/${accountId}/disable`,
      headers: authHeaders(ctx.users.admin.token, ctx.orgId),
    });

    expect(res.statusCode).toBe(200);
    const body = safeParseBody(res.body);
    expect(body.success).toBe(true);
    expect(body.data.active).toBe(false);
  });

  it('admin can enable an account', async () => {
    const res = await ctx.app.inject({
      method: 'PATCH',
      url: `/api/accounts/${accountId}/enable`,
      headers: authHeaders(ctx.users.admin.token, ctx.orgId),
    });

    expect(res.statusCode).toBe(200);
    const body = safeParseBody(res.body);
    expect(body.success).toBe(true);
    expect(body.data.active).toBe(true);
  });

  // ── Bulk Create ─────────────────────────────────────────────────────────────

  it('admin can bulk create accounts', async () => {
    const res = await ctx.app.inject({
      method: 'POST',
      url: '/api/accounts/bulk',
      headers: authHeaders(ctx.users.admin.token, ctx.orgId),
      payload: {
        accounts: [
          { accountTypeCode: '1060', accountNumber: '1060-BULK1', name: 'Bulk Cash 1' },
          { accountTypeCode: '1060', accountNumber: '1060-BULK2', name: 'Bulk Cash 2' },
        ],
      },
    });

    expect(res.statusCode).toBeLessThanOrEqual(201);
    const body = safeParseBody(res.body);
    expect(body.success).toBe(true);
  });

  // ── Delete ──────────────────────────────────────────────────────────────────

  it('member cannot delete an account', async () => {
    const res = await ctx.app.inject({
      method: 'DELETE',
      url: `/api/accounts/${accountId}`,
      headers: authHeaders(ctx.users.member.token, ctx.orgId),
    });

    expect(res.statusCode).toBeGreaterThanOrEqual(403);
  });

  it('admin can delete an account', async () => {
    const res = await ctx.app.inject({
      method: 'DELETE',
      url: `/api/accounts/${accountId}`,
      headers: authHeaders(ctx.users.admin.token, ctx.orgId),
    });

    expect(res.statusCode).toBe(200);
  });
});
