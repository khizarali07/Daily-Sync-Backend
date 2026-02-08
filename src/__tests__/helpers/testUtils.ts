import { PrismaClient } from "@prisma/client";

// Mock Prisma Client type for testing

export type MockPrismaClient = {
  user: {
    findUnique: jest.Mock;
    findMany: jest.Mock;
    create: jest.Mock;
    update: jest.Mock;
    delete: jest.Mock;
    upsert: jest.Mock;
  };
  taskTemplate: {
    findUnique: jest.Mock;
    findMany: jest.Mock;
    create: jest.Mock;
    createMany: jest.Mock;
    update: jest.Mock;
    delete: jest.Mock;
    deleteMany: jest.Mock;
  };
  taskInstance: {
    findUnique: jest.Mock;
    findMany: jest.Mock;
    create: jest.Mock;
    createMany: jest.Mock;
    update: jest.Mock;
    delete: jest.Mock;
    deleteMany: jest.Mock;
  };
  dailyLog: {
    findUnique: jest.Mock;
    findMany: jest.Mock;
    create: jest.Mock;
    update: jest.Mock;
    upsert: jest.Mock;
    delete: jest.Mock;
  };
  $transaction: jest.Mock;
  $connect: jest.Mock;
  $disconnect: jest.Mock;
};

export const createMockPrisma = (): MockPrismaClient => ({
  user: {
    findUnique: jest.fn(),
    findMany: jest.fn(),
    create: jest.fn(),
    update: jest.fn(),
    delete: jest.fn(),
    upsert: jest.fn(),
  },
  taskTemplate: {
    findUnique: jest.fn(),
    findMany: jest.fn(),
    create: jest.fn(),
    createMany: jest.fn(),
    update: jest.fn(),
    delete: jest.fn(),
    deleteMany: jest.fn(),
  },
  taskInstance: {
    findUnique: jest.fn(),
    findMany: jest.fn(),
    create: jest.fn(),
    createMany: jest.fn(),
    update: jest.fn(),
    delete: jest.fn(),
    deleteMany: jest.fn(),
  },
  dailyLog: {
    findUnique: jest.fn(),
    findMany: jest.fn(),
    create: jest.fn(),
    update: jest.fn(),
    upsert: jest.fn(),
    delete: jest.fn(),
  },
  $transaction: jest.fn((callback) => callback(createMockPrisma())),
  $connect: jest.fn(),
  $disconnect: jest.fn(),
});

// Test user factory
export const createTestUser = (overrides = {}) => ({
  id: "test-user-id-123",
  email: "test@example.com",
  password: "$2b$10$dummyhashedpassword123456789012", // bcrypt hash of "password123"
  name: "Test User",
  emailVerified: true,
  otp: null,
  otpExpiry: null,
  resetPasswordToken: null,
  resetPasswordTokenExpiry: null,
  createdAt: new Date("2026-01-01"),
  updatedAt: new Date("2026-01-01"),
  ...overrides,
});

// Test task template factory
export const createTestTaskTemplate = (overrides = {}) => ({
  id: "test-template-id-123",
  userId: "test-user-id-123",
  name: "Test Task",
  startTime: "09:00",
  endTime: "10:00",
  category: "Test",
  description: "Test description",
  isRecurring: true,
  daysOfWeek: [],
  createdAt: new Date("2026-01-01"),
  updatedAt: new Date("2026-01-01"),
  ...overrides,
});

// Test task instance factory
export const createTestTaskInstance = (overrides = {}) => ({
  id: "test-instance-id-123",
  userId: "test-user-id-123",
  templateId: "test-template-id-123",
  date: new Date(),
  name: "Test Task",
  startTime: "09:00",
  endTime: "10:00",
  category: "Test",
  isCompleted: false,
  completedAt: null,
  notes: null,
  imageUrl: null,
  aiData: null,
  createdAt: new Date("2026-01-01"),
  updatedAt: new Date("2026-01-01"),
  ...overrides,
});

// Generate JWT token for testing
import jwt from "jsonwebtoken";

export const generateTestToken = (userId: string = "test-user-id-123"): string => {
  return jwt.sign({ userId }, process.env.JWT_SECRET || "test-jwt-secret-12345", {
    expiresIn: "7d",
  });
};
