/**
 * Fiscal Period Repository — MongoKit-powered data access.
 */

import { Repository, timestampPlugin } from '@classytic/mongokit';
import { FiscalPeriod } from './fiscal-period.model.js';

const fiscalPeriodRepository = new Repository(FiscalPeriod, [
  timestampPlugin(),
]);

export default fiscalPeriodRepository;
