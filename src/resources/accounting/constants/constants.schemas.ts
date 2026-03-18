/**
 * Constants Schemas — JSON Schema definitions for OpenAPI docs
 */

// ── Account Type Schemas ────────────────────────────────────────────────────

const accountTypeItem = {
  type: 'object',
  properties: {
    code: { type: 'string', description: 'GIFI code' },
    name: { type: 'string' },
    description: { type: 'string', nullable: true },
    category: { type: 'string', description: 'e.g. "Balance Sheet-Asset"' },
    parentCode: { type: 'string', nullable: true },
    isTotal: { type: 'boolean' },
    isGroup: { type: 'boolean' },
    deprecated: { type: 'boolean' },
    replacedBy: { type: 'string', nullable: true },
    taxMetadata: { type: 'object', nullable: true, additionalProperties: true },
    cashFlowCategory: { type: 'string', nullable: true },
  },
} as const;

export const accountTypeSchemas = {
  list: {
    querystring: {
      type: 'object',
      properties: {
        search: { type: 'string', description: 'Search by code or name' },
        category: { type: 'string', description: 'Filter by full category key' },
        mainType: { type: 'string', description: 'Filter by type suffix (Asset, Liability, etc.)' },
      },
      additionalProperties: false,
    },
    response: {
      200: {
        type: 'object',
        properties: {
          success: { type: 'boolean' },
          results: { type: 'integer' },
          data: { type: 'array', items: accountTypeItem },
        },
      },
    },
  },
  get: {
    params: {
      type: 'object',
      properties: { code: { type: 'string' } },
      required: ['code'],
    },
    response: {
      200: {
        type: 'object',
        properties: {
          success: { type: 'boolean' },
          data: accountTypeItem,
        },
      },
    },
  },
};

// ── Journal Type Schemas ────────────────────────────────────────────────────

const journalTypeItem = {
  type: 'object',
  properties: {
    code: { type: 'string' },
    name: { type: 'string' },
    description: { type: 'string', nullable: true },
  },
} as const;

export const journalTypeSchemas = {
  list: {
    response: {
      200: {
        type: 'object',
        properties: {
          success: { type: 'boolean' },
          results: { type: 'integer' },
          data: { type: 'array', items: journalTypeItem },
        },
      },
    },
  },
  get: {
    params: {
      type: 'object',
      properties: { code: { type: 'string' } },
      required: ['code'],
    },
    response: {
      200: {
        type: 'object',
        properties: {
          success: { type: 'boolean' },
          data: journalTypeItem,
        },
      },
    },
  },
};

// ── Tax Template Schemas ────────────────────────────────────────────────────

const taxCodeItem = {
  type: 'object',
  properties: {
    code: { type: 'string' },
    name: { type: 'string' },
    taxType: { type: 'string' },
    rate: { type: 'number' },
    direction: { type: 'string' },
    province: { type: 'string' },
    description: { type: 'string', nullable: true },
    active: { type: 'boolean' },
  },
} as const;

const taxTemplateItem = {
  type: 'object',
  properties: {
    country: { type: 'string' },
    region: { type: 'string' },
    taxes: { type: 'array', items: taxCodeItem },
  },
} as const;

export const taxTemplateSchemas = {
  listAll: {
    response: {
      200: {
        type: 'object',
        properties: {
          success: { type: 'boolean' },
          results: { type: 'integer' },
          data: { type: 'array', items: taxTemplateItem },
        },
      },
    },
  },
  listCountries: {
    response: {
      200: {
        type: 'object',
        properties: {
          success: { type: 'boolean' },
          data: { type: 'array', items: { type: 'string' } },
        },
      },
    },
  },
  listRegions: {
    params: {
      type: 'object',
      properties: { country: { type: 'string' } },
      required: ['country'],
    },
    response: {
      200: {
        type: 'object',
        properties: {
          success: { type: 'boolean' },
          data: { type: 'array', items: { type: 'string' } },
        },
      },
    },
  },
  getByLocation: {
    params: {
      type: 'object',
      properties: {
        country: { type: 'string' },
        region: { type: 'string' },
      },
      required: ['country', 'region'],
    },
    response: {
      200: {
        type: 'object',
        properties: {
          success: { type: 'boolean' },
          data: taxTemplateItem,
        },
      },
    },
  },
};
