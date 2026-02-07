import {
  generateOTP,
  generateToken,
  getOTPExpiry,
  getResetTokenExpiry,
  isExpired,
} from "../../lib/utils";

describe("Utility Functions", () => {
  describe("generateOTP", () => {
    it("should generate a 6-digit OTP", () => {
      const otp = generateOTP();
      
      expect(otp).toHaveLength(6);
      expect(otp).toMatch(/^\d{6}$/);
    });

    it("should generate different OTPs on multiple calls", () => {
      const otps = new Set<string>();
      
      for (let i = 0; i < 100; i++) {
        otps.add(generateOTP());
      }
      
      // Should have multiple unique values (statistically very unlikely to be all same)
      expect(otps.size).toBeGreaterThan(90);
    });

    it("should only contain numeric characters", () => {
      for (let i = 0; i < 50; i++) {
        const otp = generateOTP();
        expect(Number.isInteger(parseInt(otp, 10))).toBe(true);
        expect(parseInt(otp, 10)).toBeGreaterThanOrEqual(100000);
        expect(parseInt(otp, 10)).toBeLessThanOrEqual(999999);
      }
    });
  });

  describe("generateToken", () => {
    it("should generate a 64-character hex token", () => {
      const token = generateToken();
      
      expect(token).toHaveLength(64);
      expect(token).toMatch(/^[a-f0-9]{64}$/);
    });

    it("should generate unique tokens", () => {
      const tokens = new Set<string>();
      
      for (let i = 0; i < 100; i++) {
        tokens.add(generateToken());
      }
      
      expect(tokens.size).toBe(100);
    });
  });

  describe("getOTPExpiry", () => {
    it("should return a date 10 minutes in the future", () => {
      const beforeCall = Date.now();
      const expiry = getOTPExpiry();
      const afterCall = Date.now();

      const expectedMinTime = beforeCall + 10 * 60 * 1000;
      const expectedMaxTime = afterCall + 10 * 60 * 1000;

      expect(expiry.getTime()).toBeGreaterThanOrEqual(expectedMinTime);
      expect(expiry.getTime()).toBeLessThanOrEqual(expectedMaxTime);
    });

    it("should return a Date object", () => {
      const expiry = getOTPExpiry();
      expect(expiry).toBeInstanceOf(Date);
    });
  });

  describe("getResetTokenExpiry", () => {
    it("should return a date 1 hour in the future", () => {
      const beforeCall = Date.now();
      const expiry = getResetTokenExpiry();
      const afterCall = Date.now();

      const expectedMinTime = beforeCall + 60 * 60 * 1000;
      const expectedMaxTime = afterCall + 60 * 60 * 1000;

      expect(expiry.getTime()).toBeGreaterThanOrEqual(expectedMinTime);
      expect(expiry.getTime()).toBeLessThanOrEqual(expectedMaxTime);
    });

    it("should return a Date object", () => {
      const expiry = getResetTokenExpiry();
      expect(expiry).toBeInstanceOf(Date);
    });
  });

  describe("isExpired", () => {
    it("should return true for past dates", () => {
      const pastDate = new Date(Date.now() - 1000); // 1 second ago
      expect(isExpired(pastDate)).toBe(true);
    });

    it("should return false for future dates", () => {
      const futureDate = new Date(Date.now() + 60000); // 1 minute from now
      expect(isExpired(futureDate)).toBe(false);
    });

    it("should work with OTP expiry dates", () => {
      const validExpiry = getOTPExpiry();
      expect(isExpired(validExpiry)).toBe(false);
    });

    it("should work with reset token expiry dates", () => {
      const validExpiry = getResetTokenExpiry();
      expect(isExpired(validExpiry)).toBe(false);
    });

    it("should correctly identify expired dates", () => {
      const expiredOtp = new Date(Date.now() - 11 * 60 * 1000); // 11 minutes ago
      expect(isExpired(expiredOtp)).toBe(true);
    });
  });
});
