/**
 * Account-Based Tax Reporting Service
 *
 * Calculates GST/HST returns by querying account balances
 * from tax sub-accounts (e.g., 2680.GST.COLLECTED, 2680.GST.ITC).
 *
 * Architecture:
 * - Users post tax amounts to dedicated tax accounts
 * - Reports aggregate account balances
 * - No special tax logic in journal entries
 * - Standard double-entry bookkeeping
 */

import mongoose from 'mongoose';
import { Account } from '../account/account.model.js';
import { JournalEntry } from '../journal-entry/journal-entry.model.js';

// -- Helpers ------------------------------------------------------------------

function toObjectId(id: string) {
  return new mongoose.Types.ObjectId(id);
}

function round(amount: number): number {
  return Math.round(amount * 100) / 100;
}

// -- Account Balance Calculation ----------------------------------------------

/**
 * Calculate account balance for a specific period.
 * Determines normal balance direction based on account type code:
 * - ITC/ITR accounts: debit balance (contra-liabilities)
 * - 2680.x (Tax payables): credit balance
 * - 1066.x (Tax receivables): debit balance (assets)
 */
async function calculateAccountBalance(
  organizationId: string,
  accountTypeCode: string,
  startDate: Date,
  endDate: Date,
): Promise<number> {
  const account = await Account.findOne({
    organizationId: toObjectId(organizationId),
    accountTypeCode,
    active: true,
  }).lean() as any;

  if (!account) return 0;

  const pipeline = [
    {
      $match: {
        organizationId: toObjectId(organizationId),
        state: 'posted',
        date: { $gte: startDate, $lte: endDate },
      },
    },
    { $unwind: '$journalItems' },
    { $match: { 'journalItems.account': account._id } },
    {
      $group: {
        _id: null,
        totalDebit: { $sum: '$journalItems.debit' },
        totalCredit: { $sum: '$journalItems.credit' },
      },
    },
  ];

  const result = await JournalEntry.aggregate(pipeline);
  if (!result?.length) return 0;

  const { totalDebit, totalCredit } = result[0];

  // Determine normal balance direction
  if (accountTypeCode.includes('.ITC') || accountTypeCode.includes('.ITR')) {
    return round(totalDebit - totalCredit);
  }
  if (accountTypeCode.startsWith('2680.')) {
    return round(totalCredit - totalDebit);
  }
  if (accountTypeCode.startsWith('1066.')) {
    return round(totalDebit - totalCredit);
  }

  return round(totalCredit - totalDebit);
}

/**
 * Calculate instalment balance (debits = payments made to CRA)
 */
async function calculateInstalmentBalance(
  organizationId: string,
  accountTypeCode: string,
  startDate: Date,
  endDate: Date,
): Promise<number> {
  const account = await Account.findOne({
    organizationId: toObjectId(organizationId),
    accountTypeCode,
    active: true,
  }).lean() as any;

  if (!account) return 0;

  const pipeline = [
    {
      $match: {
        organizationId: toObjectId(organizationId),
        state: 'posted',
        date: { $gte: startDate, $lte: endDate },
      },
    },
    { $unwind: '$journalItems' },
    { $match: { 'journalItems.account': account._id } },
    {
      $group: {
        _id: null,
        totalDebit: { $sum: '$journalItems.debit' },
      },
    },
  ];

  const result = await JournalEntry.aggregate(pipeline);
  if (!result?.length) return 0;

  return round(result[0].totalDebit);
}

/**
 * Calculate total sales from revenue accounts (8000-8299)
 */
async function calculateTotalSalesForPeriod(
  organizationId: string,
  startDate: Date,
  endDate: Date,
): Promise<number> {
  const allAccounts = await Account.find({
    organizationId: toObjectId(organizationId),
    active: true,
  }).lean();

  const revenueAccounts = allAccounts.filter((acc: any) => {
    const numCode = parseInt(acc.accountTypeCode, 10);
    return numCode >= 8000 && numCode < 8300;
  });

  if (!revenueAccounts.length) return 0;

  const accountIds = revenueAccounts.map((acc: any) => acc._id);

  const pipeline = [
    {
      $match: {
        organizationId: toObjectId(organizationId),
        state: 'posted',
        date: { $gte: startDate, $lte: endDate },
      },
    },
    { $unwind: '$journalItems' },
    { $match: { 'journalItems.account': { $in: accountIds } } },
    {
      $group: {
        _id: null,
        totalCredit: { $sum: '$journalItems.credit' },
        totalDebit: { $sum: '$journalItems.debit' },
      },
    },
  ];

  const result = await JournalEntry.aggregate(pipeline);
  if (!result?.length) return 0;

  return round(result[0].totalCredit - result[0].totalDebit);
}

// -- Public API ---------------------------------------------------------------

export interface TaxReportParams {
  organizationId: string;
  startDate: Date;
  endDate: Date;
  province: string;
  adjustments?: Record<string, number>;
}

/**
 * Get all tax account balances for a period
 */
export async function getTaxAccountBalances(params: {
  organizationId: string;
  startDate: Date;
  endDate: Date;
}) {
  const { organizationId, startDate, endDate } = params;

  const collectedCodes = [
    '2680.GST.COLLECTED',
    '2680.HST13.COLLECTED',
    '2680.HST15.COLLECTED',
    '2680.QST.COLLECTED',
  ];

  const itcCodes = [
    '2680.GST.ITC',
    '2680.HST13.ITC',
    '2680.HST15.ITC',
    '2680.QST.ITR',
  ];

  const instalmentCodes = ['2680.GST.INSTALMENTS'];

  const balances: Record<string, Record<string, { code: string; balance: number }>> = {
    collected: {},
    itc: {},
    instalments: {},
  };

  for (const code of collectedCodes) {
    const balance = await calculateAccountBalance(organizationId, code, startDate, endDate);
    if (balance !== 0) {
      balances.collected[code] = { code, balance };
    }
  }

  for (const code of itcCodes) {
    const balance = await calculateAccountBalance(organizationId, code, startDate, endDate);
    if (balance !== 0) {
      balances.itc[code] = { code, balance };
    }
  }

  for (const code of instalmentCodes) {
    const balance = await calculateInstalmentBalance(organizationId, code, startDate, endDate);
    if (balance !== 0) {
      balances.instalments[code] = { code, balance };
    }
  }

  return balances;
}

/**
 * Calculate GST/HST return from account balances (CRA Lines 101-115)
 */
export async function calculateGSTHSTReturn(params: TaxReportParams) {
  const { organizationId, startDate, endDate, province, adjustments = {} } = params;

  const balances = await getTaxAccountBalances({ organizationId, startDate, endDate });

  let totalGSTHSTCollected = 0;
  let totalITCs = 0;
  let totalInstalments = 0;

  for (const account of Object.values(balances.collected)) {
    totalGSTHSTCollected += account.balance;
  }

  for (const account of Object.values(balances.itc)) {
    totalITCs += Math.abs(account.balance);
  }

  for (const account of Object.values(balances.instalments)) {
    totalInstalments += account.balance;
  }

  const totalSales = await calculateTotalSalesForPeriod(organizationId, startDate, endDate);

  // CRA Lines calculation
  const line101 = round(totalSales);
  const line103 = round(totalGSTHSTCollected);
  const line104 = adjustments.line104 || 0;
  const line105 = round(line103 + line104);
  const line106 = round(totalITCs);
  const line107 = adjustments.line107 || 0;
  const line108 = round(line106 + line107);
  const line109 = round(line105 - line108);
  const line110 = round(totalInstalments + (adjustments.line110 || 0));
  const line111 = adjustments.line111 || 0;
  const line112 = round(line110 + line111);
  const line113 = round(line109 - line112);
  const line115 = line113;

  const craLines = {
    101: line101,
    103: line103,
    104: line104,
    105: line105,
    106: line106,
    107: line107,
    108: line108,
    109: line109,
    110: line110,
    111: line111,
    112: line112,
    113: line113,
    115: line115,
  };

  return {
    period: {
      startDate: startDate.toISOString(),
      endDate: endDate.toISOString(),
      province,
    },
    accountBalances: balances,
    craLines,
    summary: {
      totalSales: line101,
      totalTaxCollected: line103,
      totalITCs: line106,
      netTax: line109,
      instalments: line110,
      amountOwing: line115 > 0 ? line115 : 0,
      refund: line115 < 0 ? Math.abs(line115) : 0,
    },
    calculatedAt: new Date().toISOString(),
  };
}

/**
 * Get tax payable breakdown by category
 */
export async function getTaxPayableBreakdown(params: {
  organizationId: string;
  endDate: Date;
}) {
  const { organizationId, endDate } = params;
  const startDate = new Date(2000, 0, 1);

  const balances = await getTaxAccountBalances({ organizationId, startDate, endDate });

  let gstHstCollected = 0;
  let gstHstRecoverable = 0;

  for (const account of Object.values(balances.collected)) {
    gstHstCollected += account.balance;
  }
  for (const account of Object.values(balances.itc)) {
    gstHstRecoverable += Math.abs(account.balance);
  }

  // Other tax types
  const otherTaxCodes = [
    '2680.INCOME-TAX.CURRENT',
    '2680.WITHHOLDING-TAX',
    '2680.PROPERTY-TAX',
    '2680.OTHER',
  ];

  const other: Record<string, number> = {
    incomeTax: 0,
    withholding: 0,
    propertyTax: 0,
    other: 0,
  };

  for (const code of otherTaxCodes) {
    const balance = await calculateAccountBalance(organizationId, code, startDate, endDate);
    if (code.includes('INCOME-TAX')) other.incomeTax += balance;
    else if (code.includes('WITHHOLDING')) other.withholding += balance;
    else if (code.includes('PROPERTY')) other.propertyTax += balance;
    else other.other += balance;
  }

  const gstHstNet = round(gstHstCollected - gstHstRecoverable);
  const total = round(
    gstHstNet + other.incomeTax + other.withholding + other.propertyTax + other.other,
  );

  return {
    asOfDate: endDate.toISOString(),
    breakdown: {
      gstHst: {
        collected: gstHstCollected,
        recoverable: gstHstRecoverable,
        net: gstHstNet,
      },
      other,
      total,
    },
  };
}
