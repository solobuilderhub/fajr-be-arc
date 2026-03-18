/**
 * Application Configuration
 *
 * All config is loaded from environment variables.
 * ENV file is loaded by config/env.ts (imported first in entry points).
 */

export interface AppConfig {
  env: string;
  isDev: boolean;
  isProd: boolean;
  server: {
    port: number;
    host: string;
  };
  betterAuth: {
    secret: string;
  };
  frontend: {
    url: string;
  };
  cors: {
    origins: string[] | true;
    methods: string[];
    allowedHeaders: string[];
    credentials: boolean;
  };
  database: {
    uri: string;
  };
  org?: {
    header: string;
  };
}

const config: AppConfig = {
  env: process.env.NODE_ENV || 'development',
  isDev: (process.env.NODE_ENV || 'development') !== 'production',
  isProd: process.env.NODE_ENV === 'production',

  server: {
    port: parseInt(process.env.PORT || '8040', 10),
    host: process.env.HOST || '0.0.0.0',
  },

  betterAuth: {
    secret:
      process.env.BETTER_AUTH_SECRET ||
      'dev-secret-change-in-production-minimum-32-chars-long',
  },

  frontend: {
    url: process.env.FRONTEND_URL || 'http://localhost:3000',
  },

  cors: {
    origins:
      process.env.CORS_ORIGINS === '*'
        ? true
        : (process.env.CORS_ORIGINS || 'http://localhost:3000').split(','),
    methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
    allowedHeaders: ['Content-Type', 'Authorization', 'x-organization-id'],
    credentials: true,
  },

  database: {
    uri: process.env.MONGODB_URI || 'mongodb://localhost:27017/fajr',
  },

  org: {
    header: process.env.ORG_HEADER || 'x-organization-id',
  },
};

export default config;
