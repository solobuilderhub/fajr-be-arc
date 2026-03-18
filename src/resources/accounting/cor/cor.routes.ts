/**
 * COR File Routes
 *
 * Upload and parse Canadian COR (.cor) tax files.
 * Returns structured data (corporation info, schedules, accounts)
 * for frontend display and subsequent import to journal entries.
 *
 * Endpoints:
 *   POST /cor/parse  — Upload & parse a .cor file (multipart/form-data)
 */

import type { FastifyPluginAsync } from 'fastify';
import { CORParser } from '@classytic/ledger-ca/cor';

const corRoutes: FastifyPluginAsync = async (fastify) => {
  // Require authentication for all COR routes
  const authenticate = (fastify as any).authenticate;
  if (authenticate) {
    fastify.addHook('preHandler', authenticate);
  }

  // POST /cor/parse — Upload and parse a COR file
  fastify.post('/parse', async (req: any, reply) => {
    const orgId = req.scope?.organizationId;
    if (!orgId) {
      return reply.status(400).send({ error: 'Organization context required' });
    }

    // Get uploaded file via @fastify/multipart
    const file = await req.file();
    if (!file) {
      return reply
        .status(400)
        .send({ error: 'Please upload a COR file using field name "file"' });
    }

    const { filename } = file;
    if (!filename.toLowerCase().endsWith('.cor')) {
      return reply.status(400).send({ error: 'Please upload a valid .cor file' });
    }

    // Read file buffer
    const chunks: Buffer[] = [];
    for await (const chunk of file.file) {
      chunks.push(chunk);
    }
    const corContent = Buffer.concat(chunks).toString('utf-8');

    // Parse with CORParser from @classytic/ledger-ca
    const parser = new CORParser();
    let corData;
    try {
      corData = parser.parse(corContent);
    } catch (err: any) {
      return reply
        .status(400)
        .send({ error: `Failed to parse COR file: ${err.message}` });
    }

    const summary = parser.generateSummary(corData);
    const schedules = parser.generateSchedules(corData);
    const validation = parser.validateCORData(corData);

    // Structure response for frontend
    const data = {
      fileName: filename,
      parsedAt: new Date().toISOString(),

      validation: {
        isValid: validation.isValid,
        errors: validation.errors ?? [],
        warnings: validation.warnings ?? [],
      },

      corporation: {
        name: corData.header.corporationName,
        number: corData.header.corporationNumber,
        taxYear: corData.header.taxYear,
        fiscalPeriod: {
          start: corData.header.startDate,
          end: corData.header.endDate,
        },
      },

      companyInfo: {
        businessNumber: corData.companyInfo.businessNumber,
        businessDescription: corData.companyInfo.businessDescription,
        address: {
          line1: corData.companyInfo.address?.line1,
          city: corData.companyInfo.address?.city,
          province: corData.companyInfo.address?.province,
          postalCode: corData.companyInfo.address?.postalCode,
          country: corData.companyInfo.address?.country,
        },
        contactEmail: corData.companyInfo.contactEmail,
      },

      directors: corData.directors.map((d: any) => ({
        firstName: d.firstName,
        lastName: d.lastName,
        title: d.title,
        dateOfBirth: d.dateOfBirth,
        isResident: d.isResident ? d.isResident() : d.residency === '1',
      })),

      summary: {
        balanceSheet: summary.financialSummary.balanceSheet,
        incomeStatement: summary.financialSummary.incomeStatement,
        dataQuality: summary.dataQuality,
      },

      schedules: [
        {
          id: 100,
          name: 'Balance Sheet',
          title: 'Schedule 100 - Balance Sheet Information',
          accounts: schedules[100].accounts.map((a: any) => ({
            gifiCode: a.code,
            accountName: a.name,
            value: a.value,
            category: a.category,
            isTotal: a.isTotal,
          })),
          totalAccounts: schedules[100].accounts.length,
        },
        {
          id: 125,
          name: 'Income Statement',
          title: 'Schedule 125 - Income Statement Information',
          accounts: schedules[125].accounts.map((a: any) => ({
            gifiCode: a.code,
            accountName: a.name,
            value: a.value,
            category: a.category,
            isTotal: a.isTotal,
          })),
          totalAccounts: schedules[125].accounts.length,
        },
      ],
    };

    return { success: true, data };
  });
};

export default corRoutes;
