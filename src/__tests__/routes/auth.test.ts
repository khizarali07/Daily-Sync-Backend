import request from "supertest";
import { createApp } from "../../app";
import { generateTestToken } from "../helpers/testUtils";
import prisma from "../../lib/prisma";
import bcrypt from "bcryptjs";

// Mock the prisma client
jest.mock("../../lib/prisma", () => ({
  __esModule: true,
  default: {
    user: {
      findUnique: jest.fn(),
      create: jest.fn(),
      update: jest.fn(),
    },
  },
}));

// Mock the email service
jest.mock("../../lib/email", () => ({
  sendOTPEmail: jest.fn().mockResolvedValue(true),
  sendPasswordResetEmail: jest.fn().mockResolvedValue(true),
  sendPasswordChangedEmail: jest.fn().mockResolvedValue(true),
}));

const app = createApp();

describe("Auth Routes", () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe("POST /api/auth/register", () => {
    it("should register a new user successfully", async () => {
      const mockUser = {
        id: "test-user-id",
        email: "newuser@example.com",
        name: "New User",
        emailVerified: false,
        createdAt: new Date(),
      };

      (prisma.user.findUnique as jest.Mock).mockResolvedValue(null);
      (prisma.user.create as jest.Mock).mockResolvedValue(mockUser);

      const response = await request(app)
        .post("/api/auth/register")
        .send({
          email: "newuser@example.com",
          password: "password123",
          name: "New User",
        });

      expect(response.status).toBe(201);
      expect(response.body).toHaveProperty("user");
      expect(response.body).toHaveProperty("token");
      expect(response.body.user.email).toBe("newuser@example.com");
    });

    it("should return 400 if user already exists", async () => {
      (prisma.user.findUnique as jest.Mock).mockResolvedValue({
        id: "existing-id",
        email: "existing@example.com",
      });

      const response = await request(app)
        .post("/api/auth/register")
        .send({
          email: "existing@example.com",
          password: "password123",
          name: "Existing User",
        });

      expect(response.status).toBe(400);
      expect(response.body.error).toBe("User already exists");
    });

    it("should return 400 for invalid email", async () => {
      const response = await request(app)
        .post("/api/auth/register")
        .send({
          email: "invalid-email",
          password: "password123",
          name: "Test User",
        });

      expect(response.status).toBe(400);
    });

    it("should return 400 for password too short", async () => {
      const response = await request(app)
        .post("/api/auth/register")
        .send({
          email: "test@example.com",
          password: "12345",
          name: "Test User",
        });

      expect(response.status).toBe(400);
    });
  });

  describe("POST /api/auth/login", () => {
    it("should login successfully with correct credentials", async () => {
      const hashedPassword = await bcrypt.hash("password123", 10);
      const mockUser = {
        id: "test-user-id",
        email: "test@example.com",
        password: hashedPassword,
        name: "Test User",
        emailVerified: true,
        createdAt: new Date(),
      };

      (prisma.user.findUnique as jest.Mock).mockResolvedValue(mockUser);

      const response = await request(app)
        .post("/api/auth/login")
        .send({
          email: "test@example.com",
          password: "password123",
        });

      expect(response.status).toBe(200);
      expect(response.body).toHaveProperty("user");
      expect(response.body).toHaveProperty("token");
    });

    it("should return 401 for invalid credentials", async () => {
      (prisma.user.findUnique as jest.Mock).mockResolvedValue(null);

      const response = await request(app)
        .post("/api/auth/login")
        .send({
          email: "nonexistent@example.com",
          password: "password123",
        });

      expect(response.status).toBe(401);
      expect(response.body.error).toBe("Invalid credentials");
    });

    it("should return 401 for wrong password", async () => {
      const hashedPassword = await bcrypt.hash("password123", 10);
      (prisma.user.findUnique as jest.Mock).mockResolvedValue({
        id: "test-user-id",
        email: "test@example.com",
        password: hashedPassword,
        emailVerified: true,
      });

      const response = await request(app)
        .post("/api/auth/login")
        .send({
          email: "test@example.com",
          password: "wrongpassword",
        });

      expect(response.status).toBe(401);
      expect(response.body.error).toBe("Invalid credentials");
    });
  });

  describe("GET /api/auth/me", () => {
    it("should return user data with valid token", async () => {
      const mockUser = {
        id: "test-user-id",
        email: "test@example.com",
        name: "Test User",
        emailVerified: true,
        createdAt: new Date(),
      };

      (prisma.user.findUnique as jest.Mock).mockResolvedValue(mockUser);
      const token = generateTestToken("test-user-id");

      const response = await request(app)
        .get("/api/auth/me")
        .set("Authorization", `Bearer ${token}`);

      expect(response.status).toBe(200);
      expect(response.body.user.email).toBe("test@example.com");
    });

    it("should return 401 without token", async () => {
      const response = await request(app).get("/api/auth/me");

      expect(response.status).toBe(401);
      expect(response.body.error).toBe("Authentication required");
    });

    it("should return 401 with invalid token", async () => {
      const response = await request(app)
        .get("/api/auth/me")
        .set("Authorization", "Bearer invalid-token");

      expect(response.status).toBe(401);
    });
  });

  describe("POST /api/auth/verify-email", () => {
    it("should verify email with correct OTP", async () => {
      const mockUser = {
        id: "test-user-id",
        email: "test@example.com",
        otp: "123456",
        otpExpiry: new Date(Date.now() + 10 * 60 * 1000), // Not expired
        emailVerified: false,
      };

      (prisma.user.findUnique as jest.Mock).mockResolvedValue(mockUser);
      (prisma.user.update as jest.Mock).mockResolvedValue({
        ...mockUser,
        emailVerified: true,
        otp: null,
        otpExpiry: null,
      });

      const response = await request(app)
        .post("/api/auth/verify-email")
        .send({
          email: "test@example.com",
          otp: "123456",
        });

      expect(response.status).toBe(200);
      expect(response.body.message).toContain("verified");
    });

    it("should return 400 for invalid OTP", async () => {
      const mockUser = {
        id: "test-user-id",
        email: "test@example.com",
        otp: "123456",
        otpExpiry: new Date(Date.now() + 10 * 60 * 1000),
        emailVerified: false,
      };

      (prisma.user.findUnique as jest.Mock).mockResolvedValue(mockUser);

      const response = await request(app)
        .post("/api/auth/verify-email")
        .send({
          email: "test@example.com",
          otp: "999999",
        });

      expect(response.status).toBe(400);
    });

    it("should return 400 for expired OTP", async () => {
      const mockUser = {
        id: "test-user-id",
        email: "test@example.com",
        otp: "123456",
        otpExpiry: new Date(Date.now() - 10 * 60 * 1000), // Expired
        emailVerified: false,
      };

      (prisma.user.findUnique as jest.Mock).mockResolvedValue(mockUser);

      const response = await request(app)
        .post("/api/auth/verify-email")
        .send({
          email: "test@example.com",
          otp: "123456",
        });

      expect(response.status).toBe(400);
    });
  });

  describe("POST /api/auth/forgot-password", () => {
    it("should send reset email for existing user", async () => {
      const mockUser = {
        id: "test-user-id",
        email: "test@example.com",
      };

      (prisma.user.findUnique as jest.Mock).mockResolvedValue(mockUser);
      (prisma.user.update as jest.Mock).mockResolvedValue(mockUser);

      const response = await request(app)
        .post("/api/auth/forgot-password")
        .send({
          email: "test@example.com",
        });

      expect(response.status).toBe(200);
      expect(response.body.message).toContain("sent");
    });

    it("should return 404 for non-existent user", async () => {
      (prisma.user.findUnique as jest.Mock).mockResolvedValue(null);

      const response = await request(app)
        .post("/api/auth/forgot-password")
        .send({
          email: "nonexistent@example.com",
        });

      expect(response.status).toBe(404);
    });
  });
});
