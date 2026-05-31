import express, { Request, Response } from "express";
import { authenticate, AuthRequest } from "../middleware/auth.middleware";
import prisma from "../lib/prisma";

const router = express.Router();

// Helper to update HealthMetrics
async function syncHealthMetrics(userId: string, dateStr: string) {
  const date = new Date(dateStr + "T00:00:00Z");
  
  // Get all meals for this date
  const meals = await prisma.mealLog.findMany({
    where: {
      userId,
      date: {
        gte: new Date(dateStr + "T00:00:00Z"),
        lt: new Date(dateStr + "T23:59:59Z")
      }
    }
  });

  // Calculate aggregates
  const agg = {
    caloriesConsumed: 0,
    proteinGrams: 0,
    carbsGrams: 0,
    fatGrams: 0,
    fiberGrams: 0,
    waterIntake: 0,
    vitAMcg: 0, vitCMg: 0, vitDIu: 0, vitEMg: 0, vitKMcg: 0,
    vitB1Mg: 0, vitB2Mg: 0, vitB3Mg: 0, vitB6Mg: 0, vitB7Mcg: 0, vitB9Mcg: 0, vitB12Mcg: 0,
    calciumMg: 0, magnesiumMg: 0, potassiumMg: 0, sodiumMg: 0, ironMg: 0, zincMg: 0,
    iodineMcg: 0, seleniumMcg: 0, copperMg: 0, phosphorusMg: 0,
    omega3G: 0, omega6G: 0, cholineMg: 0, manganeseMg: 0, fluorideMg: 0, chromiumMcg: 0, molybdenumMcg: 0, chlorideMg: 0
  };

  for (const m of meals) {
    for (const key of Object.keys(agg)) {
      if ((m as any)[key]) {
        (agg as any)[key] += (m as any)[key];
      }
    }
  }

  // Find existing health metrics or create new
  const existing = await prisma.healthMetrics.findFirst({
    where: {
      userId,
      date: {
        gte: new Date(dateStr + "T00:00:00Z"),
        lt: new Date(dateStr + "T23:59:59Z")
      }
    }
  });

  if (existing) {
    await prisma.healthMetrics.update({
      where: { id: existing.id },
      data: agg
    });
  } else {
    await prisma.healthMetrics.create({
      data: {
        userId,
        date,
        ...agg,
        source: "meals-sync"
      }
    });
  }
}

/**
 * @swagger
 * /api/meals:
 *   get:
 *     summary: Get meals for a specific date
 *     tags: [Meals]
 *     security:
 *       - bearerAuth: []
 */
router.get("/", authenticate, async (req: AuthRequest, res: Response) => {
  try {
    const userId = req.userId!;
    const { date } = req.query; // format: YYYY-MM-DD
    
    if (!date || typeof date !== "string") {
      return res.status(400).json({ error: "Date parameter (YYYY-MM-DD) is required" });
    }

    const meals = await prisma.mealLog.findMany({
      where: {
        userId,
        date: {
          gte: new Date(date + "T00:00:00Z"),
          lt: new Date(date + "T23:59:59Z")
        }
      },
      orderBy: { createdAt: "asc" }
    });
    
    res.json({ success: true, data: meals });
  } catch (error) {
    console.error("Get meals error:", error);
    res.status(500).json({ error: "Failed to fetch meals" });
  }
});

/**
 * @swagger
 * /api/meals:
 *   post:
 *     summary: Create a meal log
 *     tags: [Meals]
 *     security:
 *       - bearerAuth: []
 */
router.post("/", authenticate, async (req: AuthRequest, res: Response) => {
  try {
    const userId = req.userId!;
    const { date, mealType, ...data } = req.body;
    
    if (!date || !mealType) {
      return res.status(400).json({ error: "Date and mealType are required" });
    }
    
    const meal = await prisma.mealLog.create({
      data: {
        userId,
        date: new Date(date + "T12:00:00Z"),
        mealType,
        ...data
      }
    });

    await syncHealthMetrics(userId, date);
    
    res.json({ success: true, data: meal });
  } catch (error) {
    console.error("Create meal error:", error);
    res.status(500).json({ error: "Failed to create meal log" });
  }
});

/**
 * @swagger
 * /api/meals/{id}:
 *   put:
 *     summary: Update a meal log
 *     tags: [Meals]
 *     security:
 *       - bearerAuth: []
 */
router.put("/:id", authenticate, async (req: AuthRequest, res: Response) => {
  try {
    const userId = req.userId!;
    const { id } = req.params;
    const { date, mealType, ...data } = req.body;
    
    const meal = await prisma.mealLog.findFirst({
      where: { id, userId }
    });

    if (!meal) {
      return res.status(404).json({ error: "Meal log not found" });
    }

    const updated = await prisma.mealLog.update({
      where: { id },
      data: {
        mealType: mealType || meal.mealType,
        ...data
      }
    });

    // Extract date string correctly based on how it's stored
    const dateStr = meal.date.toISOString().split("T")[0];
    await syncHealthMetrics(userId, dateStr);
    
    res.json({ success: true, data: updated });
  } catch (error) {
    console.error("Update meal error:", error);
    res.status(500).json({ error: "Failed to update meal log" });
  }
});

/**
 * @swagger
 * /api/meals/{id}:
 *   delete:
 *     summary: Delete a meal log
 *     tags: [Meals]
 *     security:
 *       - bearerAuth: []
 */
router.delete("/:id", authenticate, async (req: AuthRequest, res: Response) => {
  try {
    const userId = req.userId!;
    const { id } = req.params;
    
    const meal = await prisma.mealLog.findFirst({
      where: { id, userId }
    });

    if (!meal) {
      return res.status(404).json({ error: "Meal log not found" });
    }

    await prisma.mealLog.delete({ where: { id } });

    const dateStr = meal.date.toISOString().split("T")[0];
    await syncHealthMetrics(userId, dateStr);
    
    res.json({ success: true, message: "Meal log deleted" });
  } catch (error) {
    console.error("Delete meal error:", error);
    res.status(500).json({ error: "Failed to delete meal log" });
  }
});

export default router;
