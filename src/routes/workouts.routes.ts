import express, { Request, Response } from "express";
import { authenticate, AuthRequest } from "../middleware/auth.middleware";
import prisma from "../lib/prisma";

const router = express.Router();

/**
 * @swagger
 * /api/workouts:
 *   post:
 *     summary: Create a new workout
 *     tags: [Workouts]
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
 *               - exercises
 *             properties:
 *               name:
 *                 type: string
 *               estimatedCalories:
 *                 type: number
 *               exercises:
 *                 type: array
 *                 items:
 *                   type: object
 *     responses:
 *       201:
 *         description: Workout created successfully
 */
router.post("/", authenticate, async (req: AuthRequest, res: Response) => {
  try {
    const userId = req.userId;
    if (!userId) {
      return res.status(401).json({ error: "Unauthorized" });
    }

    const { name, exercises, estimatedCalories } = req.body;

    if (!name || !exercises) {
      return res.status(400).json({ error: "Name and exercises are required" });
    }

    const workout = await prisma.workout.create({
      data: {
        userId,
        name,
        exercises,
        estimatedCalories: estimatedCalories || null,
      },
    });

    res.status(201).json({ success: true, data: workout });
  } catch (error) {
    console.error("Error creating workout:", error);
    res.status(500).json({ success: false, error: "Failed to create workout" });
  }
});

/**
 * @swagger
 * /api/workouts:
 *   get:
 *     summary: Get all workouts for the user
 *     tags: [Workouts]
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: List of workouts
 */
router.get("/", authenticate, async (req: AuthRequest, res: Response) => {
  try {
    const userId = req.userId;
    if (!userId) {
      return res.status(401).json({ error: "Unauthorized" });
    }

    const workouts = await prisma.workout.findMany({
      where: { userId },
      orderBy: { createdAt: "desc" },
    });

    res.json({ success: true, data: workouts });
  } catch (error) {
    console.error("Error fetching workouts:", error);
    res.status(500).json({ success: false, error: "Failed to fetch workouts" });
  }
});

/**
 * @swagger
 * /api/workouts/{id}:
 *   get:
 *     summary: Get a specific workout by ID
 *     tags: [Workouts]
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
 *         description: Workout details
 */
router.get("/:id", authenticate, async (req: AuthRequest, res: Response) => {
  try {
    const userId = req.userId;
    if (!userId) {
      return res.status(401).json({ error: "Unauthorized" });
    }

    const { id } = req.params;

    const workout = await prisma.workout.findUnique({
      where: { id },
    });

    if (!workout || workout.userId !== userId) {
      return res.status(404).json({ error: "Workout not found" });
    }

    res.json({ success: true, data: workout });
  } catch (error) {
    console.error("Error fetching workout:", error);
    res.status(500).json({ success: false, error: "Failed to fetch workout" });
  }
});

/**
 * @swagger
 * /api/workouts/{id}:
 *   put:
 *     summary: Update a specific workout
 *     tags: [Workouts]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: string
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *     responses:
 *       200:
 *         description: Workout updated
 */
router.put("/:id", authenticate, async (req: AuthRequest, res: Response) => {
  try {
    const userId = req.userId;
    if (!userId) {
      return res.status(401).json({ error: "Unauthorized" });
    }

    const { id } = req.params;
    const { name, exercises, estimatedCalories } = req.body;

    const existing = await prisma.workout.findUnique({ where: { id } });
    if (!existing || existing.userId !== userId) {
      return res.status(404).json({ error: "Workout not found" });
    }

    const updated = await prisma.workout.update({
      where: { id },
      data: {
        ...(name && { name }),
        ...(exercises && { exercises }),
        ...(estimatedCalories !== undefined && { estimatedCalories }),
      },
    });

    res.json({ success: true, data: updated });
  } catch (error) {
    console.error("Error updating workout:", error);
    res.status(500).json({ success: false, error: "Failed to update workout" });
  }
});

/**
 * @swagger
 * /api/workouts/{id}:
 *   delete:
 *     summary: Delete a specific workout
 *     tags: [Workouts]
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
 *         description: Workout deleted
 */
router.delete("/:id", authenticate, async (req: AuthRequest, res: Response) => {
  try {
    const userId = req.userId;
    if (!userId) {
      return res.status(401).json({ error: "Unauthorized" });
    }

    const { id } = req.params;

    const existing = await prisma.workout.findUnique({ where: { id } });
    if (!existing || existing.userId !== userId) {
      return res.status(404).json({ error: "Workout not found" });
    }

    await prisma.workout.delete({ where: { id } });

    res.json({ success: true, message: "Workout deleted successfully" });
  } catch (error) {
    console.error("Error deleting workout:", error);
    res.status(500).json({ success: false, error: "Failed to delete workout" });
  }
});

export default router;
