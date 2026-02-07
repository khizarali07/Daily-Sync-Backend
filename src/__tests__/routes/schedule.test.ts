import request from "supertest";
import { createApp } from "../../app";
import { generateTestToken, createTestTaskTemplate } from "../helpers/testUtils";
import prisma from "../../lib/prisma";
import path from "path";

// Mock the prisma client
jest.mock("../../lib/prisma", () => ({
  __esModule: true,
  default: {
    taskTemplate: {
      findMany: jest.fn(),
      findFirst: jest.fn(),
      create: jest.fn(),
      delete: jest.fn(),
    },
    $transaction: jest.fn(),
  },
}));

const app = createApp();

describe("Schedule Routes", () => {
  const token = generateTestToken("test-user-id-123");

  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe("POST /api/schedule/upload", () => {
    it("should upload CSV and create templates", async () => {
      const mockTemplates = [
        createTestTaskTemplate({ id: "t1", name: "Morning Prayer", time: "06:00" }),
        createTestTaskTemplate({ id: "t2", name: "Workout", time: "07:00" }),
      ];

      (prisma.$transaction as jest.Mock).mockResolvedValue(mockTemplates);

      const csvContent = `name,time,category,description,daysOfWeek
Morning Prayer,06:00,Prayer,Start the day,MON,TUE,WED,THU,FRI
Workout,07:00,Exercise,Morning exercise,`;

      const response = await request(app)
        .post("/api/schedule/upload")
        .set("Authorization", `Bearer ${token}`)
        .attach("file", Buffer.from(csvContent), "schedule.csv");

      expect(response.status).toBe(201);
      expect(response.body.message).toContain("Successfully created");
      expect(response.body.templates).toHaveLength(2);
    });

    it("should return 400 when no file uploaded", async () => {
      const response = await request(app)
        .post("/api/schedule/upload")
        .set("Authorization", `Bearer ${token}`);

      expect(response.status).toBe(400);
      expect(response.body.error).toContain("No file");
    });

    it("should return 401 without authentication", async () => {
      const response = await request(app)
        .post("/api/schedule/upload")
        .attach("file", Buffer.from("name,time\nTest,09:00"), "schedule.csv");

      expect(response.status).toBe(401);
    });

    it("should return error for empty CSV", async () => {
      const csvContent = `name,time,category`;

      const response = await request(app)
        .post("/api/schedule/upload")
        .set("Authorization", `Bearer ${token}`)
        .attach("file", Buffer.from(csvContent), "schedule.csv");

      expect(response.status).toBe(400);
      expect(response.body.error).toContain("empty");
    });
  });

  describe("GET /api/schedule/templates", () => {
    it("should return all templates for the user", async () => {
      const mockTemplates = [
        createTestTaskTemplate({ id: "t1", name: "Morning Prayer", time: "06:00" }),
        createTestTaskTemplate({ id: "t2", name: "Workout", time: "07:00" }),
        createTestTaskTemplate({ id: "t3", name: "Study", time: "10:00" }),
      ];

      (prisma.taskTemplate.findMany as jest.Mock).mockResolvedValue(mockTemplates);

      const response = await request(app)
        .get("/api/schedule/templates")
        .set("Authorization", `Bearer ${token}`);

      expect(response.status).toBe(200);
      expect(response.body.templates).toHaveLength(3);
      expect(prisma.taskTemplate.findMany).toHaveBeenCalledWith({
        where: { userId: "test-user-id-123" },
        orderBy: { time: "asc" },
      });
    });

    it("should return empty array for user with no templates", async () => {
      (prisma.taskTemplate.findMany as jest.Mock).mockResolvedValue([]);

      const response = await request(app)
        .get("/api/schedule/templates")
        .set("Authorization", `Bearer ${token}`);

      expect(response.status).toBe(200);
      expect(response.body.templates).toHaveLength(0);
    });

    it("should return 401 without authentication", async () => {
      const response = await request(app).get("/api/schedule/templates");

      expect(response.status).toBe(401);
    });
  });

  describe("POST /api/schedule/templates", () => {
    it("should create a single template", async () => {
      const newTemplate = createTestTaskTemplate({
        id: "new-template-id",
        name: "Evening Walk",
        time: "18:00",
        category: "Exercise",
      });

      (prisma.taskTemplate.create as jest.Mock).mockResolvedValue(newTemplate);

      const response = await request(app)
        .post("/api/schedule/templates")
        .set("Authorization", `Bearer ${token}`)
        .send({
          name: "Evening Walk",
          time: "18:00",
          category: "Exercise",
          daysOfWeek: "MON,WED,FRI",
        });

      expect(response.status).toBe(201);
      expect(response.body.template.name).toBe("Evening Walk");
    });

    it("should return 400 for invalid time format", async () => {
      const response = await request(app)
        .post("/api/schedule/templates")
        .set("Authorization", `Bearer ${token}`)
        .send({
          name: "Invalid Task",
          time: "25:00", // Invalid time
        });

      expect(response.status).toBe(400);
    });

    it("should return 400 for missing name", async () => {
      const response = await request(app)
        .post("/api/schedule/templates")
        .set("Authorization", `Bearer ${token}`)
        .send({
          time: "09:00",
        });

      expect(response.status).toBe(400);
    });
  });

  describe("DELETE /api/schedule/templates/:id", () => {
    it("should delete a template", async () => {
      const mockTemplate = createTestTaskTemplate({ id: "template-to-delete" });

      (prisma.taskTemplate.findFirst as jest.Mock).mockResolvedValue(mockTemplate);
      (prisma.taskTemplate.delete as jest.Mock).mockResolvedValue(mockTemplate);

      const response = await request(app)
        .delete("/api/schedule/templates/template-to-delete")
        .set("Authorization", `Bearer ${token}`);

      expect(response.status).toBe(200);
      expect(response.body.message).toContain("deleted");
    });

    it("should return 404 for non-existent template", async () => {
      (prisma.taskTemplate.findFirst as jest.Mock).mockResolvedValue(null);

      const response = await request(app)
        .delete("/api/schedule/templates/nonexistent-id")
        .set("Authorization", `Bearer ${token}`);

      expect(response.status).toBe(404);
    });

    it("should not delete template belonging to another user", async () => {
      // Template exists but belongs to a different user
      (prisma.taskTemplate.findFirst as jest.Mock).mockResolvedValue(null);

      const response = await request(app)
        .delete("/api/schedule/templates/other-users-template")
        .set("Authorization", `Bearer ${token}`);

      expect(response.status).toBe(404);
    });
  });
});
