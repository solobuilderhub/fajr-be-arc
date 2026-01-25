/**
 * MongoKit Adapter Factory
 *
 * Creates Arc adapters using MongoKit repositories.
 * The repository handles query parsing via MongoKit's built-in QueryParser.
 */

import { createMongooseAdapter } from '@classytic/arc';
import type { Model } from 'mongoose';
import type { Repository } from '@classytic/mongokit';

/**
 * Create a MongoKit-powered adapter for a resource
 *
 * Note: Query parsing is handled by MongoKit's Repository class.
 * Just pass the model and repository - Arc handles the rest.
 */
export function createAdapter<TDoc, TRepo extends Repository<TDoc>>(
  model: Model<TDoc>,
  repository: TRepo
): ReturnType<typeof createMongooseAdapter> {
  return createMongooseAdapter({
    model,
    repository,
  });
}
