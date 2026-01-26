/**
 * Environment Loader
 *
 * MUST be imported FIRST before any other imports.
 * Loads .env files based on NODE_ENV.
 *
 * Usage:
 *   import './config/env.js';  // First line of entry point
 */

import dotenv from 'dotenv';
import { existsSync } from 'node:fs';
import { resolve } from 'node:path';

/**
 * Normalize environment string to short form
 */
function normalizeEnv(env: string | undefined): string {
  const normalized = (env || '').toLowerCase();
  if (normalized === 'production' || normalized === 'prod') return 'prod';
  if (normalized === 'test' || normalized === 'qa') return 'test';
  return 'dev';
}

// Determine environment
const env = normalizeEnv(process.env.NODE_ENV);

// Load environment-specific .env file
const envFile = resolve(process.cwd(), `.env.${env}`);
const defaultEnvFile = resolve(process.cwd(), '.env');

if (existsSync(envFile)) {
  dotenv.config({ path: envFile });
  console.log(`📄 Loaded: .env.${env}`);
} else if (existsSync(defaultEnvFile)) {
  dotenv.config({ path: defaultEnvFile });
  console.log('📄 Loaded: .env');
} else if (env !== 'prod') {
  // Only warn in non-production; production uses injected env vars
  console.warn('⚠️  No .env file found');
}

// Export for reference
export const ENV = env;
