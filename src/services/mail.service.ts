import { Resend } from 'resend';
import { config } from '../config/env.js';
import { logger } from '../lib/logger.js';

const resend = new Resend(config.RESEND_API_KEY);

type SendEmailOptions = {
  to: string | string[];
  subject: string;
  html: string;
};

export const sendEmail = async ({ to, subject, html }: SendEmailOptions) => {
  try {
    if (process.env.RESEND_SKIP_EMAIL === 'true') {
      logger.info('mail.skipped', { to, subject });
      return { skipped: true } as const;
    }

    if (!config.RESEND_API_KEY) {
      throw new Error('RESEND_API_KEY is not configured');
    }

    const devRecipient = process.env.RESEND_TEST_RECIPIENT?.trim();
    const finalRecipient = config.NODE_ENV === 'development' && devRecipient ? devRecipient : to;

    const data = await resend.emails.send({
      from: 'onboarding@resend.dev',
      to: finalRecipient,
      subject,
      html,
    });

    logger.info('mail.sent', { data });
    return data;
  } catch (error) {
    logger.error('mail.send_failed', { error });
    throw error;
  }
};
