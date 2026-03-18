/**
 * Account Model — Chart of Accounts
 *
 * Factory-generated from @classytic/ledger engine.
 * Multi-tenant (organizationId), indexed, and validated automatically.
 */

import mongoose from 'mongoose';
import accounting from '#config/accounting.js';

const AccountSchema = accounting.createAccountSchema();

export const Account = mongoose.model('Account', AccountSchema);
export default Account;
