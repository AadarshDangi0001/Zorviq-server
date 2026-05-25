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
    if (!config.RESEND_API_KEY) {
      throw new Error("RESEND_API_KEY is not configured");
    }

    const data = await resend.emails.send({
      from: "onboarding@resend.dev",
      to,
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
