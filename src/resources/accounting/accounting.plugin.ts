/**
 * Accounting Plugin — Master Entry Point
 *
 * Combines all accounting resources, reports, tax routes,
 * COR file parsing, and workflow endpoints into a single
 * Fastify plugin for clean registration.
 *
 * Mounted at /api (via resource registry prefix).
 * Provides:
 *   /accounts/*          — Chart of Accounts CRUD + seed/bulk/enable/disable
 *   /journal-entries/*   — Journal Entries CRUD + post/reverse
 *   /fiscal-periods/*    — Fiscal Period CRUD + close/reopen
 *   /audit-logs/*        — Audit Log read-only
 *   /account-types/*     — GIFI account type lookups (static, no DB)
 *   /journal-types/*     — Journal type lookups (static, no DB)
 *   /tax-template/*      — Tax code lookups by country & region (static, no DB)
 *   /reports/*           — Financial reports (trial balance, balance sheet, etc.)
 *   /tax-reports/*       — Tax reports (GST/HST return, tax breakdown)
 *   /cor/*               — COR file upload & parsing
 *   /workflow/*          — Workflow routes (COR-to-Journal import)
 *   /ai/*                — AI-powered journal generation
 */

import type { FastifyPluginAsync } from 'fastify';
import accountResource from './account/account.resource.js';
import journalEntryResource from './journal-entry/journal-entry.resource.js';
import fiscalPeriodResource from './fiscal-period/fiscal-period.resource.js';
import auditLogResource from './audit-log/audit-log.resource.js';
import accountTypeResource from './constants/account-type.resource.js';
import journalTypeResource from './constants/journal-type.resource.js';
import taxTemplateResource from './constants/tax-template.resource.js';
import reportRoutes from './reports/reports.routes.js';
import taxReportRoutes from './reports/tax-reports.routes.js';
import corRoutes from './cor/cor.routes.js';
import corToJournalRoutes from './workflow/cor-to-journal.routes.js';
import aiJournalRoutes from './ai/ai-journal.routes.js';

export const accountingPlugin: FastifyPluginAsync = async (fastify) => {
  // CRUD resources (auto-generated controllers, org-scoped)
  await fastify.register(accountResource.toPlugin());
  await fastify.register(journalEntryResource.toPlugin());
  await fastify.register(fiscalPeriodResource.toPlugin());
  await fastify.register(auditLogResource.toPlugin());

  // Static lookup resources (no database, service-only)
  await fastify.register(accountTypeResource.toPlugin());
  await fastify.register(journalTypeResource.toPlugin());
  await fastify.register(taxTemplateResource.toPlugin());

  // Financial reports (engine-powered aggregation pipelines)
  await fastify.register(reportRoutes, { prefix: '/reports' });

  // Tax reports (GST/HST return, tax breakdown)
  await fastify.register(taxReportRoutes, { prefix: '/tax-reports' });

  // COR file parsing (Canadian CRA .cor files)
  await fastify.register(corRoutes, { prefix: '/cor' });

  // Workflow routes (COR → Journal import)
  await fastify.register(corToJournalRoutes, { prefix: '/workflow' });

  // AI-powered journal generation (PDF upload + Gemini)
  await fastify.register(aiJournalRoutes, { prefix: '/ai' });
};

export default accountingPlugin;
