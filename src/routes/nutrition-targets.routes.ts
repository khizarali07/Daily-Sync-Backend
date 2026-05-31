import express, { Request, Response } from "express";
import { authenticate, AuthRequest } from "../middleware/auth.middleware";
import prisma from "../lib/prisma";

const router = express.Router();

/**
 * @swagger
 * /api/nutrition-targets:
 *   get:
 *     summary: Get all nutrition targets for the user
 *     tags: [NutritionTargets]
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: List of nutrition targets
 */
router.get("/", authenticate, async (req: AuthRequest, res: Response) => {
  try {
    const userId = req.userId!;
    
    const targets = await prisma.nutritionTarget.findMany({
      where: { userId },
    });
    
    res.json({ success: true, data: targets });
  } catch (error) {
    console.error("Get nutrition targets error:", error);
    res.status(500).json({ error: "Failed to fetch nutrition targets" });
  }
});

/**
 * @swagger
 * /api/nutrition-targets:
 *   put:
 *     summary: Create or update a nutrition target
 *     tags: [NutritionTargets]
 *     security:
 *       - bearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - nutrient
 *               - unit
 *             properties:
 *               nutrient:
 *                 type: string
 *               min:
 *                 type: number
 *               max:
 *                 type: number
 *               target:
 *                 type: number
 *               unit:
 *                 type: string
 *     responses:
 *       200:
 *         description: Nutrition target updated successfully
 */
router.put("/", authenticate, async (req: AuthRequest, res: Response) => {
  try {
    const userId = req.userId!;
    const { nutrient, min, max, target, unit } = req.body;
    
    if (!nutrient || !unit) {
      return res.status(400).json({ error: "Nutrient name and unit are required" });
    }
    
    const upsertedTarget = await prisma.nutritionTarget.upsert({
      where: {
        userId_nutrient: {
          userId,
          nutrient,
        },
      },
      update: {
        min: min ?? null,
        max: max ?? null,
        target: target ?? null,
        unit,
      },
      create: {
        userId,
        nutrient,
        min: min ?? null,
        max: max ?? null,
        target: target ?? null,
        unit,
      },
    });
    
    res.json({ success: true, data: upsertedTarget });
  } catch (error) {
    console.error("Update nutrition target error:", error);
    res.status(500).json({ error: "Failed to update nutrition target" });
  }
});

/**
 * @swagger
 * /api/nutrition-targets/bulk:
 *   put:
 *     summary: Bulk update nutrition targets
 *     tags: [NutritionTargets]
 *     security:
 *       - bearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - targets
 *             properties:
 *               targets:
 *                 type: array
 *                 items:
 *                   type: object
 *                   properties:
 *                     nutrient:
 *                       type: string
 *                     min:
 *                       type: number
 *                     max:
 *                       type: number
 *                     target:
 *                       type: number
 *                     unit:
 *                       type: string
 *     responses:
 *       200:
 *         description: Nutrition targets updated successfully
 */
router.put("/bulk", authenticate, async (req: AuthRequest, res: Response) => {
  try {
    const userId = req.userId!;
    const { targets } = req.body;
    
    if (!Array.isArray(targets)) {
      return res.status(400).json({ error: "Targets array is required" });
    }
    
    // We do this in a transaction to ensure all or nothing
    const results = await prisma.$transaction(
      targets.map(t => 
        prisma.nutritionTarget.upsert({
          where: {
            userId_nutrient: {
              userId,
              nutrient: t.nutrient,
            },
          },
          update: {
            min: t.min ?? null,
            max: t.max ?? null,
            target: t.target ?? null,
            unit: t.unit,
          },
          create: {
            userId,
            nutrient: t.nutrient,
            min: t.min ?? null,
            max: t.max ?? null,
            target: t.target ?? null,
            unit: t.unit,
          },
        })
      )
    );
    
    res.json({ success: true, data: results });
  } catch (error) {
    console.error("Bulk update nutrition targets error:", error);
    res.status(500).json({ error: "Failed to bulk update nutrition targets" });
  }
});

export default router;
