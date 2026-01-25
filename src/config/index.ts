/**
 * Application Configuration
 *
 * All config is loaded from environment variables.
 * ENV file is loaded by config/env.ts (imported first in entry points).
 */

export interface AppConfig {
  env: string;
  server: {
    port: number;
    host: string;
  };
  jwt: {
    secret: string;
    refreshSecret: string;
    expiresIn: string;
  };
  cors: {
    origins: string[] | true;
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

  server: {
    port: parseInt(process.env.PORT || '8040', 10),
    host: process.env.HOST || '0.0.0.0',
  },

  jwt: {
    secret: process.env.JWT_SECRET || 'dev-secret-change-in-production-min-32',
    refreshSecret: process.env.JWT_REFRESH_SECRET || 'dev-refresh-secret-change-in-production-min-32',
    expiresIn: process.env.JWT_EXPIRES_IN || '7d',
  },

  cors: {
    origins:
      process.env.CORS_ORIGINS === '*'
        ? true
        : (process.env.CORS_ORIGINS || 'http://localhost:3000').split(','),
  },

  database: {
    uri: process.env.MONGODB_URI || 'mongodb://localhost:27017/fajr-be-arc',
  },

  org: {
    header: process.env.ORG_HEADER || 'x-organization-id',
  },
};

export default config;
