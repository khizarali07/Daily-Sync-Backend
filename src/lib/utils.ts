import crypto from "crypto";

/**
 * Generate a 6-digit OTP
 */
export const generateOTP = (): string => {
  return Math.floor(100000 + Math.random() * 900000).toString();
};

/**
 * Generate a secure random token
 */
export const generateToken = (): string => {
  return crypto.randomBytes(32).toString("hex");
};

/**
 * Get OTP expiry time (10 minutes from now)
 */
export const getOTPExpiry = (): Date => {
  return new Date(Date.now() + 10 * 60 * 1000); // 10 minutes
};

/**
 * Get reset token expiry time (1 hour from now)
 */
export const getResetTokenExpiry = (): Date => {
  return new Date(Date.now() + 60 * 60 * 1000); // 1 hour
};

/**
 * Check if a date has expired
 */
export const isExpired = (date: Date): boolean => {
  return new Date() > date;
};
