/**
 * MongoKit Adapter Factory
 *
 * Creates Arc adapters using MongoKit repositories.
 * Uses MongoKit's buildCrudSchemasFromModel as the schema generator
 * for rich OpenAPI documentation (nested objects, enums, validators).
 */

import { createMongooseAdapter } from '@classytic/arc';
import type { OpenApiSchemas } from '@classytic/arc/types';
import { buildCrudSchemasFromModel } from '@classytic/mongokit';
import type { Model } from 'mongoose';
import type { Repository } from '@classytic/mongokit';

/**
 * Create a MongoKit-powered adapter for a resource.
 *
 * Plugs in MongoKit's schema generator for proper OpenAPI docs
 * (handles nested objects, enums, field rules, validators).
 */
export function createAdapter(
  model: Model<any>,
  repository: Repository<any>,
) {
  return createMongooseAdapter({
    model,
    repository,
    schemaGenerator: (m, options) =>
      buildCrudSchemasFromModel(m, options) as OpenApiSchemas,
  });
}
