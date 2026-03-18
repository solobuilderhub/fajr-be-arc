/**
 * Tax Template Resource — Tax Code Lookups by Country & Region
 *
 * Static reference data from @classytic/ledger-ca.
 * No database — service resource with custom routes only.
 *
 * Endpoints:
 *   GET /tax-template                                — List all tax templates
 *   GET /tax-template/countries                      — List supported countries
 *   GET /tax-template/countries/:country/regions     — List regions for a country
 *   GET /tax-template/countries/:country/regions/:region — Get tax codes for a region
 */

import { defineResource } from '@classytic/arc';
import { requireAuth } from '#shared/permissions.js';
import {
  TAX_CODES,
  TAX_CODES_BY_REGION,
  CANADA_REGIONS,
} from '@classytic/ledger-ca';
import { taxTemplateSchemas } from './constants.schemas.js';

type TaxCodeEntry = (typeof TAX_CODES)[keyof typeof TAX_CODES];

const SUPPORTED_COUNTRIES: Record<string, string> = {
  canada: 'Canada',
};

function normalizeCountry(raw: string): string | null {
  const lower = raw.toLowerCase().trim();
  return SUPPORTED_COUNTRIES[lower] ? lower : null;
}

function normalizeRegion(region: string): string | null {
  const lower = region.toLowerCase().trim();
  const match = CANADA_REGIONS.find((r) => r.toLowerCase() === lower);
  return match ?? null;
}

function getTaxesForRegion(region: string) {
  const codes = (TAX_CODES_BY_REGION as Record<string, string[]>)[region];
  if (!codes) return [];
  return codes
    .map((code) => (TAX_CODES as Record<string, TaxCodeEntry>)[code])
    .filter(Boolean);
}

const taxTemplateResource = defineResource({
  name: 'tax-template',
  displayName: 'Tax Templates',
  prefix: '/tax-template',

  disableDefaultRoutes: true,
  skipValidation: true,

  additionalRoutes: [
    // GET /tax-templates — List all tax templates (all countries & regions)
    {
      method: 'GET',
      path: '/',
      summary: 'List all tax templates',
      permissions: requireAuth(),
      wrapHandler: false,
      schema: taxTemplateSchemas.listAll,
      handler: async () => {
        const templates = CANADA_REGIONS.map((region) => ({
          country: 'canada',
          region,
          taxes: getTaxesForRegion(region),
        })).filter((t) => t.taxes.length > 0);

        return { success: true, results: templates.length, data: templates };
      },
    },

    // GET /tax-templates/countries — List supported countries
    {
      method: 'GET',
      path: '/countries',
      summary: 'List supported countries',
      permissions: requireAuth(),
      wrapHandler: false,
      schema: taxTemplateSchemas.listCountries,
      handler: async () => {
        return {
          success: true,
          data: Object.values(SUPPORTED_COUNTRIES),
        };
      },
    },

    // GET /tax-templates/countries/:country/regions — List regions for a country
    {
      method: 'GET',
      path: '/countries/:country/regions',
      summary: 'List regions for a country',
      permissions: requireAuth(),
      wrapHandler: false,
      schema: taxTemplateSchemas.listRegions,
      handler: async (req: any, reply: any) => {
        const country = normalizeCountry(req.params.country);
        if (!country) {
          return reply
            .status(404)
            .send({ success: false, error: `Unsupported country: ${req.params.country}` });
        }

        return { success: true, data: CANADA_REGIONS };
      },
    },

    // GET /tax-templates/countries/:country/regions/:region — Get tax codes for a region
    {
      method: 'GET',
      path: '/countries/:country/regions/:region',
      summary: 'Get tax codes for a country and region',
      permissions: requireAuth(),
      wrapHandler: false,
      schema: taxTemplateSchemas.getByLocation,
      handler: async (req: any, reply: any) => {
        const country = normalizeCountry(req.params.country);
        if (!country) {
          return reply
            .status(404)
            .send({ success: false, error: `Unsupported country: ${req.params.country}` });
        }

        const region = normalizeRegion(req.params.region);
        if (!region) {
          return reply
            .status(404)
            .send({ success: false, error: `Tax template not found for ${req.params.region}, ${req.params.country}` });
        }

        const taxes = getTaxesForRegion(region);
        return {
          success: true,
          data: { country, region, taxes },
        };
      },
    },
  ],
});

export default taxTemplateResource;
