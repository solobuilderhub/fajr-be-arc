/**
 * Populate Query Parameter Tests
 *
 * Tests that both string and object (bracket-notation) populate formats
 * work correctly through Fastify's AJV validation layer.
 *
 * Background: MongoKit's QueryParser.parse() accepts both string and object
 * populate, but getQuerySchema() declares populate as type: "string".
 * Arc wires that schema into Fastify's querystring validation (AJV),
 * which may reject object populate even though the parser handles it.
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

  // Seed accounts so we have data to query
  await ctx.app.inject({
    method: 'POST',
    url: '/api/accounts/seed',
    headers: authHeaders(ctx.users.admin.token, ctx.orgId),
  });
}, 30_000);

afterAll(async () => {
  await teardownTestOrg(ctx);
});

describe('Populate — string format (simple)', () => {
  it('list journal entries with string populate works', async () => {
    const res = await ctx.app.inject({
      method: 'GET',
      url: '/api/journal-entries?populate=aiJob.jobId',
      headers: authHeaders(ctx.users.admin.token, ctx.orgId),
    });

    expect(res.statusCode).toBe(200);
    const body = safeParseBody(res.body);
    expect(body.docs).toBeDefined();
  });
});

describe('Populate — object format (bracket notation)', () => {
  it('list journal entries with ?populate[aiJob.jobId]=true (object)', async () => {
    // This is what qs.parse produces from: ?populate[aiJob.jobId]=true
    // Fastify receives: { populate: { "aiJob.jobId": "true" } }
    const res = await ctx.app.inject({
      method: 'GET',
      url: '/api/journal-entries?populate[aiJob.jobId]=true',
      headers: authHeaders(ctx.users.admin.token, ctx.orgId),
    });

    // If AJV rejects the object populate, this will be 400
    // If it works, it should be 200
    console.log(
      `  → Object populate status: ${res.statusCode}`,
      res.statusCode !== 200 ? `body: ${res.body.slice(0, 200)}` : '',
    );
    expect(res.statusCode).toBe(200);
    const body = safeParseBody(res.body);
    expect(body.docs).toBeDefined();
  });

  it('list with advanced populate ?populate[aiJob.jobId][select]=status (object with select)', async () => {
    const res = await ctx.app.inject({
      method: 'GET',
      url: '/api/journal-entries?populate[aiJob.jobId][select]=status,error',
      headers: authHeaders(ctx.users.admin.token, ctx.orgId),
    });

    console.log(
      `  → Advanced populate status: ${res.statusCode}`,
      res.statusCode !== 200 ? `body: ${res.body.slice(0, 200)}` : '',
    );
    expect(res.statusCode).toBe(200);
  });
});

describe('Populate — object format on journal-entries', () => {
  it('object populate should not be rejected by AJV validation', async () => {
    // When qs.parse processes ?populate[aiJob.jobId]=true, Fastify receives:
    //   { populate: { "aiJob.jobId": "true" } }
    // MongoKit's QueryParser.parse() handles this fine,
    // but getQuerySchema() says populate is type: "string",
    // so AJV rejects the object before parse() ever runs.
    const res = await ctx.app.inject({
      method: 'GET',
      url: '/api/journal-entries?populate[aiJob.jobId]=true',
      headers: authHeaders(ctx.users.admin.token, ctx.orgId),
    });

    const body = safeParseBody(res.body);
    console.log(
      `  → Object populate: ${res.statusCode}`,
      res.statusCode !== 200 ? JSON.stringify(body?.details?.errors?.[0]) : 'OK',
    );

    // This SHOULD be 200 but currently fails with 400 VALIDATION_ERROR
    // because MongoKit's getQuerySchema() declares populate as type: "string"
    // Fix needed: either in MongoKit (schema accuracy) or Arc (schema override)
    expect(res.statusCode).toBe(200);
  });
});
