/**
 * Organization Cleanup — Cascade delete all app data when an org is deleted.
 *
 * Called from Better Auth's organizationHooks.afterDeleteOrganization.
 * Uses Mongoose models directly for bulk deleteMany operations.
 */

import mongoose from 'mongoose';

/** Models that store data scoped by organizationId */
const ORG_SCOPED_COLLECTIONS = [
  'OrgProfile',
  'Account',
  'JournalEntry',
  'FiscalPeriod',
  'AuditLog',
  'Job',
] as const;

/**
 * Delete all application data belonging to an organization.
 * Better Auth already handles members + invitations cleanup.
 */
export async function cleanupOrganizationData(
  organizationId: string,
  organizationName?: string,
) {
  const label = organizationName || organizationId;
  console.log(`[org-cleanup] Cleaning up data for org "${label}" (${organizationId})`);

  const results: Record<string, number> = {};

  for (const modelName of ORG_SCOPED_COLLECTIONS) {
    const model = mongoose.models[modelName];
    if (!model) {
      console.warn(`[org-cleanup] Model "${modelName}" not registered, skipping`);
      continue;
    }

    try {
      const { deletedCount } = await model.deleteMany({ organizationId });
      results[modelName] = deletedCount;
    } catch (err) {
      console.error(`[org-cleanup] Failed to clean "${modelName}":`, err);
    }
  }

  console.log(`[org-cleanup] Cleanup complete for "${label}":`, results);
  return results;
}
