/**
 * Fiscal Period CRUD + Action Tests
 *
 * Tests fiscal period resource operations, RBAC, and close/reopen actions.
 */

import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { setupTestOrg, teardownTestOrg, authHeaders, safeParseBody, type TestContext } from './helpers/setup.js';

let ctx: TestContext;

beforeAll(async () => {
  ctx = await setupTestOrg();

  // Seed accounts (needed for fiscal period close which may create closing entries)
  await ctx.app.inject({
    method: 'POST',
    url: '/api/accounts/seed',
    headers: authHeaders(ctx.users.admin.token, ctx.orgId),
  });
}, 30_000);

afterAll(async () => {
  await teardownTestOrg(ctx);
});

describe('Fiscal Period CRUD', () => {
  let periodId: string;

  // ── Create ──────────────────────────────────────────────────────────────────

  it('admin can create a fiscal period', async () => {
    const res = await ctx.app.inject({
      method: 'POST',
      url: '/api/fiscal-periods',
      headers: authHeaders(ctx.users.admin.token, ctx.orgId),
      payload: {
        name: 'Q1 2025',
        startDate: '2025-01-01',
        endDate: '2025-03-31',
      },
    });

    expect(res.statusCode).toBe(201);
    const body = safeParseBody(res.body);
    expect(body.data).toBeTruthy();
    expect(body.data.name).toBe('Q1 2025');
    expect(body.data.closed).toBe(false);
    periodId = body.data._id;
  });

  it('staff cannot create a fiscal period', async () => {
    const res = await ctx.app.inject({
      method: 'POST',
      url: '/api/fiscal-periods',
      headers: authHeaders(ctx.users.staff.token, ctx.orgId),
      payload: {
        name: 'Q2 2025',
        startDate: '2025-04-01',
        endDate: '2025-06-30',
      },
    });

    // fiscalPeriodPermissions requires owner for create
    expect(res.statusCode).toBeGreaterThanOrEqual(403);
  });

  it('member cannot create a fiscal period', async () => {
    const res = await ctx.app.inject({
      method: 'POST',
      url: '/api/fiscal-periods',
      headers: authHeaders(ctx.users.member.token, ctx.orgId),
      payload: {
        name: 'Q3 2025',
        startDate: '2025-07-01',
        endDate: '2025-09-30',
      },
    });

    expect(res.statusCode).toBeGreaterThanOrEqual(403);
  });

  // ── List ────────────────────────────────────────────────────────────────────

  it('staff can list fiscal periods', async () => {
    const res = await ctx.app.inject({
      method: 'GET',
      url: '/api/fiscal-periods',
      headers: authHeaders(ctx.users.staff.token, ctx.orgId),
    });

    expect(res.statusCode).toBe(200);
    const body = safeParseBody(res.body);
    expect(body.docs).toBeTruthy();
    expect(body.docs.length).toBeGreaterThanOrEqual(1);
  });

  // ── Get Single ──────────────────────────────────────────────────────────────

  it('admin can get a single fiscal period', async () => {
    const res = await ctx.app.inject({
      method: 'GET',
      url: `/api/fiscal-periods/${periodId}`,
      headers: authHeaders(ctx.users.admin.token, ctx.orgId),
    });

    expect(res.statusCode).toBe(200);
    const body = safeParseBody(res.body);
    expect(body.data._id).toBe(periodId);
  });

  // ── Close Action ────────────────────────────────────────────────────────────

  it('admin can close a fiscal period', async () => {
    const res = await ctx.app.inject({
      method: 'PATCH',
      url: `/api/fiscal-periods/${periodId}/close`,
      headers: authHeaders(ctx.users.admin.token, ctx.orgId),
    });

    expect(res.statusCode).toBe(200);
    const body = safeParseBody(res.body);
    expect(body.success).toBe(true);
  });

  it('staff cannot close a fiscal period', async () => {
    // Create another period to test staff close
    const createRes = await ctx.app.inject({
      method: 'POST',
      url: '/api/fiscal-periods',
      headers: authHeaders(ctx.users.admin.token, ctx.orgId),
      payload: {
        name: 'Q2 2025',
        startDate: '2025-04-01',
        endDate: '2025-06-30',
      },
    });
    const newPeriodId = safeParseBody(createRes.body)?.data?._id;

    const res = await ctx.app.inject({
      method: 'PATCH',
      url: `/api/fiscal-periods/${newPeriodId}/close`,
      headers: authHeaders(ctx.users.staff.token, ctx.orgId),
    });

    expect(res.statusCode).toBeGreaterThanOrEqual(403);
  });

  // ── Reopen Action ──────────────────────────────────────────────────────────

  it('admin can reopen a closed fiscal period', async () => {
    const res = await ctx.app.inject({
      method: 'PATCH',
      url: `/api/fiscal-periods/${periodId}/reopen`,
      headers: authHeaders(ctx.users.admin.token, ctx.orgId),
    });

    expect(res.statusCode).toBe(200);
    const body = safeParseBody(res.body);
    expect(body.success).toBe(true);
  });

  // ── Delete (denied for all) ─────────────────────────────────────────────────

  it('no one can delete a fiscal period', async () => {
    const res = await ctx.app.inject({
      method: 'DELETE',
      url: `/api/fiscal-periods/${periodId}`,
      headers: authHeaders(ctx.users.admin.token, ctx.orgId),
    });

    // fiscalPeriodPermissions uses denyAll() for delete
    expect(res.statusCode).toBeGreaterThanOrEqual(403);
  });
});
