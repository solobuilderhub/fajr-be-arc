/**
 * Org Profile (Business) Resource Tests
 *
 * Tests the /api/business endpoints — org-profile CRUD with singleton-per-org behavior.
 * Verifies that POST creates-or-returns, LIST returns the profile for the active org,
 * and PATCH updates it.
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

describe('Org Profile — POST /api/business (getOrCreate)', () => {
  let profileId: string;

  it('admin can create an org profile', async () => {
    const res = await ctx.app.inject({
      method: 'POST',
      url: '/api/business',
      headers: authHeaders(ctx.users.admin.token, ctx.orgId),
      payload: {
        name: 'Test Business Inc.',
        country: 'Canada',
        currency: 'CAD',
        region: 'Alberta',
      },
    });

    expect(res.statusCode).toBe(201);
    const body = safeParseBody(res.body);
    expect(body.data).toBeTruthy();
    expect(body.data.name).toBe('Test Business Inc.');
    expect(body.data.currency).toBe('CAD');
    expect(body.data.country).toBe('Canada');
    expect(body.data.organizationId).toBeTruthy();
    profileId = body.data._id;
  });

  it('second POST returns the same profile (singleton)', async () => {
    const res = await ctx.app.inject({
      method: 'POST',
      url: '/api/business',
      headers: authHeaders(ctx.users.admin.token, ctx.orgId),
      payload: {
        name: 'Should Not Create Another',
        country: 'USA',
        currency: 'USD',
      },
    });

    expect(res.statusCode).toBe(201);
    const body = safeParseBody(res.body);
    // Should be the SAME document — getOrCreate returns existing
    expect(body.data._id).toBe(profileId);
    // Original values preserved
    expect(body.data.name).toBe('Test Business Inc.');
  });

  it('member cannot create an org profile', async () => {
    const res = await ctx.app.inject({
      method: 'POST',
      url: '/api/business',
      headers: authHeaders(ctx.users.member.token, ctx.orgId),
      payload: {
        name: 'Unauthorized',
        country: 'Canada',
        currency: 'CAD',
      },
    });

    expect(res.statusCode).toBeGreaterThanOrEqual(403);
  });
});

describe('Org Profile — GET /api/business (list)', () => {
  it('admin can list org profiles (returns 1 for this org)', async () => {
    const res = await ctx.app.inject({
      method: 'GET',
      url: '/api/business',
      headers: authHeaders(ctx.users.admin.token, ctx.orgId),
    });

    expect(res.statusCode).toBe(200);
    const body = safeParseBody(res.body);
    expect(body.docs).toBeTruthy();
    expect(body.docs.length).toBe(1);
    expect(body.docs[0].name).toBe('Test Business Inc.');
    expect(body.docs[0].currency).toBe('CAD');
  });

  it('staff can list org profiles', async () => {
    const res = await ctx.app.inject({
      method: 'GET',
      url: '/api/business',
      headers: authHeaders(ctx.users.staff.token, ctx.orgId),
    });

    expect(res.statusCode).toBe(200);
    const body = safeParseBody(res.body);
    expect(body.docs.length).toBe(1);
  });

  it('member can list org profiles (requireOrgStaff includes member)', async () => {
    const res = await ctx.app.inject({
      method: 'GET',
      url: '/api/business',
      headers: authHeaders(ctx.users.member.token, ctx.orgId),
    });

    expect(res.statusCode).toBe(200);
    const body = safeParseBody(res.body);
    expect(body.docs.length).toBe(1);
  });
});

describe('Org Profile — PATCH /api/business/:id', () => {
  let profileId: string;

  beforeAll(async () => {
    // Get the profile ID via list
    const res = await ctx.app.inject({
      method: 'GET',
      url: '/api/business',
      headers: authHeaders(ctx.users.admin.token, ctx.orgId),
    });
    profileId = safeParseBody(res.body)?.docs?.[0]?._id;
  });

  it('admin can update org profile', async () => {
    const res = await ctx.app.inject({
      method: 'PATCH',
      url: `/api/business/${profileId}`,
      headers: authHeaders(ctx.users.admin.token, ctx.orgId),
      payload: {
        name: 'Updated Business Name',
        region: 'Ontario',
        aiGuide: 'Focus on retail transactions',
      },
    });

    expect(res.statusCode).toBe(200);
    const body = safeParseBody(res.body);
    expect(body.data.name).toBe('Updated Business Name');
    expect(body.data.region).toBe('Ontario');
    expect(body.data.aiGuide).toBe('Focus on retail transactions');
    // Currency should be unchanged
    expect(body.data.currency).toBe('CAD');
  });

  it('staff can update org profile', async () => {
    const res = await ctx.app.inject({
      method: 'PATCH',
      url: `/api/business/${profileId}`,
      headers: authHeaders(ctx.users.staff.token, ctx.orgId),
      payload: {
        address: '123 Main St',
      },
    });

    expect(res.statusCode).toBe(200);
    const body = safeParseBody(res.body);
    expect(body.data.address).toBe('123 Main St');
  });

  it('member cannot update org profile', async () => {
    const res = await ctx.app.inject({
      method: 'PATCH',
      url: `/api/business/${profileId}`,
      headers: authHeaders(ctx.users.member.token, ctx.orgId),
      payload: { name: 'Hacked' },
    });

    expect(res.statusCode).toBeGreaterThanOrEqual(403);
  });
});

describe('Org Profile — DELETE disabled', () => {
  it('delete route returns 404 (disabled)', async () => {
    const listRes = await ctx.app.inject({
      method: 'GET',
      url: '/api/business',
      headers: authHeaders(ctx.users.admin.token, ctx.orgId),
    });
    const profileId = safeParseBody(listRes.body)?.docs?.[0]?._id;

    const res = await ctx.app.inject({
      method: 'DELETE',
      url: `/api/business/${profileId}`,
      headers: authHeaders(ctx.users.admin.token, ctx.orgId),
    });

    expect(res.statusCode).toBe(404);
  });
});
