import request from "supertest";
import { createApp } from "../../app";
import { generateTestToken, createTestTaskInstance, createTestTaskTemplate } from "../helpers/testUtils";
import prisma from "../../lib/prisma";

// Mock the prisma client
jest.mock("../../lib/prisma", () => ({
  __esModule: true,
  default: {
    user: {
      findUnique: jest.fn(),
    },
    taskTemplate: {
      findMany: jest.fn(),
    },
    taskInstance: {
      findUnique: jest.fn(),
      findFirst: jest.fn(),
      findMany: jest.fn(),
      create: jest.fn(),
      createMany: jest.fn(),
      update: jest.fn(),
      delete: jest.fn(),
    },
  },
}));

const app = createApp();

describe("Tasks Routes", () => {
  const token = generateTestToken("test-user-id-123");

  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe("GET /api/tasks/today", () => {
    it("should return today's tasks", async () => {
      const mockTasks = [
        createTestTaskInstance({ id: "task-1", name: "Morning Prayer", startTime: "06:00", endTime: "06:30" }),
        createTestTaskInstance({ id: "task-2", name: "Workout", startTime: "07:00", endTime: "08:00" }),
      ];

      (prisma.taskInstance.findMany as jest.Mock).mockResolvedValue(mockTasks);

      const response = await request(app)
        .get("/api/tasks/today")
        .set("Authorization", `Bearer ${token}`);

      expect(response.status).toBe(200);
      expect(response.body).toHaveProperty("date");
      expect(response.body).toHaveProperty("dayOfWeek");
      expect(response.body).toHaveProperty("tasks");
      expect(response.body.tasks).toHaveLength(2);
    });

    it("should generate tasks from templates if none exist", async () => {
      const mockTemplates = [
        createTestTaskTemplate({ id: "template-1", name: "Morning Prayer", startTime: "06:00", endTime: "06:30" }),
        createTestTaskTemplate({ id: "template-2", name: "Workout", startTime: "07:00", endTime: "08:00" }),
      ];
      const mockTasks = [
        createTestTaskInstance({ id: "task-1", name: "Morning Prayer", startTime: "06:00", endTime: "06:30" }),
        createTestTaskInstance({ id: "task-2", name: "Workout", startTime: "07:00", endTime: "08:00" }),
      ];

      // First call returns empty, second call returns created tasks
      (prisma.taskInstance.findMany as jest.Mock)
        .mockResolvedValueOnce([])
        .mockResolvedValueOnce(mockTasks);
      (prisma.taskTemplate.findMany as jest.Mock).mockResolvedValue(mockTemplates);
      (prisma.taskInstance.createMany as jest.Mock).mockResolvedValue({ count: 2 });

      const response = await request(app)
        .get("/api/tasks/today")
        .set("Authorization", `Bearer ${token}`);

      expect(response.status).toBe(200);
      expect(response.body.tasks).toHaveLength(2);
      expect(prisma.taskInstance.createMany).toHaveBeenCalled();
    });

    it("should return 401 without authentication", async () => {
      const response = await request(app).get("/api/tasks/today");

      expect(response.status).toBe(401);
    });
  });

  describe("GET /api/tasks/:date", () => {
    it("should return tasks for a specific date", async () => {
      const mockTasks = [
        createTestTaskInstance({ id: "task-1", name: "Study", startTime: "10:00", endTime: "12:00" }),
      ];

      (prisma.taskInstance.findMany as jest.Mock).mockResolvedValue(mockTasks);

      const response = await request(app)
        .get("/api/tasks/2026-02-07")
        .set("Authorization", `Bearer ${token}`);

      expect(response.status).toBe(200);
      expect(response.body).toHaveProperty("date");
      expect(response.body.date).toBe("2026-02-07");
    });

    it("should return 400 for invalid date format", async () => {
      const response = await request(app)
        .get("/api/tasks/invalid-date")
        .set("Authorization", `Bearer ${token}`);

      expect(response.status).toBe(400);
      expect(response.body.error).toContain("Invalid date");
    });
  });

  describe("PATCH /api/tasks/:id/complete", () => {
    it("should mark task as completed", async () => {
      const mockTask = createTestTaskInstance({ id: "task-1", isCompleted: false });
      const completedTask = { ...mockTask, isCompleted: true, completedAt: new Date() };

      (prisma.taskInstance.findUnique as jest.Mock).mockResolvedValue(mockTask);
      (prisma.taskInstance.update as jest.Mock).mockResolvedValue(completedTask);

      const response = await request(app)
        .patch("/api/tasks/task-1/complete")
        .set("Authorization", `Bearer ${token}`)
        .send({ notes: "Completed successfully" });

      expect(response.status).toBe(200);
      expect(response.body.task.isCompleted).toBe(true);
    });

    it("should toggle completion status", async () => {
      const mockTask = createTestTaskInstance({ id: "task-1", isCompleted: true });
      const uncompletedTask = { ...mockTask, isCompleted: false, completedAt: null };

      (prisma.taskInstance.findUnique as jest.Mock).mockResolvedValue(mockTask);
      (prisma.taskInstance.update as jest.Mock).mockResolvedValue(uncompletedTask);

      const response = await request(app)
        .patch("/api/tasks/task-1/complete")
        .set("Authorization", `Bearer ${token}`);

      expect(response.status).toBe(200);
      expect(response.body.task.isCompleted).toBe(false);
    });

    it("should return 404 for non-existent task", async () => {
      (prisma.taskInstance.findUnique as jest.Mock).mockResolvedValue(null);

      const response = await request(app)
        .patch("/api/tasks/nonexistent-id/complete")
        .set("Authorization", `Bearer ${token}`);

      expect(response.status).toBe(404);
    });

    it("should return 403 for task belonging to another user", async () => {
      const mockTask = createTestTaskInstance({ 
        id: "task-1", 
        userId: "other-user-id" // Different user
      });

      (prisma.taskInstance.findUnique as jest.Mock).mockResolvedValue(mockTask);

      const response = await request(app)
        .patch("/api/tasks/task-1/complete")
        .set("Authorization", `Bearer ${token}`);

      expect(response.status).toBe(403);
    });
  });

  describe("PATCH /api/tasks/:id", () => {
    it("should update task with notes and AI data", async () => {
      const mockTask = createTestTaskInstance({ id: "task-1" });
      const updatedTask = {
        ...mockTask,
        notes: "Updated notes",
        aiData: { calories: 500 },
      };

      (prisma.taskInstance.findUnique as jest.Mock).mockResolvedValue(mockTask);
      (prisma.taskInstance.update as jest.Mock).mockResolvedValue(updatedTask);

      const response = await request(app)
        .patch("/api/tasks/task-1")
        .set("Authorization", `Bearer ${token}`)
        .send({
          notes: "Updated notes",
          aiData: { calories: 500 },
        });

      expect(response.status).toBe(200);
      expect(response.body.task.notes).toBe("Updated notes");
      expect(response.body.task.aiData).toEqual({ calories: 500 });
    });
  });

  describe("POST /api/tasks", () => {
    it("should create a one-time task", async () => {
      const newTask = createTestTaskInstance({
        id: "new-task-id",
        name: "Custom Task",
        time: "15:00",
        templateId: null,
      });

      (prisma.taskInstance.create as jest.Mock).mockResolvedValue(newTask);

      const response = await request(app)
        .post("/api/tasks")
        .set("Authorization", `Bearer ${token}`)
        .send({
          name: "Custom Task",
          time: "15:00",
          date: "2026-02-07",
          category: "Personal",
        });

      expect(response.status).toBe(201);
      expect(response.body.task.name).toBe("Custom Task");
    });

    it("should return 400 for missing required fields", async () => {
      const response = await request(app)
        .post("/api/tasks")
        .set("Authorization", `Bearer ${token}`)
        .send({
          name: "Task Without Time",
        });

      expect(response.status).toBe(400);
    });
  });

  describe("DELETE /api/tasks/:id", () => {
    it("should delete a task", async () => {
      const mockTask = createTestTaskInstance({ id: "task-1" });

      (prisma.taskInstance.findUnique as jest.Mock).mockResolvedValue(mockTask);
      (prisma.taskInstance.delete as jest.Mock).mockResolvedValue(mockTask);

      const response = await request(app)
        .delete("/api/tasks/task-1")
        .set("Authorization", `Bearer ${token}`);

      expect(response.status).toBe(200);
      expect(response.body.message).toContain("deleted");
    });

    it("should return 404 for non-existent task", async () => {
      (prisma.taskInstance.findUnique as jest.Mock).mockResolvedValue(null);

      const response = await request(app)
        .delete("/api/tasks/nonexistent-id")
        .set("Authorization", `Bearer ${token}`);

      expect(response.status).toBe(404);
    });
  });
});
