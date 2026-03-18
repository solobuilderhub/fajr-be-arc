/**
 * Better Auth Configuration
 *
 * Authentication and organization management for Fajr accounting platform.
 * Routes are registered automatically at /api/auth/*
 */

import { betterAuth } from 'better-auth';
import mongoose from 'mongoose';
import { mongodbAdapter } from 'better-auth/adapters/mongodb';
import { organization } from 'better-auth/plugins/organization';
import { bearer } from 'better-auth/plugins/bearer';
import { admin as adminPlugin } from 'better-auth/plugins/admin';
import { adminAc, userAc } from 'better-auth/plugins/admin/access';
import config from '#config/index.js';
import { ac, admin, staff, member } from './access-control.js';
import { cleanupOrganizationData } from './org-cleanup.js';
import {
  sendResetPasswordEmail,
  sendInvitationEmail,
  sendChangeEmailVerification,
} from './email.js';

let _auth: any = null;

/**
 * Get the Better Auth instance (lazy singleton)
 */
export function getAuth() {
  if (config.isProd && !process.env.BETTER_AUTH_SECRET) {
    throw new Error(
      'BETTER_AUTH_SECRET is required in production (min 32 chars)',
    );
  }

  if (!_auth) {
    _auth = betterAuth({
      secret: config.betterAuth.secret,
      baseURL:
        process.env.BETTER_AUTH_URL ||
        `http://localhost:${config.server.port}`,
      basePath: '/api/auth',

      database: mongodbAdapter(mongoose.connection.getClient().db() as any),

      user: {
        additionalFields: {
          roles: {
            type: 'string[]',
            defaultValue: ['user'],
            required: false,
            input: false,
          },
        },
        changeEmail: {
          enabled: true,
          sendChangeEmailVerification: async ({ user, newEmail, url }: { user: { email: string; name: string }; newEmail: string; url: string }) => {
            await sendChangeEmailVerification(user, newEmail, url);
          },
        },
        deleteUser: {
          enabled: true,
        },
      },

      emailAndPassword: {
        enabled: true,
        minPasswordLength: 6,
        sendResetPassword: async ({ user, url }) => {
          await sendResetPasswordEmail(user, url);
        },
      },

      ...(process.env.GOOGLE_CLIENT_ID && process.env.GOOGLE_CLIENT_SECRET
        ? {
            socialProviders: {
              google: {
                clientId: process.env.GOOGLE_CLIENT_ID,
                clientSecret: process.env.GOOGLE_CLIENT_SECRET,
              },
            },
          }
        : {}),

      plugins: [
        bearer(),
        adminPlugin({
          defaultRole: 'user',
          adminRoles: ['superadmin'],
          roles: {
            superadmin: adminAc,
            user: userAc,
          },
        }),
        organization({
          allowUserToCreateOrganization: true,
          creatorRole: 'admin',
          membershipLimit: 500,
          ac,
          roles: { admin, staff, member },
          schema: {
            member: {
              additionalFields: {
                phone: {
                  type: 'string',
                  required: false,
                },
                status: {
                  type: 'string',
                  required: false,
                  defaultValue: 'active',
                },
              },
            },
          },
          sendInvitationEmail: async (data) => {
            await sendInvitationEmail(data);
          },
          organizationHooks: {
            afterDeleteOrganization: async ({ organization, user }) => {
              await cleanupOrganizationData(organization.id, organization.name);
            },
          },
        }),
      ],

      session: {
        expiresIn: 60 * 60 * 24 * 7,
        updateAge: 60 * 60 * 24,
        cookieCache: {
          enabled: true,
          maxAge: 5 * 60,
        },
      },

      trustedOrigins: config.isDev ? ['*'] : [config.frontend.url],

      advanced: {
        crossSubDomainCookies: {
          enabled: !!process.env.COOKIE_DOMAIN,
          domain: process.env.COOKIE_DOMAIN,
        },
        ...(process.env.COOKIE_DOMAIN
          ? {
              defaultCookieAttributes: {
                domain: process.env.COOKIE_DOMAIN,
                sameSite: 'none' as const,
                secure: true,
              },
            }
          : {}),
      },

      rateLimit: {
        enabled: config.isProd,
      },
    });

    // Register stub Mongoose models for Better Auth's collections
    const baCollections = [
      'user',
      'organization',
      'member',
      'invitation',
      'session',
      'account',
    ];
    for (const name of baCollections) {
      if (!mongoose.models[name]) {
        mongoose.model(
          name,
          new mongoose.Schema({}, { strict: false, collection: name }),
        );
      }
    }
  }

  return _auth;
}

export type AuthInstance = ReturnType<typeof getAuth>;
export default getAuth;
