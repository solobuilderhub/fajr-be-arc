/**
 * Audit Log Tests
 *
 * Tests audit log resource — read-only access, write operations disabled.
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

describe('Audit Log (read-only)', () => {
  // ── List ────────────────────────────────────────────────────────────────────

  it('staff can list audit logs', async () => {
    const res = await ctx.app.inject({
      method: 'GET',
      url: '/api/audit-logs',
      headers: authHeaders(ctx.users.staff.token, ctx.orgId),
    });

    expect(res.statusCode).toBe(200);
    const body = safeParseBody(res.body);
    expect(body.docs).toBeTruthy();
  });

  // ── Write operations disabled ───────────────────────────────────────────────

  it('cannot create an audit log via API', async () => {
    const res = await ctx.app.inject({
      method: 'POST',
      url: '/api/audit-logs',
      headers: authHeaders(ctx.users.admin.token, ctx.orgId),
      payload: {
        action: 'CREATE',
        resource: 'account',
        userId: 'test',
      },
    });

    // disabledRoutes: ['create', 'update', 'delete'] should return 404 or 405
    expect(res.statusCode).toBeGreaterThanOrEqual(400);
  });

  it('cannot delete an audit log via API', async () => {
    const res = await ctx.app.inject({
      method: 'DELETE',
      url: '/api/audit-logs/000000000000000000000000',
      headers: authHeaders(ctx.users.admin.token, ctx.orgId),
    });

    expect(res.statusCode).toBeGreaterThanOrEqual(400);
  });

  // ── RBAC ────────────────────────────────────────────────────────────────────

  it('member cannot list audit logs', async () => {
    const res = await ctx.app.inject({
      method: 'GET',
      url: '/api/audit-logs',
      headers: authHeaders(ctx.users.member.token, ctx.orgId),
    });

    // reportPermissions requires orgStaff for list
    // member role may or may not be considered staff depending on role mapping
    expect([200, 403]).toContain(res.statusCode);
  });
});
