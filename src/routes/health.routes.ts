import express, { Response } from "express";
import prisma from "../lib/prisma";
import { authenticate, AuthRequest } from "../middleware/auth.middleware";
import { z } from "zod";
import { HealthMetrics } from "@prisma/client";

const router = express.Router();

// Validation schema for health metrics
const healthMetricsSchema = z.object({
  date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/), // YYYY-MM-DD format
  sleepDuration: z.number().min(0).max(24).optional(),
  sleepQuality: z.enum(["poor", "fair", "good", "excellent"]).optional(),
  bedtime: z.string().regex(/^([0-1]?[0-9]|2[0-3]):[0-5][0-9]$/).optional(),
  wakeTime: z.string().regex(/^([0-1]?[0-9]|2[0-3]):[0-5][0-9]$/).optional(),
  restingHeartRate: z.number().int().min(30).max(200).optional(),
  avgHeartRate: z.number().int().min(30).max(220).optional(),
  maxHeartRate: z.number().int().min(30).max(250).optional(),
  minHeartRate: z.number().int().min(30).max(200).optional(),
  steps: z.number().int().min(0).optional(),
  caloriesBurned: z.number().int().min(0).optional(),
  activeMinutes: z.number().int().min(0).optional(),
  distance: z.number().min(0).optional(),
  weight: z.number().min(0).max(500).optional(),
  bodyFat: z.number().min(0).max(100).optional(),
  bmi: z.number().min(0).max(100).optional(),
  caloriesConsumed: z.number().int().min(0).optional(),
  proteinGrams: z.number().int().min(0).optional(),
  carbsGrams: z.number().int().min(0).optional(),
  fatGrams: z.number().int().min(0).optional(),
  waterIntake: z.number().min(0).optional(),
  moodScore: z.number().int().min(1).max(10).optional(),
  energyLevel: z.number().int().min(1).max(10).optional(),
  stressLevel: z.number().int().min(1).max(10).optional(),
  source: z.string().optional(),
});

/**
 * @swagger
 * /api/health/today:
 *   get:
 *     summary: Get today's health metrics
 *     tags: [Health]
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: Today's health metrics
 */
router.get("/today", authenticate, async (req: AuthRequest, res: Response) => {
  try {
    const userId = req.userId!;
    const today = new Date();
    today.setHours(0, 0, 0, 0);

    const metrics = await prisma.healthMetrics.findUnique({
      where: {
        userId_date: {
          userId,
          date: today,
        },
      },
    });

    if (!metrics) {
      return res.json({
        date: today.toISOString().split("T")[0],
        metrics: null,
        message: "No health data for today",
      });
    }

    res.json({
      date: today.toISOString().split("T")[0],
      metrics,
    });
  } catch (error) {
    console.error("Get today's health metrics error:", error);
    res.status(500).json({ error: "Failed to get health metrics" });
  }
});

/**
 * @swagger
 * /api/health/{date}:
 *   get:
 *     summary: Get health metrics for a specific date
 *     tags: [Health]
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
 *         description: Health metrics for the specified date
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

    const metrics = await prisma.healthMetrics.findUnique({
      where: {
        userId_date: {
          userId,
          date: targetDate,
        },
      },
    });

    res.json({
      date: targetDate.toISOString().split("T")[0],
      metrics: metrics || null,
    });
  } catch (error) {
    console.error("Get health metrics error:", error);
    res.status(500).json({ error: "Failed to get health metrics" });
  }
});

/**
 * @swagger
 * /api/health/range:
 *   get:
 *     summary: Get health metrics for a date range
 *     tags: [Health]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: query
 *         name: startDate
 *         required: true
 *         schema:
 *           type: string
 *           format: date
 *       - in: query
 *         name: endDate
 *         required: true
 *         schema:
 *           type: string
 *           format: date
 *     responses:
 *       200:
 *         description: Health metrics for the date range
 */
router.get("/range", authenticate, async (req: AuthRequest, res: Response) => {
  try {
    const userId = req.userId!;
    const { startDate, endDate } = req.query;

    if (!startDate || !endDate) {
      return res.status(400).json({ error: "startDate and endDate are required" });
    }

    const start = new Date(startDate as string);
    const end = new Date(endDate as string);
    start.setHours(0, 0, 0, 0);
    end.setHours(23, 59, 59, 999);

    if (isNaN(start.getTime()) || isNaN(end.getTime())) {
      return res.status(400).json({ error: "Invalid date format" });
    }

    const metrics = await prisma.healthMetrics.findMany({
      where: {
        userId,
        date: {
          gte: start,
          lte: end,
        },
      },
      orderBy: { date: "asc" },
    });

    res.json({
      startDate: start.toISOString().split("T")[0],
      endDate: end.toISOString().split("T")[0],
      metrics,
    });
  } catch (error) {
    console.error("Get health metrics range error:", error);
    res.status(500).json({ error: "Failed to get health metrics" });
  }
});

/**
 * @swagger
 * /api/health:
 *   post:
 *     summary: Create or update health metrics for a date
 *     tags: [Health]
 *     security:
 *       - bearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - date
 *             properties:
 *               date:
 *                 type: string
 *                 format: date
 *               sleepDuration:
 *                 type: number
 *               steps:
 *                 type: integer
 *               weight:
 *                 type: number
 *     responses:
 *       200:
 *         description: Updated health metrics
 *       201:
 *         description: Created health metrics
 */
router.post("/", authenticate, async (req: AuthRequest, res: Response) => {
  try {
    const userId = req.userId!;
    const data = healthMetricsSchema.parse(req.body);

    const targetDate = new Date(data.date);
    targetDate.setHours(0, 0, 0, 0);

    // Remove date from data since we're using it as a unique key
    const { date, ...metricsData } = data;

    const metrics = await prisma.healthMetrics.upsert({
      where: {
        userId_date: {
          userId,
          date: targetDate,
        },
      },
      update: {
        ...metricsData,
        source: metricsData.source || "manual",
      },
      create: {
        userId,
        date: targetDate,
        ...metricsData,
        source: metricsData.source || "manual",
      },
    });

    res.status(201).json({
      message: "Health metrics saved successfully",
      metrics,
    });
  } catch (error) {
    if (error instanceof z.ZodError) {
      return res.status(400).json({ error: error.errors });
    }
    console.error("Save health metrics error:", error);
    res.status(500).json({ error: "Failed to save health metrics" });
  }
});

/**
 * @swagger
 * /api/health/sync/google-fit:
 *   post:
 *     summary: Sync health data from Google Fit
 *     tags: [Health]
 *     security:
 *       - bearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - accessToken
 *             properties:
 *               accessToken:
 *                 type: string
 *                 description: Google Fit OAuth access token
 *               startDate:
 *                 type: string
 *                 format: date
 *               endDate:
 *                 type: string
 *                 format: date
 *     responses:
 *       200:
 *         description: Sync successful
 */
router.post("/sync/google-fit", authenticate, async (req: AuthRequest, res: Response) => {
  try {
    const userId = req.userId!;
    const { accessToken, startDate, endDate } = req.body;

    if (!accessToken) {
      return res.status(400).json({ error: "Google Fit access token is required" });
    }

    const start = startDate ? new Date(startDate) : new Date();
    const end = endDate ? new Date(endDate) : new Date();
    start.setHours(0, 0, 0, 0);
    end.setHours(23, 59, 59, 999);

    // Google Fit API endpoints
    const startTimeMillis = start.getTime();
    const endTimeMillis = end.getTime();

    // Fetch steps data
    const stepsResponse = await fetch(
      "https://www.googleapis.com/fitness/v1/users/me/dataset:aggregate",
      {
        method: "POST",
        headers: {
          Authorization: `Bearer ${accessToken}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          aggregateBy: [
            { dataTypeName: "com.google.step_count.delta" },
          ],
          bucketByTime: { durationMillis: 86400000 }, // 1 day
          startTimeMillis,
          endTimeMillis,
        }),
      }
    );

    if (!stepsResponse.ok) {
      const error = await stepsResponse.text();
      return res.status(400).json({ error: `Google Fit API error: ${error}` });
    }

    const stepsData = await stepsResponse.json() as { bucket?: any[] };

    // Fetch calories data
    const caloriesResponse = await fetch(
      "https://www.googleapis.com/fitness/v1/users/me/dataset:aggregate",
      {
        method: "POST",
        headers: {
          Authorization: `Bearer ${accessToken}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          aggregateBy: [
            { dataTypeName: "com.google.calories.expended" },
          ],
          bucketByTime: { durationMillis: 86400000 },
          startTimeMillis,
          endTimeMillis,
        }),
      }
    );

    const caloriesData = await caloriesResponse.json() as { bucket?: any[] };

    // Fetch heart rate data
    const heartRateResponse = await fetch(
      "https://www.googleapis.com/fitness/v1/users/me/dataset:aggregate",
      {
        method: "POST",
        headers: {
          Authorization: `Bearer ${accessToken}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          aggregateBy: [
            { dataTypeName: "com.google.heart_rate.bpm" },
          ],
          bucketByTime: { durationMillis: 86400000 },
          startTimeMillis,
          endTimeMillis,
        }),
      }
    );

    const heartRateData = await heartRateResponse.json() as { bucket?: any[] };

    // Process and store data
    const syncedDates: string[] = [];
    
    // Process each day's data
    for (const bucket of stepsData.bucket || []) {
      const bucketDate = new Date(parseInt(bucket.startTimeMillis));
      bucketDate.setHours(0, 0, 0, 0);

      let steps = 0;
      if (bucket.dataset?.[0]?.point?.[0]?.value?.[0]?.intVal) {
        steps = bucket.dataset[0].point[0].value[0].intVal;
      }

      // Find corresponding calories for this date
      let caloriesBurned = 0;
      const caloriesBucket = caloriesData.bucket?.find(
        (cb: any) => cb.startTimeMillis === bucket.startTimeMillis
      );
      if (caloriesBucket?.dataset?.[0]?.point?.[0]?.value?.[0]?.fpVal) {
        caloriesBurned = Math.round(caloriesBucket.dataset[0].point[0].value[0].fpVal);
      }

      // Find corresponding heart rate for this date
      let avgHeartRate = null;
      const heartRateBucket = heartRateData.bucket?.find(
        (hb: any) => hb.startTimeMillis === bucket.startTimeMillis
      );
      if (heartRateBucket?.dataset?.[0]?.point?.[0]?.value?.[0]?.fpVal) {
        avgHeartRate = Math.round(heartRateBucket.dataset[0].point[0].value[0].fpVal);
      }

      // Save to database
      await prisma.healthMetrics.upsert({
        where: {
          userId_date: {
            userId,
            date: bucketDate,
          },
        },
        update: {
          steps,
          caloriesBurned,
          avgHeartRate,
          source: "google_fit",
          rawData: { stepsData: bucket, caloriesData: caloriesBucket, heartRateData: heartRateBucket },
        },
        create: {
          userId,
          date: bucketDate,
          steps,
          caloriesBurned,
          avgHeartRate,
          source: "google_fit",
          rawData: { stepsData: bucket, caloriesData: caloriesBucket, heartRateData: heartRateBucket },
        },
      });

      syncedDates.push(bucketDate.toISOString().split("T")[0]);
    }

    res.json({
      message: "Google Fit data synced successfully",
      syncedDates,
      daysProcessed: syncedDates.length,
    });
  } catch (error) {
    console.error("Google Fit sync error:", error);
    res.status(500).json({ error: "Failed to sync Google Fit data" });
  }
});

/**
 * @swagger
 * /api/health/stats/weekly:
 *   get:
 *     summary: Get weekly health statistics
 *     tags: [Health]
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: Weekly health statistics
 */
router.get("/stats/weekly", authenticate, async (req: AuthRequest, res: Response) => {
  try {
    const userId = req.userId!;
    
    // Get last 7 days
    const endDate = new Date();
    const startDate = new Date();
    startDate.setDate(startDate.getDate() - 7);
    startDate.setHours(0, 0, 0, 0);
    endDate.setHours(23, 59, 59, 999);

    const metrics = await prisma.healthMetrics.findMany({
      where: {
        userId,
        date: {
          gte: startDate,
          lte: endDate,
        },
      },
      orderBy: { date: "asc" },
    });

    // Calculate averages and totals
    const stats = {
      totalSteps: 0,
      avgSteps: 0,
      totalCaloriesBurned: 0,
      avgSleepDuration: 0,
      avgHeartRate: 0,
      avgMoodScore: 0,
      avgEnergyLevel: 0,
      daysTracked: metrics.length,
    };

    let sleepCount = 0;
    let heartRateCount = 0;
    let moodCount = 0;
    let energyCount = 0;

    for (const m of metrics) {
      if (m.steps) stats.totalSteps += m.steps;
      if (m.caloriesBurned) stats.totalCaloriesBurned += m.caloriesBurned;
      if (m.sleepDuration) {
        stats.avgSleepDuration += m.sleepDuration;
        sleepCount++;
      }
      if (m.avgHeartRate) {
        stats.avgHeartRate += m.avgHeartRate;
        heartRateCount++;
      }
      if (m.moodScore) {
        stats.avgMoodScore += m.moodScore;
        moodCount++;
      }
      if (m.energyLevel) {
        stats.avgEnergyLevel += m.energyLevel;
        energyCount++;
      }
    }

    if (metrics.length > 0) {
      stats.avgSteps = Math.round(stats.totalSteps / metrics.length);
    }
    if (sleepCount > 0) {
      stats.avgSleepDuration = Number((stats.avgSleepDuration / sleepCount).toFixed(1));
    }
    if (heartRateCount > 0) {
      stats.avgHeartRate = Math.round(stats.avgHeartRate / heartRateCount);
    }
    if (moodCount > 0) {
      stats.avgMoodScore = Number((stats.avgMoodScore / moodCount).toFixed(1));
    }
    if (energyCount > 0) {
      stats.avgEnergyLevel = Number((stats.avgEnergyLevel / energyCount).toFixed(1));
    }

    res.json({
      period: "weekly",
      startDate: startDate.toISOString().split("T")[0],
      endDate: endDate.toISOString().split("T")[0],
      stats,
      dailyMetrics: metrics.map((m: HealthMetrics) => ({
        date: m.date.toISOString().split("T")[0],
        steps: m.steps,
        sleepDuration: m.sleepDuration,
        avgHeartRate: m.avgHeartRate,
        moodScore: m.moodScore,
        caloriesBurned: m.caloriesBurned,
      })),
    });
  } catch (error) {
    console.error("Get weekly stats error:", error);
    res.status(500).json({ error: "Failed to get weekly statistics" });
  }
});

/**
 * @swagger
 * /api/health/{date}:
 *   delete:
 *     summary: Delete health metrics for a specific date
 *     tags: [Health]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: date
 *         required: true
 *         schema:
 *           type: string
 *           format: date
 *     responses:
 *       200:
 *         description: Health metrics deleted
 */
router.delete("/:date", authenticate, async (req: AuthRequest, res: Response) => {
  try {
    const userId = req.userId!;
    const { date } = req.params;

    const targetDate = new Date(date);
    targetDate.setHours(0, 0, 0, 0);

    if (isNaN(targetDate.getTime())) {
      return res.status(400).json({ error: "Invalid date format. Use YYYY-MM-DD" });
    }

    const existing = await prisma.healthMetrics.findUnique({
      where: {
        userId_date: {
          userId,
          date: targetDate,
        },
      },
    });

    if (!existing) {
      return res.status(404).json({ error: "No health metrics found for this date" });
    }

    await prisma.healthMetrics.delete({
      where: {
        userId_date: {
          userId,
          date: targetDate,
        },
      },
    });

    res.json({ message: "Health metrics deleted successfully" });
  } catch (error) {
    console.error("Delete health metrics error:", error);
    res.status(500).json({ error: "Failed to delete health metrics" });
  }
});

export default router;
