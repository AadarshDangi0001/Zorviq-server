import nodemailer from 'nodemailer';
import { config } from '../config/env.js';
import { logger } from '../lib/logger.js';

const transporter = nodemailer.createTransport({
  host: config.SMTP_HOST,
  port: config.SMTP_PORT,
  secure: config.SMTP_SECURE,
  auth:
    config.SMTP_USER && config.SMTP_PASS
      ? {
          user: config.SMTP_USER,
          pass: config.SMTP_PASS,
        }
      : undefined,
});

type SendEmailOptions = {
  to: string | string[];
  subject: string;
  html: string;
};

export const sendEmail = async ({ to, subject, html }: SendEmailOptions) => {
  try {
    if (process.env.SMTP_SKIP_EMAIL === 'true') {
      logger.info('mail.skipped', { to, subject });
      return { skipped: true } as const;
    }

    if (!config.SMTP_HOST || !config.SMTP_FROM) {
      throw new Error('SMTP_HOST and SMTP_FROM must be configured');
    }

    const devRecipient = process.env.SMTP_TEST_RECIPIENT?.trim();
    const finalRecipient = config.NODE_ENV === 'development' && devRecipient ? devRecipient : to;

    const data = await transporter.sendMail({
      from: config.SMTP_FROM,
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
