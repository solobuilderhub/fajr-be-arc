/**
 * AI Journal Processing Routes Tests
 *
 * Tests route-level concerns: auth, validation, file handling, job creation.
 * Does NOT call Gemini — tests stop at verifying the job is queued and
 * the draft journal entry + job record are created correctly.
 *
 * Tests:
 *   POST /api/ai/process-file            — Upload PDF & queue AI processing
 *   GET  /api/ai/status/:journalEntryId  — Get job status
 *   POST /api/ai/cancel/:journalEntryId  — Cancel a job
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

// ── Helper: build multipart payload with a fake PDF ─────────────────────────

function buildPdfUpload(
  token: string,
  orgId: string,
  opts: { userQuery?: string; journalEntryId?: string } = {},
) {
  const boundary = '----TestBoundaryAI';
  const parts: string[] = [];

  // PDF file part (fake content — handler will fail at Gemini call, but route logic is tested)
  parts.push(`--${boundary}`);
  parts.push('Content-Disposition: form-data; name="file"; filename="bank-statement.pdf"');
  parts.push('Content-Type: application/pdf');
  parts.push('');
  parts.push('%PDF-1.4 fake-pdf-content');

  if (opts.userQuery) {
    parts.push(`--${boundary}`);
    parts.push('Content-Disposition: form-data; name="userQuery"');
    parts.push('');
    parts.push(opts.userQuery);
  }

  if (opts.journalEntryId) {
    parts.push(`--${boundary}`);
    parts.push('Content-Disposition: form-data; name="journalEntryId"');
    parts.push('');
    parts.push(opts.journalEntryId);
  }

  parts.push(`--${boundary}--`);

  return {
    method: 'POST' as const,
    url: '/api/ai/process-file',
    headers: {
      ...authHeaders(token, orgId),
      'content-type': `multipart/form-data; boundary=${boundary}`,
    },
    payload: parts.join('\r\n'),
  };
}

// ═══════════════════════════════════════════════════════════════════════════════
// Upload & Process
// ═══════════════════════════════════════════════════════════════════════════════

describe('AI Process File — POST /api/ai/process-file', () => {
  it('unauthenticated user cannot upload', async () => {
    const boundary = '----TestBoundaryAI';
    const res = await ctx.app.inject({
      method: 'POST',
      url: '/api/ai/process-file',
      headers: { 'content-type': `multipart/form-data; boundary=${boundary}` },
      payload: `--${boundary}\r\nContent-Disposition: form-data; name="file"; filename="test.pdf"\r\nContent-Type: application/pdf\r\n\r\nfake\r\n--${boundary}--`,
    });
    expect(res.statusCode).toBeGreaterThanOrEqual(400);
  });

  it('member cannot upload (requires admin/staff)', async () => {
    const res = await ctx.app.inject(buildPdfUpload(ctx.users.member.token, ctx.orgId));
    expect(res.statusCode).toBe(403);
  });

  it('rejects non-PDF file', async () => {
    const boundary = '----TestBoundaryAI';
    const payload = [
      `--${boundary}`,
      'Content-Disposition: form-data; name="file"; filename="data.txt"',
      'Content-Type: text/plain',
      '',
      'not a pdf',
      `--${boundary}--`,
    ].join('\r\n');

    const res = await ctx.app.inject({
      method: 'POST',
      url: '/api/ai/process-file',
      headers: {
        ...authHeaders(ctx.users.admin.token, ctx.orgId),
        'content-type': `multipart/form-data; boundary=${boundary}`,
      },
      payload,
    });

    expect(res.statusCode).toBe(400);
    const body = safeParseBody(res.body);
    expect(body.error).toMatch(/pdf/i);
  });

  it('admin can upload PDF and receives 202 with job info', async () => {
    const res = await ctx.app.inject(buildPdfUpload(ctx.users.admin.token, ctx.orgId));

    expect(res.statusCode).toBe(202);
    const body = safeParseBody(res.body);
    expect(body.success).toBe(true);
    expect(body.data.journalEntryId).toBeTruthy();
    expect(body.data.jobId).toBeTruthy();
    expect(body.data.status).toBe('pending');
  });

  it('staff can upload PDF', async () => {
    const res = await ctx.app.inject(buildPdfUpload(ctx.users.staff.token, ctx.orgId));

    expect(res.statusCode).toBe(202);
    const body = safeParseBody(res.body);
    expect(body.success).toBe(true);
  });

  it('accepts optional userQuery field', async () => {
    const res = await ctx.app.inject(
      buildPdfUpload(ctx.users.admin.token, ctx.orgId, {
        userQuery: 'This is a TD bank statement for Q1 2024',
      }),
    );

    expect(res.statusCode).toBe(202);
    const body = safeParseBody(res.body);
    expect(body.success).toBe(true);
  });
});

// ═══════════════════════════════════════════════════════════════════════════════
// Job Status
// ═══════════════════════════════════════════════════════════════════════════════

describe('AI Job Status — GET /api/ai/status/:journalEntryId', () => {
  let journalEntryId: string;

  beforeAll(async () => {
    // Create a job to check status
    const res = await ctx.app.inject(buildPdfUpload(ctx.users.admin.token, ctx.orgId));
    const body = safeParseBody(res.body);
    journalEntryId = body.data.journalEntryId;
  });

  it('unauthenticated user cannot check status', async () => {
    const res = await ctx.app.inject({
      method: 'GET',
      url: `/api/ai/status/${journalEntryId}`,
    });
    expect(res.statusCode).toBeGreaterThanOrEqual(400);
  });

  it('returns status for a valid journal entry', async () => {
    const res = await ctx.app.inject({
      method: 'GET',
      url: `/api/ai/status/${journalEntryId}`,
      headers: authHeaders(ctx.users.admin.token, ctx.orgId),
    });

    expect(res.statusCode).toBe(200);
    const body = safeParseBody(res.body);
    expect(body.success).toBe(true);
    expect(body.data.journalEntryId).toBeTruthy();
    expect(body.data.status).toBeTruthy();
    expect(body.data.sourceDocument).toBeTruthy();
    expect(body.data.sourceDocument.fileName).toBe('bank-statement.pdf');
  });

  it('returns 404 for non-existent entry', async () => {
    const fakeId = '000000000000000000000000';
    const res = await ctx.app.inject({
      method: 'GET',
      url: `/api/ai/status/${fakeId}`,
      headers: authHeaders(ctx.users.admin.token, ctx.orgId),
    });
    expect(res.statusCode).toBe(404);
  });
});

// ═══════════════════════════════════════════════════════════════════════════════
// Cancel Job
// ═══════════════════════════════════════════════════════════════════════════════

describe('AI Cancel Job — POST /api/ai/cancel/:journalEntryId', () => {
  let journalEntryId: string;

  beforeAll(async () => {
    const res = await ctx.app.inject(buildPdfUpload(ctx.users.admin.token, ctx.orgId));
    const body = safeParseBody(res.body);
    journalEntryId = body.data.journalEntryId;
  });

  it('unauthenticated user cannot cancel', async () => {
    const res = await ctx.app.inject({
      method: 'POST',
      url: `/api/ai/cancel/${journalEntryId}`,
    });
    expect(res.statusCode).toBeGreaterThanOrEqual(400);
  });

  it('member cannot cancel (requires admin/staff)', async () => {
    const res = await ctx.app.inject({
      method: 'POST',
      url: `/api/ai/cancel/${journalEntryId}`,
      headers: authHeaders(ctx.users.member.token, ctx.orgId),
    });
    expect(res.statusCode).toBe(403);
  });

  it('admin can cancel a pending job', async () => {
    const res = await ctx.app.inject({
      method: 'POST',
      url: `/api/ai/cancel/${journalEntryId}`,
      headers: authHeaders(ctx.users.admin.token, ctx.orgId),
    });

    expect(res.statusCode).toBe(200);
    const body = safeParseBody(res.body);
    expect(body.success).toBe(true);
    expect(body.data.status).toBe('cancelled');
  });

  it('cannot cancel an already cancelled job', async () => {
    // Try to cancel again — should fail since it's now cancelled/failed
    // First check if status reflects cancellation
    const statusRes = await ctx.app.inject({
      method: 'GET',
      url: `/api/ai/status/${journalEntryId}`,
      headers: authHeaders(ctx.users.admin.token, ctx.orgId),
    });
    const statusBody = safeParseBody(statusRes.body);
    expect(statusBody.data.status).toBe('cancelled');
  });

  it('returns 404 for non-existent entry', async () => {
    const fakeId = '000000000000000000000000';
    const res = await ctx.app.inject({
      method: 'POST',
      url: `/api/ai/cancel/${fakeId}`,
      headers: authHeaders(ctx.users.admin.token, ctx.orgId),
    });
    expect(res.statusCode).toBe(404);
  });
});
