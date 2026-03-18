/**
 * Organization Profile Controller
 *
 * Uses getOrCreate for singleton-per-org behavior (like venue-profile in arc-be-ex).
 * POST /org-profiles creates or returns the existing profile for the org.
 */

import { BaseController } from '@classytic/arc';
import type { IRequestContext, IControllerResponse } from '@classytic/arc/types';
import { getOrgId } from '@classytic/arc/scope';
import orgProfileRepository from './org-profile.repository.js';

class OrgProfileController extends BaseController {
  constructor() {
    super(orgProfileRepository as any, { resourceName: 'org-profile' });
  }

  async create(req: IRequestContext): Promise<IControllerResponse<any>> {
    const arcContext = req.metadata as Record<string, any> | undefined;
    const scope = arcContext?._scope;
    const orgId = scope ? getOrgId(scope) : undefined;

    if (!orgId) {
      return { success: false, error: 'Organization context required', status: 400 };
    }

    const body = this.bodySanitizer.sanitize(
      (req.body ?? {}) as Record<string, any>,
      'create',
      req,
      arcContext,
    );

    const tf = this.getTenantField();
    if (tf) {
      body[tf] = orgId;
    }

    const item = await orgProfileRepository.getOrCreate(
      { organizationId: orgId },
      body,
    );

    return {
      success: true,
      data: item,
      status: 201,
      meta: { message: 'Created successfully' },
    };
  }
}

const orgProfileController = new OrgProfileController();
export default orgProfileController;
