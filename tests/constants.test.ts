/**
 * Accounting Constants Routes Tests
 *
 * Tests:
 *   GET /api/account-types          — List GIFI account types
 *   GET /api/account-types/:code    — Single account type lookup
 *   GET /api/journal-types          — List journal types
 *   GET /api/journal-types/:code    — Single journal type lookup
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

beforeAll(async () => {
  ctx = await setupTestOrg();
}, 30_000);

afterAll(async () => {
  await teardownTestOrg(ctx);
});

// ═══════════════════════════════════════════════════════════════════════════════
// Account Types
// ═══════════════════════════════════════════════════════════════════════════════

describe('Account Types — GET /api/account-types', () => {
  it('unauthenticated user cannot list account types', async () => {
    const res = await ctx.app.inject({
      method: 'GET',
      url: '/api/account-types',
    });
    expect(res.statusCode).toBeGreaterThanOrEqual(400);
  });

  it('authenticated user can list all account types', async () => {
    const res = await ctx.app.inject({
      method: 'GET',
      url: '/api/account-types',
      headers: authHeaders(ctx.users.admin.token, ctx.orgId),
    });

    expect(res.statusCode).toBe(200);
    const body = safeParseBody(res.body);
    expect(body.success).toBe(true);
    expect(body.results).toBeGreaterThan(0);
    expect(body.data).toBeInstanceOf(Array);
    expect(body.data[0]).toHaveProperty('code');
    expect(body.data[0]).toHaveProperty('name');
    expect(body.data[0]).toHaveProperty('category');
  });

  it('filters by search term', async () => {
    const res = await ctx.app.inject({
      method: 'GET',
      url: '/api/account-types?search=cash',
      headers: authHeaders(ctx.users.admin.token, ctx.orgId),
    });

    expect(res.statusCode).toBe(200);
    const body = safeParseBody(res.body);
    expect(body.success).toBe(true);
    // Every result should contain "cash" in code or name
    for (const at of body.data) {
      const match =
        at.code.toLowerCase().includes('cash') ||
        at.name.toLowerCase().includes('cash');
      expect(match).toBe(true);
    }
  });

  it('filters by mainType', async () => {
    const res = await ctx.app.inject({
      method: 'GET',
      url: '/api/account-types?mainType=Asset',
      headers: authHeaders(ctx.users.admin.token, ctx.orgId),
    });

    expect(res.statusCode).toBe(200);
    const body = safeParseBody(res.body);
    expect(body.success).toBe(true);
    expect(body.results).toBeGreaterThan(0);
    for (const at of body.data) {
      expect(at.category).toContain('-Asset');
    }
  });

  it('member can also list account types', async () => {
    const res = await ctx.app.inject({
      method: 'GET',
      url: '/api/account-types',
      headers: authHeaders(ctx.users.member.token, ctx.orgId),
    });
    expect(res.statusCode).toBe(200);
  });
});

describe('Account Type Lookup — GET /api/account-types/:code', () => {
  it('returns account type for valid GIFI code', async () => {
    const res = await ctx.app.inject({
      method: 'GET',
      url: '/api/account-types/1000',
      headers: authHeaders(ctx.users.admin.token, ctx.orgId),
    });

    expect(res.statusCode).toBe(200);
    const body = safeParseBody(res.body);
    expect(body.success).toBe(true);
    expect(body.data.code).toBe('1000');
    expect(body.data.name).toBeTruthy();
  });

  it('returns 404 for invalid code', async () => {
    const res = await ctx.app.inject({
      method: 'GET',
      url: '/api/account-types/9999',
      headers: authHeaders(ctx.users.admin.token, ctx.orgId),
    });

    expect(res.statusCode).toBe(404);
    const body = safeParseBody(res.body);
    expect(body.error).toContain('9999');
  });
});

// ═══════════════════════════════════════════════════════════════════════════════
// Journal Types
// ═══════════════════════════════════════════════════════════════════════════════

describe('Journal Types — GET /api/journal-types', () => {
  it('unauthenticated user cannot list journal types', async () => {
    const res = await ctx.app.inject({
      method: 'GET',
      url: '/api/journal-types',
    });
    expect(res.statusCode).toBeGreaterThanOrEqual(400);
  });

  it('authenticated user can list all journal types', async () => {
    const res = await ctx.app.inject({
      method: 'GET',
      url: '/api/journal-types',
      headers: authHeaders(ctx.users.admin.token, ctx.orgId),
    });

    expect(res.statusCode).toBe(200);
    const body = safeParseBody(res.body);
    expect(body.success).toBe(true);
    expect(body.results).toBeGreaterThan(0);
    expect(body.data).toBeInstanceOf(Array);
    expect(body.data[0]).toHaveProperty('code');
    expect(body.data[0]).toHaveProperty('name');
  });
});

describe('Journal Type Lookup — GET /api/journal-types/:code', () => {
  it('returns journal type for valid code', async () => {
    const res = await ctx.app.inject({
      method: 'GET',
      url: '/api/journal-types/GENERAL',
      headers: authHeaders(ctx.users.admin.token, ctx.orgId),
    });

    expect(res.statusCode).toBe(200);
    const body = safeParseBody(res.body);
    expect(body.success).toBe(true);
    expect(body.data.code).toBe('GENERAL');
  });

  it('returns 404 for invalid journal type code', async () => {
    const res = await ctx.app.inject({
      method: 'GET',
      url: '/api/journal-types/NONEXISTENT',
      headers: authHeaders(ctx.users.admin.token, ctx.orgId),
    });

    expect(res.statusCode).toBe(404);
    const body = safeParseBody(res.body);
    expect(body.error).toContain('NONEXISTENT');
  });
});
