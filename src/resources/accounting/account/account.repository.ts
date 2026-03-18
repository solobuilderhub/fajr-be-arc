/**
 * Account Repository — MongoKit-powered data access for Chart of Accounts.
 *
 * Uses @classytic/ledger engine to wire seedAccounts/bulkCreate
 * and posting-account validation.
 */

import { Repository, timestampPlugin } from '@classytic/mongokit';
import { Account } from './account.model.js';
import accounting from '#config/accounting.js';

const accountRepository = new Repository(Account, [timestampPlugin()], { maxLimit: 1000 });

// Wire seedAccounts, bulkCreate, and posting-account validation from the engine
accounting.wireAccountRepository(accountRepository, Account);

export default accountRepository;
