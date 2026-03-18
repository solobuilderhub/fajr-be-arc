/**
 * Shared Test Helpers
 *
 * Common utilities for fajr accounting backend integration tests.
 *
 * Usage:
 *   const ctx = await setupTestOrg();
 *   // ... run tests using ctx.app, ctx.users, ctx.orgId ...
 *   await teardownTestOrg(ctx);
 */

import { expect } from 'vitest';
import mongoose from 'mongoose';
import { MongoMemoryServer } from 'mongodb-memory-server';
import type { FastifyInstance } from 'fastify';

// ============================================================================
// Types
// ============================================================================

export interface UserContext {
  token: string;
  userId: string;
}

export interface TestContext {
  mongod: MongoMemoryServer;
  app: FastifyInstance;
  auth: any;
  orgId: string;
  users: {
    admin: UserContext;
    staff: UserContext;
    member: UserContext;
  };
}

// ============================================================================
// Request Helpers
// ============================================================================

export function safeParseBody(body: string): any {
  try { return JSON.parse(body); } catch { return null; }
}

export function authHeaders(token: string, orgId?: string): Record<string, string> {
  const h: Record<string, string> = { authorization: `Bearer ${token}` };
  if (orgId) h['x-organization-id'] = orgId;
  return h;
}

export async function signUp(app: FastifyInstance, data: { email: string; password: string; name: string }) {
  const res = await app.inject({
    method: 'POST',
    url: '/api/auth/sign-up/email',
    payload: data,
  });
  const token = res.headers['set-auth-token'] as string | undefined;
  const body = safeParseBody(res.body);
  return { statusCode: res.statusCode, token: token || '', user: body?.user || body, body };
}

export async function signIn(app: FastifyInstance, data: { email: string; password: string }) {
  const res = await app.inject({
    method: 'POST',
    url: '/api/auth/sign-in/email',
    payload: data,
  });
  const token = res.headers['set-auth-token'] as string | undefined;
  const body = safeParseBody(res.body);
  return { statusCode: res.statusCode, token: token || '', user: body?.user || body, body };
}

export async function createOrg(app: FastifyInstance, token: string, data: { name: string; slug: string }) {
  const res = await app.inject({
    method: 'POST',
    url: '/api/auth/organization/create',
    headers: authHeaders(token),
    payload: data,
  });
  const body = safeParseBody(res.body);
  return { statusCode: res.statusCode, orgId: body?.id, body };
}

export async function setActiveOrg(app: FastifyInstance, token: string, orgId: string) {
  const res = await app.inject({
    method: 'POST',
    url: '/api/auth/organization/set-active',
    headers: authHeaders(token),
    payload: { organizationId: orgId },
  });
  return { statusCode: res.statusCode, body: safeParseBody(res.body) };
}

export async function addMember(auth: any, data: { organizationId: string; userId: string; role: string }) {
  try {
    const result = await auth.api.addMember({ body: data });
    return { statusCode: 200, body: result };
  } catch (e: any) {
    return { statusCode: e.status || 500, body: e };
  }
}

// ============================================================================
// Full Org Setup
// ============================================================================

/**
 * Creates a complete test environment:
 * - MongoMemoryServer
 * - App instance
 * - 3 users: admin (owner), staff, member
 * - Organization with all members assigned roles
 */
export async function setupTestOrg(): Promise<TestContext> {
  const mongod = await MongoMemoryServer.create();
  const uri = mongod.getUri();
  await mongoose.connect(uri);

  const { createAppInstance } = await import('../../src/app.js');
  const app = await createAppInstance();
  await app.ready();

  const { getAuth } = await import('../../src/resources/auth/auth.config.js');
  const auth = getAuth();

  // ---- Create users ----
  const adminSignup = await signUp(app, { email: 'admin@fajr.test', password: 'password123', name: 'Admin User' });
  expect(adminSignup.statusCode).toBe(200);

  const staffSignup = await signUp(app, { email: 'staff@fajr.test', password: 'password123', name: 'Staff User' });
  expect(staffSignup.statusCode).toBe(200);

  const memberSignup = await signUp(app, { email: 'member@fajr.test', password: 'password123', name: 'Member User' });
  expect(memberSignup.statusCode).toBe(200);

  // ---- Create organization (admin becomes org admin via creatorRole) ----
  const orgResult = await createOrg(app, adminSignup.token, { name: 'Test Business', slug: 'test-business' });
  expect(orgResult.statusCode).toBe(200);
  const orgId = orgResult.orgId;
  expect(orgId).toBeTruthy();

  // ---- Add members with org roles ----
  expect((await addMember(auth, { organizationId: orgId, userId: staffSignup.user?.id, role: 'staff' })).statusCode).toBe(200);
  expect((await addMember(auth, { organizationId: orgId, userId: memberSignup.user?.id, role: 'member' })).statusCode).toBe(200);

  // ---- Set active org for all users ----
  await setActiveOrg(app, adminSignup.token, orgId);

  const staffLogin = await signIn(app, { email: 'staff@fajr.test', password: 'password123' });
  await setActiveOrg(app, staffLogin.token, orgId);

  const memberLogin = await signIn(app, { email: 'member@fajr.test', password: 'password123' });
  await setActiveOrg(app, memberLogin.token, orgId);

  return {
    mongod,
    app,
    auth,
    orgId,
    users: {
      admin: { token: adminSignup.token, userId: adminSignup.user?.id },
      staff: { token: staffLogin.token, userId: staffSignup.user?.id },
      member: { token: memberLogin.token, userId: memberSignup.user?.id },
    },
  };
}

/**
 * Teardown the test environment.
 */
export async function teardownTestOrg(ctx: TestContext): Promise<void> {
  await ctx.app?.close();
  await mongoose.disconnect();
  await ctx.mongod?.stop();
}
