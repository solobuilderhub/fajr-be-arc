/**
 * Email notifications for auth events (password reset, invitations)
 *
 * Uses @classytic/notifications with Gmail SMTP.
 */

import { NotificationService } from '@classytic/notifications';
import { EmailChannel } from '@classytic/notifications/channels';

let _notifications: InstanceType<typeof NotificationService> | null = null;

function getNotifications() {
  if (!_notifications) {
    const user = process.env.SMTP_USER;
    const pass = process.env.SMTP_PASS;
    const service = process.env.EMAIL_SERVICE || 'gmail';

    if (!user || !pass) {
      console.warn('[email] SMTP_USER/SMTP_PASS not set — emails will be logged to console');
      return null;
    }

    _notifications = new NotificationService({
      channels: [
        new EmailChannel({
          from: `Fajr <${user}>`,
          transport: { service, auth: { user, pass } },
        }),
      ],
    });
  }
  return _notifications;
}

/**
 * Send password reset email
 */
export async function sendResetPasswordEmail(user: { email: string; name: string }, url: string) {
  const ns = getNotifications();
  if (!ns) {
    console.log(`[email] Password reset for ${user.email}: ${url}`);
    return;
  }

  await ns.send({
    event: 'auth.reset-password',
    recipient: { email: user.email, name: user.name },
    data: {
      subject: 'Reset your password — Fajr',
      html: `
        <div style="font-family: sans-serif; max-width: 480px; margin: 0 auto;">
          <h2>Password Reset</h2>
          <p>Hi ${user.name || 'there'},</p>
          <p>You requested a password reset. Click the button below to set a new password:</p>
          <p style="text-align: center; margin: 32px 0;">
            <a href="${url}" style="background: #18181b; color: #fff; padding: 12px 24px; border-radius: 6px; text-decoration: none; display: inline-block;">
              Reset Password
            </a>
          </p>
          <p style="color: #666; font-size: 14px;">If you didn't request this, you can safely ignore this email.</p>
          <p style="color: #666; font-size: 14px;">This link expires in 1 hour.</p>
        </div>
      `,
    },
  });

  console.log(`[email] Password reset sent to ${user.email}`);
}

/**
 * Send email change verification
 */
export async function sendChangeEmailVerification(
  user: { email: string; name: string },
  newEmail: string,
  url: string,
) {
  const ns = getNotifications();
  if (!ns) {
    console.log(`[email] Email change verification for ${user.email} → ${newEmail}: ${url}`);
    return;
  }

  await ns.send({
    event: 'auth.change-email',
    recipient: { email: newEmail, name: user.name },
    data: {
      subject: 'Verify your new email — Fajr',
      html: `
        <div style="font-family: sans-serif; max-width: 480px; margin: 0 auto;">
          <h2>Email Change Verification</h2>
          <p>Hi ${user.name || 'there'},</p>
          <p>You requested to change your email from <strong>${user.email}</strong> to <strong>${newEmail}</strong>.</p>
          <p>Click the button below to verify your new email address:</p>
          <p style="text-align: center; margin: 32px 0;">
            <a href="${url}" style="background: #18181b; color: #fff; padding: 12px 24px; border-radius: 6px; text-decoration: none; display: inline-block;">
              Verify New Email
            </a>
          </p>
          <p style="color: #666; font-size: 14px;">If you didn't request this, you can safely ignore this email.</p>
        </div>
      `,
    },
  });

  console.log(`[email] Email change verification sent to ${newEmail}`);
}

/**
 * Send organization invitation email
 */
export async function sendInvitationEmail(data: {
  email: string;
  inviter: { user: { name: string; email: string } };
  organization: { name: string };
  id: string;
  role: string;
}) {
  const ns = getNotifications();
  const inviteLink = `${process.env.FRONTEND_URL || 'http://localhost:3000'}/accept-invitation/${data.id}`;

  if (!ns) {
    console.log(`[email] Invitation for ${data.email} to ${data.organization.name}: ${inviteLink}`);
    return;
  }

  await ns.send({
    event: 'auth.invitation',
    recipient: { email: data.email },
    data: {
      subject: `You've been invited to ${data.organization.name} — Fajr`,
      html: `
        <div style="font-family: sans-serif; max-width: 480px; margin: 0 auto;">
          <h2>Organization Invitation</h2>
          <p>${data.inviter.user.name} invited you to join <strong>${data.organization.name}</strong> as <strong>${data.role}</strong>.</p>
          <p style="text-align: center; margin: 32px 0;">
            <a href="${inviteLink}" style="background: #18181b; color: #fff; padding: 12px 24px; border-radius: 6px; text-decoration: none; display: inline-block;">
              Accept Invitation
            </a>
          </p>
        </div>
      `,
    },
  });

  console.log(`[email] Invitation sent to ${data.email} for org ${data.organization.name}`);
}
