declare module '@classytic/ledger' {
  export function createAccountingEngine(options: any): AccountingEngine;

  export function doubleEntryPlugin(options: any): any;
  export function fiscalLockPlugin(options: any): any;

  export interface AccountingEngine {
    createAccountSchema(): any;
    createJournalEntrySchema(accountRef: string, options?: any): any;
    createFiscalPeriodSchema(): any;
    wireAccountRepository(repository: any, model: any): void;
    wireJournalEntryRepository(repository: any, model: any): void;
    createReports(models: { Account: any; JournalEntry: any }): any;
  }
}

declare module '@classytic/ledger-ca' {
  export const canadaPack: any;
}

declare module '@classytic/ledger-assets' {
  export const assetsPack: any;
}
