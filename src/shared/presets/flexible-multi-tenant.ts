/**
 * Flexible Multi-Tenant Preset
 *
 * Smarter tenant filtering that works with public + authenticated routes.
 *
 * Philosophy:
 * - No org header → No filtering (public data, all orgs)
 * - Org header present → Require auth, filter by org
 *
 * This differs from Arc's strict multiTenant which always requires auth.
 */

interface FlexibleMultiTenantOptions {
  tenantField?: string;
  bypassRoles?: string[];
  extractOrganizationId?: (request: any) => string | null;
}

interface PresetMiddlewares {
  list: ((request: any, reply: any) => Promise<void>)[];
  get: ((request: any, reply: any) => Promise<void>)[];
  create: ((request: any, reply: any) => Promise<void>)[];
  update: ((request: any, reply: any) => Promise<void>)[];
  delete: ((request: any, reply: any) => Promise<void>)[];
}

interface Preset {
  [key: string]: unknown;
  name: string;
  middlewares: PresetMiddlewares;
}

/**
 * Default organization ID extractor
 * Tries multiple sources in order of priority
 */
function defaultExtractOrganizationId(request: any): string | null {
  // Priority 1: Explicit context (set by org-scope plugin)
  if (request.context?.organizationId) {
    return String(request.context.organizationId);
  }

  // Priority 2: User's organizationId field
  if (request.user?.organizationId) {
    return String(request.user.organizationId);
  }

  // Priority 3: User's organization object (nested)
  if (request.user?.organization) {
    const org = request.user.organization;
    return String(org._id || org.id || org);
  }

  return null;
}

/**
 * Create flexible tenant filter middleware
 * Only filters when org context is present
 */
function createFlexibleTenantFilter(
  tenantField: string,
  bypassRoles: string[],
  extractOrganizationId: (request: any) => string | null
) {
  return async (request: any, reply: any) => {
    const user = request.user;
    const orgId = extractOrganizationId(request);

    // No org context - allow through (public data, no filtering)
    if (!orgId) {
      request.log?.debug?.({ msg: 'No org context - showing all data' });
      return;
    }

    // Org context present - auth should already be handled by org-scope plugin
    // But double-check for safety
    if (!user) {
      request.log?.warn?.({ msg: 'Org context present but no user - should not happen' });
      return reply.code(401).send({
        success: false,
        error: 'Unauthorized',
        message: 'Authentication required for organization-scoped data',
      });
    }

    // Bypass roles skip filter (superadmin sees all)
    const userRoles = Array.isArray(user.roles) ? user.roles : [];
    if (bypassRoles.some((r: string) => userRoles.includes(r))) {
      request.log?.debug?.({ msg: 'Bypass role - no tenant filter' });
      return;
    }

    // Apply tenant filter to query
    request.query = request.query ?? {};
    request.query._policyFilters = {
      ...(request.query._policyFilters ?? {}),
      [tenantField]: orgId,
    };

    request.log?.debug?.({ msg: 'Tenant filter applied', orgId, tenantField });
  };
}

/**
 * Create tenant injection middleware
 * Injects tenant ID into request body on create
 */
function createTenantInjection(
  tenantField: string,
  extractOrganizationId: (request: any) => string | null
) {
  return async (request: any, reply: any) => {
    const orgId = extractOrganizationId(request);

    // Fail-closed: Require orgId for create operations
    if (!orgId) {
      return reply.code(403).send({
        success: false,
        error: 'Forbidden',
        message: 'Organization context required to create resources',
      });
    }

    if (request.body) {
      request.body[tenantField] = orgId;
    }
  };
}

/**
 * Flexible Multi-Tenant Preset
 *
 * @param options.tenantField - Field name in database (default: 'organizationId')
 * @param options.bypassRoles - Roles that bypass tenant isolation (default: ['superadmin'])
 * @param options.extractOrganizationId - Custom org ID extractor function
 */
export function flexibleMultiTenantPreset(options: FlexibleMultiTenantOptions = {}): Preset {
  const {
    tenantField = 'organizationId',
    bypassRoles = ['superadmin'],
    extractOrganizationId = defaultExtractOrganizationId,
  } = options;

  const tenantFilter = createFlexibleTenantFilter(tenantField, bypassRoles, extractOrganizationId);
  const tenantInjection = createTenantInjection(tenantField, extractOrganizationId);

  return {
    name: 'flexibleMultiTenant',
    middlewares: {
      list: [tenantFilter],
      get: [tenantFilter],
      create: [tenantInjection],
      update: [tenantFilter],
      delete: [tenantFilter],
    },
  };
}

export default flexibleMultiTenantPreset;
