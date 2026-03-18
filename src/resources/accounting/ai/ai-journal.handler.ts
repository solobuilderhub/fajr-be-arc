/**
 * AI Journal Generation Handler
 *
 * Background job handler that:
 * 1. Reads the org's Chart of Accounts (excludes virtual tax, totals, groups)
 * 2. Sends PDF + CoA to Gemini for structured journal entry extraction
 * 3. Processes items — splits tax-inclusive amounts, creates tax account entries
 * 4. Updates the draft JournalEntry with the AI-generated items
 */

import { Money } from '@classytic/ledger';
import {
  getTaxAccountsByProvince,
  getTaxAccountCode,
  getTaxCodeDetails,
} from '@classytic/ledger-ca';
import { canadaPack } from '#config/accounting.js';
import { Account } from '../account/account.model.js';
import { JournalEntry } from '../journal-entry/journal-entry.model.js';
import { GeminiClient } from './gemini-client.js';
import type { QueuedJob } from './job-queue.js';

const GEMINI_API_KEY = process.env.GEMINI_API_KEY ?? '';

// ─── Types ──────────────────────────────────────────────────────────────────

interface AIJournalItem {
  account: string;
  date: string;
  label: string;
  debit: string;
  credit: string;
  taxCode?: string | null;
}

// ─── Main Handler ───────────────────────────────────────────────────────────

export async function handleAIJournalGeneration(job: QueuedJob): Promise<any> {
  const {
    organizationId,
    pdfBuffer,
    pdfMimeType,
    userQuery,
    journalEntryId,
    region = 'Alberta',
    country = 'Canada',
    aiGuide,
  } = job.data;

  try {
    // Mark as processing
    await JournalEntry.findByIdAndUpdate(journalEntryId, {
      'aiJob.status': 'processing',
    });

    // Get org's active accounts (exclude virtual tax, totals, groups)
    const allAccounts = await Account.find({
      organizationId,
      active: true,
    })
      .select('accountTypeCode')
      .lean();

    const accountsForAI = allAccounts.filter((acc: any) => {
      if (
        acc.accountTypeCode.startsWith('2680.') ||
        acc.accountTypeCode.startsWith('1066.')
      )
        return false;
      const at = canadaPack.getAccountType(acc.accountTypeCode);
      if (at && ((at as any).isTotal || (at as any).isGroup)) return false;
      return true;
    });

    const filteredAccounts = accountsForAI.map((acc: any) => {
      const at = canadaPack.getAccountType(acc.accountTypeCode);
      return { code: acc.accountTypeCode, name: at?.name ?? acc.accountTypeCode };
    });

    // Get provincial tax codes
    const provincialTaxCodes = getTaxAccountsByProvince(region);
    const taxCodeInfo = provincialTaxCodes
      .filter(
        (acc: any) =>
          acc.taxMetadata?.direction === 'collected' ||
          acc.taxMetadata?.direction === 'recoverable',
      )
      .map((acc: any) => ({
        code: extractTaxCodeName(acc.code),
        name: acc.taxMetadata.taxType,
        rate: acc.taxMetadata.rate * 100,
        direction: acc.taxMetadata.direction,
      }));

    // Build prompt and generate
    const systemInstruction = buildSystemInstruction({
      country,
      region,
      aiGuide,
      filteredAccounts,
      taxCodeInfo,
    });

    const gemini = new GeminiClient(GEMINI_API_KEY, {
      modelName: 'gemini-2.5-flash',
      systemInstruction,
      generationConfig: {
        temperature: 0.5,
        topP: 0.95,
        maxOutputTokens: 108192,
        responseMimeType: 'application/json',
        responseSchema: AI_RESPONSE_SCHEMA,
      },
    });

    let prompt =
      'Please analyze the PDF segment by segment and look at all the transactions. Then from the statement generate journal entry items in JSON format with account codes and tax codes where applicable.';
    if (userQuery) prompt += `\n\nAdditional Context:\n${userQuery}`;

    const responseText = await gemini.generateContent({
      prompt,
      fileBuffer: Buffer.from(pdfBuffer),
      mimeType: pdfMimeType,
    });

    const aiResponse = JSON.parse(responseText);

    // Process items with tax splitting
    const processedItems = processJournalItemsWithTax(
      aiResponse.JournalItems ?? [],
      allAccounts,
    );

    const totalDebit = processedItems.reduce((sum, i) => sum + i.debit, 0);
    const totalCredit = processedItems.reduce((sum, i) => sum + i.credit, 0);

    // Update journal entry
    await JournalEntry.findByIdAndUpdate(
      journalEntryId,
      {
        journalType: 'MISC',
        label: processedItems[0]?.label ?? 'AI Generated Entry',
        date: processedItems[0]?.date ?? new Date(),
        journalItems: processedItems,
        totalDebit,
        totalCredit,
        'aiJob.status': 'completed',
        'aiJob.generatedAt': new Date(),
        state: 'draft',
      },
      { new: true, runValidators: true },
    );

    return { success: true, journalEntryId, itemsGenerated: processedItems.length };
  } catch (error: any) {
    await JournalEntry.findByIdAndUpdate(journalEntryId, {
      'aiJob.status': 'failed',
      'aiJob.error': error.message,
    }).catch(() => {});
    throw error;
  }
}

// ─── Tax Processing ─────────────────────────────────────────────────────────

function processJournalItemsWithTax(items: AIJournalItem[], allAccounts: any[]) {
  const processed: any[] = [];

  for (const item of items) {
    let accountCode = item.account;
    if (accountCode === 'GST-INSTALMENT') accountCode = '2680.GST.INSTALMENTS';

    const account = allAccounts.find((a: any) => a.accountTypeCode === accountCode);
    if (!account) continue; // Skip unrecognized accounts

    const debitAmount = Money.fromDecimal(parseFloat(item.debit) || 0);
    const creditAmount = Money.fromDecimal(parseFloat(item.credit) || 0);

    if (item.taxCode) {
      const taxDetails = getTaxCodeDetails(item.taxCode);
      if (!taxDetails) {
        processed.push({
          account: account._id,
          label: item.label,
          date: new Date(item.date),
          debit: debitAmount,
          credit: creditAmount,
        });
        continue;
      }

      const grossAmount = debitAmount + creditAmount;
      const baseAmount = Math.round(grossAmount / (1 + taxDetails.rate));
      const taxAmount = grossAmount - baseAmount;

      const taxAccountCode = getTaxAccountCode(taxDetails.taxType, taxDetails.direction);
      const taxAccount = taxAccountCode
        ? allAccounts.find((a: any) => a.accountTypeCode === taxAccountCode)
        : null;

      // Base amount entry
      processed.push({
        account: account._id,
        label: item.label,
        date: new Date(item.date),
        debit: debitAmount > 0 ? baseAmount : 0,
        credit: creditAmount > 0 ? baseAmount : 0,
        taxDetails: [{ taxCode: item.taxCode, taxName: taxDetails.taxType }],
      });

      // Tax entry (if tax account exists)
      if (taxAccount) {
        processed.push({
          account: taxAccount._id,
          label: `${taxDetails.name} on ${item.label}`,
          date: new Date(item.date),
          debit: taxDetails.direction === 'recoverable' ? taxAmount : 0,
          credit: taxDetails.direction === 'collected' ? taxAmount : 0,
        });
      }
    } else {
      processed.push({
        account: account._id,
        label: item.label,
        date: new Date(item.date),
        debit: debitAmount,
        credit: creditAmount,
      });
    }
  }

  return processed;
}

// ─── Helpers ────────────────────────────────────────────────────────────────

function extractTaxCodeName(accountCode: string): string {
  if (accountCode.includes('.GST.COLLECTED')) return 'GST5';
  if (accountCode.includes('.GST.ITC')) return 'GST-ITC5';
  if (accountCode.includes('.HST13.COLLECTED')) return 'HST13';
  if (accountCode.includes('.HST13.ITC')) return 'HST-ITC13';
  if (accountCode.includes('.HST15.COLLECTED')) return 'HST15';
  if (accountCode.includes('.HST15.ITC')) return 'HST-ITC15';
  return accountCode;
}

const AI_RESPONSE_SCHEMA = {
  type: 'object',
  properties: {
    JournalItems: {
      type: 'array',
      items: {
        type: 'object',
        properties: {
          account: { type: 'string' },
          date: { type: 'string', format: 'date-time' },
          label: { type: 'string' },
          debit: { type: 'string' },
          credit: { type: 'string' },
          taxCode: { type: 'string', nullable: true },
        },
        required: ['account', 'date', 'label', 'debit', 'credit'],
      },
    },
  },
  required: ['JournalItems'],
};

function buildSystemInstruction(opts: {
  country: string;
  region: string;
  aiGuide?: string;
  filteredAccounts: { code: string; name: string }[];
  taxCodeInfo: any[];
}): string {
  const { country, region, aiGuide, filteredAccounts, taxCodeInfo } = opts;

  return `You are an expert accountant in ${region}, ${country} tasked with creating journal entries based on bank statements and payments.
Analyze the attached statement PDF and output the results in JSON format with the proper account codes and tax information.

## Available Account Types:
\`\`\`json
${JSON.stringify(filteredAccounts, null, 2)}
\`\`\`

## Tax Code System:
For transactions involving GST/HST, assign the appropriate tax code. The system will automatically split the amount into base + tax and create virtual tax account entries.

Available Tax Codes for ${region}:
\`\`\`json
${JSON.stringify(taxCodeInfo, null, 2)}
\`\`\`

## GST/HST Payments to CRA:
When you see payments to "CRA", "Canada Revenue Agency", or "Receiver General":
- Use account code "GST-INSTALMENT" (special code for tax payments)
- Do NOT apply a taxCode to these transactions

## Instructions:
For each transaction, generate a journal entry with:
1. **account**: Account type CODE from the list above
2. **date**: Transaction date in ISO 8601 format
3. **label**: Description of the transaction
4. **debit**: Debit amount as string ("0" if not applicable)
5. **credit**: Credit amount as string ("0" if not applicable)
6. **taxCode**: Tax code if applicable (e.g., "GST5", "HST13")

Guidelines:
- Only use accounts from the provided Chart of Accounts
- Add taxCode only when a transaction is taxable
- Do not calculate tax amounts — just provide the tax code
- Ensure dates are valid ISO 8601
${aiGuide ? `\n## Business-Specific Guidelines:\n${aiGuide}\n` : ''}`;
}

export default handleAIJournalGeneration;
