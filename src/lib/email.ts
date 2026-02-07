import nodemailer from "nodemailer";

// Create transporter
const transporter = nodemailer.createTransport({
  host: process.env.EMAIL_HOST,
  port: parseInt(process.env.EMAIL_PORT || "587"),
  secure: false,
  auth: {
    user: process.env.EMAIL_USER,
    pass: process.env.EMAIL_PASSWORD,
  },
});

export const sendOTPEmail = async (
  email: string,
  otp: string,
  name: string,
): Promise<{ success: boolean; error?: string }> => {
  try {
    const mailOptions = {
      from: process.env.EMAIL_FROM,
      to: email,
      subject: "Email Verification - DailySync",
      html: `
      <!DOCTYPE html>
      <html>
        <head>
          <meta charset="UTF-8">
          <meta name="viewport" content="width=device-width, initial-scale=1.0">
        </head>
        <body style="font-family: Arial, sans-serif; line-height: 1.6; color: #1e293b; margin: 0; padding: 0; background-color: #f1f5f9;">
          <div style="max-width: 600px; margin: 20px auto; background-color: white; border-radius: 12px; overflow: hidden; box-shadow: 0 4px 6px rgba(0,0,0,0.1);">
            <div style="background: linear-gradient(135deg, #0ea5e9 0%, #8b5cf6 100%); color: white; padding: 30px 20px; text-align: center;">
              <h1 style="margin: 0; font-size: 28px; font-weight: bold;">DailySync</h1>
            </div>
            <div style="padding: 40px 30px; background-color: #ffffff;">
              <h2 style="color: #1e293b; margin-top: 0; font-size: 24px;">Hello ${name}!</h2>
              <p style="color: #475569; font-size: 16px; margin: 16px 0;">Thank you for registering with DailySync. Please use the following OTP to verify your email address:</p>
              <div style="background: white; border: 3px solid #0ea5e9; padding: 20px; text-align: center; font-size: 36px; font-weight: bold; letter-spacing: 12px; margin: 30px 0; border-radius: 8px; color: #0ea5e9;">${otp}</div>
              <p style="color: #f59e0b; font-size: 14px; background: #fef3c7; padding: 12px; border-radius: 6px; border-left: 4px solid #f59e0b;">⏱️ This OTP will expire in 10 minutes.</p>
              <p style="color: #64748b; font-size: 14px; margin: 20px 0;">If you didn't create an account with us, please ignore this email.</p>
            </div>
            <div style="text-align: center; padding: 20px; background-color: #f8fafc; color: #64748b; font-size: 12px;">
              <p style="margin: 0;">&copy; 2026 DailySync. All rights reserved.</p>
            </div>
          </div>
        </body>
      </html>
    `,
    };

    await transporter.sendMail(mailOptions);
    return { success: true };
  } catch (error: any) {
    return { success: false, error: error.message || "Email sending failed" };
  }
};

export const sendPasswordResetEmail = async (
  email: string,
  resetToken: string,
  name: string,
): Promise<{ success: boolean; error?: string }> => {
  try {
    const resetUrl = `${process.env.FRONTEND_URL}/reset-password?token=${resetToken}`;

    const mailOptions = {
      from: process.env.EMAIL_FROM,
      to: email,
      subject: "Password Reset Request - DailySync",
      html: `
      <!DOCTYPE html>
      <html>
        <head>
          <meta charset="UTF-8">
          <meta name="viewport" content="width=device-width, initial-scale=1.0">
        </head>
        <body style="font-family: Arial, sans-serif; line-height: 1.6; color: #1e293b; margin: 0; padding: 0; background-color: #f1f5f9;">
          <div style="max-width: 600px; margin: 20px auto; background-color: white; border-radius: 12px; overflow: hidden; box-shadow: 0 4px 6px rgba(0,0,0,0.1);">
            <div style="background: linear-gradient(135deg, #0ea5e9 0%, #8b5cf6 100%); color: white; padding: 30px 20px; text-align: center;">
              <h1 style="margin: 0; font-size: 28px; font-weight: bold;">DailySync</h1>
            </div>
            <div style="padding: 40px 30px; background-color: #ffffff;">
              <h2 style="color: #1e293b; margin-top: 0; font-size: 24px;">Hello ${name}!</h2>
              <p style="color: #475569; font-size: 16px; margin: 16px 0;">We received a request to reset your password for your DailySync account.</p>
              <p style="color: #475569; font-size: 16px; margin: 16px 0;">Click the button below to reset your password:</p>
              <div style="text-align: center; margin: 30px 0;">
                <a href="${resetUrl}" style="display: inline-block; background: linear-gradient(135deg, #0ea5e9 0%, #8b5cf6 100%); color: white; padding: 16px 40px; text-decoration: none; border-radius: 8px; font-weight: bold; font-size: 16px; box-shadow: 0 4px 6px rgba(14, 165, 233, 0.3);">Reset Password</a>
              </div>
              <p style="color: #64748b; font-size: 14px; margin: 16px 0;">Or copy and paste this link in your browser:</p>
              <div style="background: #f1f5f9; padding: 12px; border-radius: 6px; word-break: break-all; font-size: 13px; color: #0ea5e9;">${resetUrl}</div>
              <p style="color: #f59e0b; font-size: 14px; background: #fef3c7; padding: 12px; border-radius: 6px; border-left: 4px solid #f59e0b; margin: 20px 0;">⚠️ <strong>Security Notice:</strong> This link will expire in 1 hour.</p>
              <p style="color: #64748b; font-size: 14px; margin: 16px 0;">If you didn't request a password reset, please ignore this email or contact support if you have concerns.</p>
            </div>
            <div style="text-align: center; padding: 20px; background-color: #f8fafc; color: #64748b; font-size: 12px;">
              <p style="margin: 0;">&copy; 2026 DailySync. All rights reserved.</p>
            </div>
          </div>
        </body>
      </html>
    `,
    };

    await transporter.sendMail(mailOptions);
    return { success: true };
  } catch (error: any) {
    return { success: false, error: error.message || "Email sending failed" };
  }
};

export const sendPasswordChangedEmail = async (
  email: string,
  name: string,
): Promise<{ success: boolean; error?: string }> => {
  try {
    const mailOptions = {
      from: process.env.EMAIL_FROM,
      to: email,
      subject: "Password Changed Successfully - DailySync",
      html: `
      <!DOCTYPE html>
      <html>
        <head>
          <meta charset="UTF-8">
          <meta name="viewport" content="width=device-width, initial-scale=1.0">
        </head>
        <body style="font-family: Arial, sans-serif; line-height: 1.6; color: #1e293b; margin: 0; padding: 0; background-color: #f1f5f9;">
          <div style="max-width: 600px; margin: 20px auto; background-color: white; border-radius: 12px; overflow: hidden; box-shadow: 0 4px 6px rgba(0,0,0,0.1);">
            <div style="background: linear-gradient(135deg, #10b981 0%, #059669 100%); color: white; padding: 30px 20px; text-align: center;">
              <h1 style="margin: 0; font-size: 28px; font-weight: bold;">✓ Password Changed</h1>
            </div>
            <div style="padding: 40px 30px; background-color: #ffffff;">
              <h2 style="color: #1e293b; margin-top: 0; font-size: 24px;">Hello ${name}!</h2>
              <p style="color: #475569; font-size: 16px; margin: 16px 0;">This is to confirm that your password has been changed successfully.</p>
              <div style="background: #dbeafe; padding: 15px; border-left: 4px solid #3b82f6; margin: 20px 0; border-radius: 6px;">
                <strong style="color: #1e40af;">ℹ️ Important:</strong><span style="color: #1e40af;"> If you didn't make this change, please contact our support team immediately.</span>
              </div>
              <p style="color: #475569; font-size: 16px; margin: 16px 0;">For your security, you may want to:</p>
              <ul style="color: #475569; font-size: 15px; line-height: 1.8;">
                <li>Review recent account activity</li>
                <li>Update your password on other sites if you used the same password</li>
                <li>Enable two-factor authentication</li>
              </ul>
            </div>
            <div style="text-align: center; padding: 20px; background-color: #f8fafc; color: #64748b; font-size: 12px;">
              <p style="margin: 0;">&copy; 2026 DailySync. All rights reserved.</p>
            </div>
          </div>
        </body>
      </html>
    `,
    };

    await transporter.sendMail(mailOptions);
    return { success: true };
  } catch (error: any) {
    return { success: false, error: "Email confirmation not sent" };
  }
};
