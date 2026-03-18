/**
 * Tax Report Routes
 *
 * Canadian GST/HST return calculation and tax payable breakdown.
 *
 * Endpoints:
 *   GET /tax-reports/gst-hst          — Full GST/HST return calculation
 *   GET /tax-reports/tax-breakdown    — Tax payable breakdown by category
 */

import type { FastifyPluginAsync } from 'fastify';
import {
  calculateGSTHSTReturn,
  getTaxPayableBreakdown,
} from './tax-report.service.js';

const taxReportRoutes: FastifyPluginAsync = async (fastify) => {
  // Require authentication + org context for all tax report routes
  const authenticate = (fastify as any).authenticate;
  if (authenticate) {
    fastify.addHook('preHandler', authenticate);
  }

  // GET /tax-reports/gst-hst
  fastify.get('/gst-hst', async (req: any, reply) => {
    const orgId = req.scope?.organizationId;
    if (!orgId) {
      return reply.status(400).send({ error: 'Organization context required' });
    }

    const { startDate, endDate, province = 'Alberta', adjustments } =
      req.query as any;

    if (!startDate || !endDate) {
      return reply
        .status(400)
        .send({ error: 'startDate and endDate query parameters are required' });
    }

    let parsedAdjustments = {};
    if (adjustments) {
      try {
        parsedAdjustments =
          typeof adjustments === 'string'
            ? JSON.parse(adjustments)
            : adjustments;
      } catch {
        return reply
          .status(400)
          .send({ error: 'Invalid adjustments JSON' });
      }
    }

    const result = await calculateGSTHSTReturn({
      organizationId: orgId,
      startDate: new Date(startDate),
      endDate: new Date(endDate),
      province,
      adjustments: parsedAdjustments,
    });

    return { success: true, data: result };
  });

  // GET /tax-reports/tax-breakdown
  fastify.get('/tax-breakdown', async (req: any, reply) => {
    const orgId = req.scope?.organizationId;
    if (!orgId) {
      return reply.status(400).send({ error: 'Organization context required' });
    }

    const { asOfDate } = req.query as any;
    const endDate = asOfDate ? new Date(asOfDate) : new Date();

    const result = await getTaxPayableBreakdown({
      organizationId: orgId,
      endDate,
    });

    return { success: true, data: result };
  });
};

export default taxReportRoutes;
