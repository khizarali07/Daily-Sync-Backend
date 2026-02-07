import express, { Request, Response } from "express";
import prisma from "../lib/prisma";
import { authenticate, AuthRequest } from "../middleware/auth.middleware";
import { TaskTemplate } from "@prisma/client";

const router = express.Router();

/**
 * @swagger
 * /api/tasks/today:
 *   get:
 *     summary: Get today's tasks (auto-generates from templates if missing)
 *     tags: [Tasks]
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: Today's tasks
 */
router.get("/today", authenticate, async (req: AuthRequest, res: Response) => {
  try {
    const userId = req.userId!;
    
    // Get today's date (start of day)
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    
    // Get day of week
    const daysMap = ["SUN", "MON", "TUE", "WED", "THU", "FRI", "SAT"];
    const todayDay = daysMap[today.getDay()];
    
    // Check if tasks already exist for today
    let tasks = await prisma.taskInstance.findMany({
      where: {
        userId,
        date: today,
      },
      orderBy: { time: "asc" },
    });
    
    // If no tasks exist for today, generate from templates
    if (tasks.length === 0) {
      const templates = await prisma.taskTemplate.findMany({
        where: {
          userId,
          OR: [
            { daysOfWeek: { isEmpty: true } }, // All days
            { daysOfWeek: { has: todayDay } }, // Specific day
          ],
        },
      });
      
      // Create task instances from templates
      if (templates.length > 0) {
        const taskInstances = templates.map((template: TaskTemplate) => ({
          userId,
          templateId: template.id,
          date: today,
          name: template.name,
          time: template.time,
          category: template.category,
          description: template.description,
          isCompleted: false,
        }));
        
        await prisma.taskInstance.createMany({
          data: taskInstances,
        });
        
        // Fetch the created tasks
        tasks = await prisma.taskInstance.findMany({
          where: {
            userId,
            date: today,
          },
          orderBy: { time: "asc" },
        });
      }
    }
    
    res.json({
      date: today.toISOString().split("T")[0],
      dayOfWeek: todayDay,
      tasks,
    });
  } catch (error) {
    console.error("Get today's tasks error:", error);
    res.status(500).json({ error: "Failed to get tasks" });
  }
});

/**
 * @swagger
 * /api/tasks/{date}:
 *   get:
 *     summary: Get tasks for a specific date
 *     tags: [Tasks]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: date
 *         required: true
 *         schema:
 *           type: string
 *           format: date
 *         description: Date in YYYY-MM-DD format
 *     responses:
 *       200:
 *         description: Tasks for the specified date
 */
router.get("/:date", authenticate, async (req: AuthRequest, res: Response) => {
  try {
    const userId = req.userId!;
    const { date } = req.params;
    
    const targetDate = new Date(date);
    targetDate.setHours(0, 0, 0, 0);
    
    if (isNaN(targetDate.getTime())) {
      return res.status(400).json({ error: "Invalid date format. Use YYYY-MM-DD" });
    }
    
    const daysMap = ["SUN", "MON", "TUE", "WED", "THU", "FRI", "SAT"];
    const dayOfWeek = daysMap[targetDate.getDay()];
    
    // Check if tasks already exist for this date
    let tasks = await prisma.taskInstance.findMany({
      where: {
        userId,
        date: targetDate,
      },
      orderBy: { time: "asc" },
    });
    
    // If no tasks exist, generate from templates
    if (tasks.length === 0) {
      const templates = await prisma.taskTemplate.findMany({
        where: {
          userId,
          OR: [
            { daysOfWeek: { isEmpty: true } },
            { daysOfWeek: { has: dayOfWeek } },
          ],
        },
      });
      
      if (templates.length > 0) {
        const taskInstances = templates.map((template: TaskTemplate) => ({
          userId,
          templateId: template.id,
          date: targetDate,
          name: template.name,
          time: template.time,
          category: template.category,
          description: template.description,
          isCompleted: false,
        }));
        
        await prisma.taskInstance.createMany({
          data: taskInstances,
        });
        
        tasks = await prisma.taskInstance.findMany({
          where: {
            userId,
            date: targetDate,
          },
          orderBy: { time: "asc" },
        });
      }
    }
    
    res.json({
      date: targetDate.toISOString().split("T")[0],
      dayOfWeek,
      tasks,
    });
  } catch (error) {
    console.error("Get tasks by date error:", error);
    res.status(500).json({ error: "Failed to get tasks" });
  }
});

/**
 * @swagger
 * /api/tasks/{id}/complete:
 *   patch:
 *     summary: Mark a task as completed with optional note
 *     tags: [Tasks]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: string
 *     requestBody:
 *       required: false
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             properties:
 *               isCompleted:
 *                 type: boolean
 *               notes:
 *                 type: string
 *     responses:
 *       200:
 *         description: Task updated successfully
 */
router.patch("/:id/complete", authenticate, async (req: AuthRequest, res: Response) => {
  try {
    const userId = req.userId!;
    const { id } = req.params;
    const { isCompleted = true, notes, missedReason } = req.body;
    
    // Verify task belongs to user
    const task = await prisma.taskInstance.findFirst({
      where: {
        id,
        userId,
      },
    });
    
    if (!task) {
      return res.status(404).json({ error: "Task not found" });
    }
    
    const updatedTask = await prisma.taskInstance.update({
      where: { id },
      data: {
        isCompleted,
        completedAt: isCompleted ? new Date() : null,
        notes: notes !== undefined ? notes : task.notes,
        missedReason: missedReason !== undefined ? missedReason : task.missedReason,
      },
    });
    
    res.json({
      message: isCompleted ? "Task marked as completed" : "Task marked as incomplete",
      task: updatedTask,
    });
  } catch (error) {
    console.error("Complete task error:", error);
    res.status(500).json({ error: "Failed to update task" });
  }
});

/**
 * @swagger
 * /api/tasks/{id}:
 *   patch:
 *     summary: Update a task
 *     tags: [Tasks]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: string
 *     requestBody:
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             properties:
 *               notes:
 *                 type: string
 *               imageUrl:
 *                 type: string
 *               aiData:
 *                 type: object
 *     responses:
 *       200:
 *         description: Task updated successfully
 */
router.patch("/:id", authenticate, async (req: AuthRequest, res: Response) => {
  try {
    const userId = req.userId!;
    const { id } = req.params;
    const { notes, imageUrl, aiData } = req.body;
    
    const task = await prisma.taskInstance.findFirst({
      where: {
        id,
        userId,
      },
    });
    
    if (!task) {
      return res.status(404).json({ error: "Task not found" });
    }
    
    const updatedTask = await prisma.taskInstance.update({
      where: { id },
      data: {
        ...(notes !== undefined && { notes }),
        ...(imageUrl !== undefined && { imageUrl }),
        ...(aiData !== undefined && { aiData }),
      },
    });
    
    res.json({
      message: "Task updated successfully",
      task: updatedTask,
    });
  } catch (error) {
    console.error("Update task error:", error);
    res.status(500).json({ error: "Failed to update task" });
  }
});

/**
 * @swagger
 * /api/tasks:
 *   post:
 *     summary: Create a one-time task (not from template)
 *     tags: [Tasks]
 *     security:
 *       - bearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - name
 *               - date
 *               - time
 *             properties:
 *               name:
 *                 type: string
 *               date:
 *                 type: string
 *                 format: date
 *               time:
 *                 type: string
 *               category:
 *                 type: string
 *     responses:
 *       201:
 *         description: Task created successfully
 */
router.post("/", authenticate, async (req: AuthRequest, res: Response) => {
  try {
    const userId = req.userId!;
    const { name, date, time, category } = req.body;
    
    if (!name || !date || !time) {
      return res.status(400).json({ error: "Name, date, and time are required" });
    }
    
    const taskDate = new Date(date);
    taskDate.setHours(0, 0, 0, 0);
    
    const task = await prisma.taskInstance.create({
      data: {
        userId,
        name,
        date: taskDate,
        time,
        category,
        isCompleted: false,
      },
    });
    
    res.status(201).json({
      message: "Task created successfully",
      task,
    });
  } catch (error) {
    console.error("Create task error:", error);
    res.status(500).json({ error: "Failed to create task" });
  }
});

/**
 * @swagger
 * /api/tasks/{id}:
 *   delete:
 *     summary: Delete a task
 *     tags: [Tasks]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: string
 *     responses:
 *       200:
 *         description: Task deleted successfully
 */
router.delete("/:id", authenticate, async (req: AuthRequest, res: Response) => {
  try {
    const userId = req.userId!;
    const { id } = req.params;
    
    const task = await prisma.taskInstance.findFirst({
      where: {
        id,
        userId,
      },
    });
    
    if (!task) {
      return res.status(404).json({ error: "Task not found" });
    }
    
    await prisma.taskInstance.delete({
      where: { id },
    });
    
    res.json({ message: "Task deleted successfully" });
  } catch (error) {
    console.error("Delete task error:", error);
    res.status(500).json({ error: "Failed to delete task" });
  }
});

export default router;
