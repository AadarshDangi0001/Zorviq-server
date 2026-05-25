/**
 * Email Templates for Zorviq
 * Cinematic Noir / Premium Minimalist style
 */

const primaryColor = "#00F5FF"; // Electric blue
const bgColor = "#080808";
const cardColor = "#121212";

const baseTemplate = (content: string) => `
<div style="background-color: ${bgColor}; color: #dce4e4; font-family: 'Inter', -apple-system, sans-serif; padding: 40px 20px; line-height: 1.6;">
  <div style="max-width: 600px; margin: 0 auto; background-color: ${cardColor}; border-radius: 16px; border: 1px solid rgba(255,255,255,0.05); overflow: hidden;">
    <div style="padding: 40px; text-align: center; border-bottom: 1px solid rgba(255,255,255,0.05);">
      <h1 style="color: white; margin: 0; font-size: 24px; letter-spacing: 0;">Zorviq</h1>
    </div>
    <div style="padding: 40px;">
      ${content}
    </div>
    <div style="padding: 20px 40px; background-color: rgba(255,255,255,0.02); text-align: center; border-top: 1px solid rgba(255,255,255,0.05);">
      <p style="font-size: 12px; color: #849495; margin: 0;">&copy; 2026 Zorviq. All rights reserved.</p>
    </div>
  </div>
</div>
`;

export const getVerificationEmail = (verifyUrl: string) => baseTemplate(`
  <h2 style="color: white; font-size: 20px; margin-bottom: 20px;">Verify your identity</h2>
  <p>Welcome to the circle of high-performance. Click the button below to verify your account and start your journey.</p>
  <div style="text-align: center; margin: 32px 0;">
    <a href="${verifyUrl}" style="background-color: ${primaryColor}; color: #080808; padding: 14px 32px; border-radius: 8px; text-decoration: none; font-weight: bold; font-size: 14px; display: inline-block;">Verify Email</a>
  </div>
  <p style="font-size: 14px; color: #849495;">If the button doesn't work, copy and paste this link: <br/> <span style="word-break: break-all;">${verifyUrl}</span></p>
  <p style="font-size: 14px; color: #849495; margin-top: 20px;">This link expires in 1 hour.</p>
`);

export const getPasswordResetEmail = (resetUrl: string) => baseTemplate(`
  <h2 style="color: white; font-size: 20px; margin-bottom: 20px;">Reset your password</h2>
  <p>We received a request to reset your password. Click the button below to choose a new one.</p>
  <div style="text-align: center; margin: 32px 0;">
    <a href="${resetUrl}" style="background-color: ${primaryColor}; color: #080808; padding: 14px 32px; border-radius: 8px; text-decoration: none; font-weight: bold; font-size: 14px; display: inline-block;">Reset Password</a>
  </div>
  <p style="font-size: 14px; color: #849495;">If the button doesn't work, copy and paste this link: <br/> <span style="word-break: break-all;">${resetUrl}</span></p>
  <p style="font-size: 14px; color: #849495; margin-top: 20px;">This link expires in 1 hour.</p>
`);
