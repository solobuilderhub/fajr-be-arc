/**
 * Fiscal Period Model
 *
 * Factory-generated from @classytic/ledger engine.
 * Multi-tenant (organizationId), indexed, and validated automatically.
 */

import mongoose from 'mongoose';
import accounting from '#config/accounting.js';

const FiscalPeriodSchema = accounting.createFiscalPeriodSchema();

export const FiscalPeriod = mongoose.model('FiscalPeriod', FiscalPeriodSchema);
export default FiscalPeriod;
