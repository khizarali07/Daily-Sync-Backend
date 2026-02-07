import request from "supertest";
import { createApp } from "../../app";
import { generateTestToken } from "../helpers/testUtils";
import prisma from "../../lib/prisma";

// Mock the prisma client
jest.mock("../../lib/prisma", () => ({
  __esModule: true,
  default: {
    healthMetrics: {
      findUnique: jest.fn(),
      findMany: jest.fn(),
      upsert: jest.fn(),
      delete: jest.fn(),
    },
  },
}));

// Mock fetch for Google Fit API
const mockFetch = jest.fn();
global.fetch = mockFetch;

const app = createApp();

describe("Health Routes", () => {
  const token = generateTestToken("test-user-id-123");

  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe("GET /api/health/today", () => {
    it("should return today's health metrics", async () => {
      const mockMetrics = {
        id: "health-1",
        userId: "test-user-id-123",
        date: new Date(),
        steps: 8500,
        sleepDuration: 7.5,
        avgHeartRate: 72,
        caloriesBurned: 2100,
      };

      (prisma.healthMetrics.findUnique as jest.Mock).mockResolvedValue(mockMetrics);

      const response = await request(app)
        .get("/api/health/today")
        .set("Authorization", `Bearer ${token}`);

      expect(response.status).toBe(200);
      expect(response.body).toHaveProperty("date");
      expect(response.body).toHaveProperty("metrics");
      expect(response.body.metrics.steps).toBe(8500);
    });

    it("should return null metrics when no data exists", async () => {
      (prisma.healthMetrics.findUnique as jest.Mock).mockResolvedValue(null);

      const response = await request(app)
        .get("/api/health/today")
        .set("Authorization", `Bearer ${token}`);

      expect(response.status).toBe(200);
      expect(response.body.metrics).toBeNull();
      expect(response.body.message).toContain("No health data");
    });

    it("should return 401 without authentication", async () => {
      const response = await request(app).get("/api/health/today");

      expect(response.status).toBe(401);
    });
  });

  describe("GET /api/health/:date", () => {
    it("should return health metrics for a specific date", async () => {
      const mockMetrics = {
        id: "health-1",
        userId: "test-user-id-123",
        date: new Date("2026-02-07"),
        steps: 10000,
        sleepDuration: 8,
      };

      (prisma.healthMetrics.findUnique as jest.Mock).mockResolvedValue(mockMetrics);

      const response = await request(app)
        .get("/api/health/2026-02-07")
        .set("Authorization", `Bearer ${token}`);

      expect(response.status).toBe(200);
      expect(response.body.date).toBe("2026-02-07");
      expect(response.body.metrics.steps).toBe(10000);
    });

    it("should return 400 for invalid date format", async () => {
      const response = await request(app)
        .get("/api/health/invalid-date")
        .set("Authorization", `Bearer ${token}`);

      expect(response.status).toBe(400);
      expect(response.body.error).toContain("Invalid date");
    });
  });

  describe("POST /api/health", () => {
    it("should create health metrics", async () => {
      const mockMetrics = {
        id: "new-health-id",
        userId: "test-user-id-123",
        date: new Date("2026-02-07"),
        steps: 5000,
        sleepDuration: 7,
        moodScore: 8,
        source: "manual",
      };

      (prisma.healthMetrics.upsert as jest.Mock).mockResolvedValue(mockMetrics);

      const response = await request(app)
        .post("/api/health")
        .set("Authorization", `Bearer ${token}`)
        .send({
          date: "2026-02-07",
          steps: 5000,
          sleepDuration: 7,
          moodScore: 8,
        });

      expect(response.status).toBe(201);
      expect(response.body.message).toContain("saved");
      expect(response.body.metrics.steps).toBe(5000);
    });

    it("should update existing health metrics", async () => {
      const updatedMetrics = {
        id: "existing-health-id",
        userId: "test-user-id-123",
        date: new Date("2026-02-07"),
        steps: 12000,
        source: "manual",
      };

      (prisma.healthMetrics.upsert as jest.Mock).mockResolvedValue(updatedMetrics);

      const response = await request(app)
        .post("/api/health")
        .set("Authorization", `Bearer ${token}`)
        .send({
          date: "2026-02-07",
          steps: 12000,
        });

      expect(response.status).toBe(201);
      expect(response.body.metrics.steps).toBe(12000);
    });

    it("should return 400 for invalid mood score", async () => {
      const response = await request(app)
        .post("/api/health")
        .set("Authorization", `Bearer ${token}`)
        .send({
          date: "2026-02-07",
          moodScore: 15, // Invalid: should be 1-10
        });

      expect(response.status).toBe(400);
    });

    it("should return 400 for missing date", async () => {
      const response = await request(app)
        .post("/api/health")
        .set("Authorization", `Bearer ${token}`)
        .send({
          steps: 5000,
        });

      expect(response.status).toBe(400);
    });
  });

  describe("POST /api/health/sync/google-fit", () => {
    it("should sync data from Google Fit", async () => {
      const mockStepsResponse = {
        bucket: [{
          startTimeMillis: Date.now().toString(),
          dataset: [{
            point: [{
              value: [{ intVal: 10000 }]
            }]
          }]
        }]
      };

      const mockCaloriesResponse = {
        bucket: [{
          startTimeMillis: Date.now().toString(),
          dataset: [{
            point: [{
              value: [{ fpVal: 2500 }]
            }]
          }]
        }]
      };

      const mockHeartRateResponse = {
        bucket: [{
          startTimeMillis: Date.now().toString(),
          dataset: [{
            point: [{
              value: [{ fpVal: 75 }]
            }]
          }]
        }]
      };

      mockFetch
        .mockResolvedValueOnce({ ok: true, json: async () => mockStepsResponse })
        .mockResolvedValueOnce({ ok: true, json: async () => mockCaloriesResponse })
        .mockResolvedValueOnce({ ok: true, json: async () => mockHeartRateResponse });

      (prisma.healthMetrics.upsert as jest.Mock).mockResolvedValue({});

      const response = await request(app)
        .post("/api/health/sync/google-fit")
        .set("Authorization", `Bearer ${token}`)
        .send({
          accessToken: "mock-google-fit-token",
        });

      expect(response.status).toBe(200);
      expect(response.body.message).toContain("synced");
    });

    it("should return 400 without access token", async () => {
      const response = await request(app)
        .post("/api/health/sync/google-fit")
        .set("Authorization", `Bearer ${token}`)
        .send({});

      expect(response.status).toBe(400);
      expect(response.body.error).toContain("access token");
    });

    it("should handle Google Fit API errors", async () => {
      mockFetch.mockResolvedValueOnce({
        ok: false,
        text: async () => "Invalid credentials",
      });

      const response = await request(app)
        .post("/api/health/sync/google-fit")
        .set("Authorization", `Bearer ${token}`)
        .send({
          accessToken: "invalid-token",
        });

      expect(response.status).toBe(400);
    });
  });

  describe("GET /api/health/stats/weekly", () => {
    it("should return weekly statistics", async () => {
      const mockMetrics = [
        { date: new Date(), steps: 8000, sleepDuration: 7, avgHeartRate: 70, caloriesBurned: 2000 },
        { date: new Date(), steps: 10000, sleepDuration: 8, avgHeartRate: 72, caloriesBurned: 2200 },
        { date: new Date(), steps: 6000, sleepDuration: 6.5, avgHeartRate: 75, caloriesBurned: 1800 },
      ];

      (prisma.healthMetrics.findMany as jest.Mock).mockResolvedValue(mockMetrics);

      const response = await request(app)
        .get("/api/health/stats/weekly")
        .set("Authorization", `Bearer ${token}`);

      expect(response.status).toBe(200);
      expect(response.body.period).toBe("weekly");
      expect(response.body).toHaveProperty("stats");
      expect(response.body.stats).toHaveProperty("totalSteps");
      expect(response.body.stats).toHaveProperty("avgSleepDuration");
      expect(response.body).toHaveProperty("dailyMetrics");
    });

    it("should handle empty data gracefully", async () => {
      (prisma.healthMetrics.findMany as jest.Mock).mockResolvedValue([]);

      const response = await request(app)
        .get("/api/health/stats/weekly")
        .set("Authorization", `Bearer ${token}`);

      expect(response.status).toBe(200);
      expect(response.body.stats.daysTracked).toBe(0);
      expect(response.body.dailyMetrics).toHaveLength(0);
    });
  });

  describe("DELETE /api/health/:date", () => {
    it("should delete health metrics", async () => {
      const mockMetrics = {
        id: "health-to-delete",
        userId: "test-user-id-123",
        date: new Date("2026-02-07"),
      };

      (prisma.healthMetrics.findUnique as jest.Mock).mockResolvedValue(mockMetrics);
      (prisma.healthMetrics.delete as jest.Mock).mockResolvedValue(mockMetrics);

      const response = await request(app)
        .delete("/api/health/2026-02-07")
        .set("Authorization", `Bearer ${token}`);

      expect(response.status).toBe(200);
      expect(response.body.message).toContain("deleted");
    });

    it("should return 404 for non-existent metrics", async () => {
      (prisma.healthMetrics.findUnique as jest.Mock).mockResolvedValue(null);

      const response = await request(app)
        .delete("/api/health/2026-02-07")
        .set("Authorization", `Bearer ${token}`);

      expect(response.status).toBe(404);
    });
  });
});
