import { Resend } from "resend";
import { config } from "../config/env.js";

const resend = new Resend(config.RESEND_API_KEY);

type SendEmailOptions = {
  to: string | string[];
  subject: string;
  html: string;
};

export const sendEmail = async ({ to, subject, html }: SendEmailOptions) => {
  try {
    if (process.env.RESEND_SKIP_EMAIL === "true") {
      console.log("Email skipped (RESEND_SKIP_EMAIL=true)", { to, subject });
      return { skipped: true } as const;
    }

    if (!config.RESEND_API_KEY) {
      throw new Error("RESEND_API_KEY is not configured");
    }

    const devRecipient = process.env.RESEND_TEST_RECIPIENT?.trim();
    const finalRecipient =
      config.NODE_ENV === "development" && devRecipient ? devRecipient : to;

    const data = await resend.emails.send({
      from: "onboarding@resend.dev",
      to: finalRecipient,
      subject,
      html
    });

    console.log("Email sent:", data);
    return data;
  } catch (error) {
    console.error("Email error:", error);
    throw error;
  }
};
