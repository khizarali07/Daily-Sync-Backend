import express, { Request, Response } from "express";
import { authenticate, AuthRequest } from "../middleware/auth.middleware";
import prisma from "../lib/prisma";

const router = express.Router();

// Gemini API configuration
const GEMINI_API_KEY = process.env.GEMINI_API_KEY;
// Using "gemini-flash-latest" alias which maps to the current stable Flash model (usually 1.5-flash)
// This model supports the free tier (15 RPM) unlike the 2.0/2.5 series which currently require billing
const GEMINI_API_URL = "https://generativelanguage.googleapis.com/v1beta/models/gemini-flash-latest:generateContent";

interface GeminiResponse {
  candidates?: Array<{
    content?: {
      parts?: Array<{
        text?: string;
      }>;
    };
  }>;
}

async function callGeminiVision(base64Image: string, prompt: string): Promise<string> {
  if (!GEMINI_API_KEY) {
    throw new Error("GEMINI_API_KEY not configured");
  }

  const response = await fetch(`${GEMINI_API_URL}?key=${GEMINI_API_KEY}`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      contents: [
        {
          parts: [
            {
              inlineData: {
                mimeType: "image/jpeg",
                data: base64Image,
              },
            },
            {
              text: prompt,
            },
          ],
        },
      ],
      generationConfig: {
        temperature: 0.4,
        topK: 32,
        topP: 1,
        maxOutputTokens: 1024,
      },
    }),
  });

  if (!response.ok) {
    const error = await response.text();
    throw new Error(`Gemini API error: ${error}`);
  }

  const data = (await response.json()) as GeminiResponse;
  const text = data.candidates?.[0]?.content?.parts?.[0]?.text;
  
  if (!text) {
    throw new Error("No response from Gemini");
  }

  return text;
}

function extractJSON(text: string): object | null {
  // Try to extract JSON from the response
  const jsonMatch = text.match(/\{[\s\S]*\}/);
  if (jsonMatch) {
    try {
      return JSON.parse(jsonMatch[0]);
    } catch {
      return null;
    }
  }
  return null;
}

/**
 * @swagger
 * /api/ai/analyze-food:
 *   post:
 *     summary: Analyze a food image using Gemini AI
 *     tags: [AI]
 *     security:
 *       - bearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - image
 *             properties:
 *               image:
 *                 type: string
 *                 description: Base64 encoded image
 *     responses:
 *       200:
 *         description: Food analysis result
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success:
 *                   type: boolean
 *                 data:
 *                   type: object
 *                   properties:
 *                     foodItems:
 *                       type: array
 *                       items:
 *                         type: object
 *                         properties:
 *                           name:
 *                             type: string
 *                           quantity:
 *                             type: string
 *                     totalCalories:
 *                       type: number
 *                     macros:
 *                       type: object
 *                       properties:
 *                         protein:
 *                           type: number
 *                         carbs:
 *                           type: number
 *                         fat:
 *                           type: number
 *                         fiber:
 *                           type: number
 */
router.post("/analyze-food", authenticate, async (req: AuthRequest, res: Response) => {
  try {
    const { image } = req.body;

    if (!image) {
      return res.status(400).json({ error: "Image is required (base64 encoded)" });
    }

    // Remove data URL prefix if present
    const base64Image = image.replace(/^data:image\/\w+;base64,/, "");

    const prompt = `Analyze this food image and provide nutritional information.
Return ONLY a JSON object in this exact format, no other text:
{
  "foodItems": [
    {"name": "Food item name", "quantity": "estimated portion size"}
  ],
  "totalCalories": estimated total calories as a number,
  "macros": {
    "protein": grams as a number,
    "carbs": grams as a number,
    "fat": grams as a number,
    "fiber": grams as a number
  },
  "summary": "Brief description of the meal"
}

If you cannot identify the food, return:
{"error": "Unable to identify food", "foodItems": [], "totalCalories": 0, "macros": {"protein": 0, "carbs": 0, "fat": 0, "fiber": 0}}`;

    const result = await callGeminiVision(base64Image, prompt);
    const jsonData = extractJSON(result);

    if (jsonData) {
      res.json({
        success: true,
        data: jsonData,
        rawResponse: result,
      });
    } else {
      res.json({
        success: true,
        data: {
          summary: result,
          totalCalories: 0,
          macros: { protein: 0, carbs: 0, fat: 0, fiber: 0 },
          foodItems: [],
        },
        rawResponse: result,
      });
    }
  } catch (error: any) {
    console.error("Food analysis error:", error);
    res.status(500).json({
      success: false,
      error: error.message || "Failed to analyze food image",
    });
  }
});

/**
 * @swagger
 * /api/ai/analyze-workout:
 *   post:
 *     summary: Analyze a workout image/screenshot using Gemini AI
 *     tags: [AI]
 *     security:
 *       - bearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - image
 *             properties:
 *               image:
 *                 type: string
 *                 description: Base64 encoded image
 *     responses:
 *       200:
 *         description: Workout analysis result
 */
router.post("/analyze-workout", authenticate, async (req: AuthRequest, res: Response) => {
  try {
    const { image } = req.body;

    if (!image) {
      return res.status(400).json({ error: "Image is required (base64 encoded)" });
    }

    const base64Image = image.replace(/^data:image\/\w+;base64,/, "");

    const prompt = `Analyze this workout or fitness app screenshot and extract the exercise data.
Return ONLY a JSON object in this exact format, no other text:
{
  "workoutType": "Type of workout (e.g., Running, Weight Training, Cycling)",
  "exercises": [
    {
      "name": "Exercise name",
      "sets": number or null,
      "reps": number or null,
      "weight": "weight with unit or null",
      "duration": "duration or null",
      "distance": "distance with unit or null"
    }
  ],
  "totalDuration": "total workout duration",
  "caloriesBurned": estimated calories as a number,
  "summary": "Brief description of the workout"
}

If this is a running/cardio screenshot, focus on distance, duration, pace.
If this is a gym workout, focus on exercises, sets, reps, weights.
If you cannot identify workout data, return:
{"error": "Unable to identify workout data", "exercises": [], "caloriesBurned": 0}`;

    const result = await callGeminiVision(base64Image, prompt);
    const jsonData = extractJSON(result);

    if (jsonData) {
      res.json({
        success: true,
        data: jsonData,
        rawResponse: result,
      });
    } else {
      res.json({
        success: true,
        data: {
          summary: result,
          exercises: [],
          caloriesBurned: 0,
        },
        rawResponse: result,
      });
    }
  } catch (error: any) {
    console.error("Workout analysis error:", error);
    res.status(500).json({
      success: false,
      error: error.message || "Failed to analyze workout image",
    });
  }
});

/**
 * @swagger
 * /api/ai/analyze-general:
 *   post:
 *     summary: General image analysis using Gemini AI
 *     tags: [AI]
 *     security:
 *       - bearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - image
 *             properties:
 *               image:
 *                 type: string
 *                 description: Base64 encoded image
 *               prompt:
 *                 type: string
 *                 description: Custom analysis prompt
 *     responses:
 *       200:
 *         description: Analysis result
 */
router.post("/analyze-general", authenticate, async (req: AuthRequest, res: Response) => {
  try {
    const { image, prompt = "Describe what you see in this image." } = req.body;

    if (!image) {
      return res.status(400).json({ error: "Image is required (base64 encoded)" });
    }

    const base64Image = image.replace(/^data:image\/\w+;base64,/, "");
    const result = await callGeminiVision(base64Image, prompt);

    res.json({
      success: true,
      data: {
        analysis: result,
      },
    });
  } catch (error: any) {
    console.error("General analysis error:", error);
    res.status(500).json({
      success: false,
      error: error.message || "Failed to analyze image",
    });
  }
});

// Helper to call Gemini text-only (no image)
async function callGeminiText(prompt: string): Promise<string> {
  if (!GEMINI_API_KEY) {
    throw new Error("GEMINI_API_KEY not configured");
  }

  const response = await fetch(`${GEMINI_API_URL}?key=${GEMINI_API_KEY}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      contents: [{ parts: [{ text: prompt }] }],
      generationConfig: {
        temperature: 0.7,
        topK: 40,
        topP: 0.95,
        maxOutputTokens: 2048,
      },
    }),
  });

  if (!response.ok) {
    const error = await response.text();
    throw new Error(`Gemini API error: ${error}`);
  }

  const data = (await response.json()) as GeminiResponse;
  const text = data.candidates?.[0]?.content?.parts?.[0]?.text;
  if (!text) throw new Error("No response from Gemini");
  return text;
}

/**
 * @swagger
 * /api/ai/generate-summary:
 *   post:
 *     summary: Generate AI daily diary/journal entry (Milestone 5)
 *     tags: [AI]
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
 *     responses:
 *       200:
 *         description: Generated diary entry
 */
router.post("/generate-summary", authenticate, async (req: AuthRequest, res: Response) => {
  try {
    const userId = req.userId!;
    const { date } = req.body;

    if (!date) {
      return res.status(400).json({ error: "Date is required (YYYY-MM-DD)" });
    }

    const targetDate = new Date(date);
    targetDate.setHours(0, 0, 0, 0);

    // Get all tasks for the day
    const tasks = await prisma.taskInstance.findMany({
      where: { userId, date: targetDate },
      orderBy: { time: "asc" },
    });

    // Get health metrics for the day
    const health = await prisma.healthMetrics.findUnique({
      where: { userId_date: { userId, date: targetDate } },
    });

    // Build the mega-prompt
    const completedTasks = tasks.filter(t => t.isCompleted);
    const missedTasks = tasks.filter(t => !t.isCompleted);

    const taskSummary = tasks.map(t => {
      const status = t.isCompleted ? "✅ Completed" : "❌ Missed";
      const notes = t.notes ? ` — Notes: ${t.notes}` : "";
      const reason = t.missedReason ? ` — Reason: ${t.missedReason}` : "";
      const aiInfo = t.aiData ? ` — AI Data: ${JSON.stringify(t.aiData)}` : "";
      return `- ${t.time} | ${t.name} (${t.category || "General"}) | ${status}${notes}${reason}${aiInfo}`;
    }).join("\n");

    const healthSummary = health ? `
Health Data:
- Sleep: ${health.sleepDuration ? health.sleepDuration + " hours" : "Not recorded"}${health.sleepQuality ? ` (${health.sleepQuality})` : ""}
- Steps: ${health.steps || "Not recorded"}
- Heart Rate: ${health.restingHeartRate ? health.restingHeartRate + " BPM (resting)" : "Not recorded"}
- Calories Burned: ${health.caloriesBurned || "Not recorded"}
- Calories Consumed: ${health.caloriesConsumed || "Not recorded"}
- Water: ${health.waterIntake ? health.waterIntake + "L" : "Not recorded"}
- Mood: ${health.moodScore ? health.moodScore + "/10" : "Not recorded"}
- Energy: ${health.energyLevel ? health.energyLevel + "/10" : "Not recorded"}
- Stress: ${health.stressLevel ? health.stressLevel + "/10" : "Not recorded"}` : "No health data recorded.";

    const megaPrompt = `You are a personal life coach and diary writer. Generate a thoughtful, motivational daily diary entry based on the following data.

Date: ${targetDate.toLocaleDateString("en-US", { weekday: "long", year: "numeric", month: "long", day: "numeric" })}

Schedule Summary:
Total Tasks: ${tasks.length}
Completed: ${completedTasks.length}
Missed: ${missedTasks.length}
Completion Rate: ${tasks.length > 0 ? Math.round((completedTasks.length / tasks.length) * 100) : 0}%

Tasks:
${taskSummary || "No tasks scheduled."}

${healthSummary}

Instructions:
1. Write a 2-3 paragraph diary entry in first person
2. Reference specific tasks and data (e.g., "I completed my workout and burned 450 calories")
3. If tasks were missed, mention them compassionately and suggest improvements
4. Include health observations if data is available
5. End with motivation for tomorrow
6. Keep the tone warm, personal, and encouraging
7. Do NOT use markdown formatting - write plain text paragraphs`;

    const summary = await callGeminiText(megaPrompt);

    // Save to DailyLog
    const dailyLog = await prisma.dailyLog.upsert({
      where: { userId_date: { userId, date: targetDate } },
      create: {
        userId,
        date: targetDate,
        summary,
        aiPrompt: megaPrompt,
        totalTasks: tasks.length,
        completedTasks: completedTasks.length,
        missedTasks: missedTasks.length,
      },
      update: {
        summary,
        aiPrompt: megaPrompt,
        totalTasks: tasks.length,
        completedTasks: completedTasks.length,
        missedTasks: missedTasks.length,
      },
    });

    res.json({
      success: true,
      data: {
        summary,
        stats: {
          totalTasks: tasks.length,
          completedTasks: completedTasks.length,
          missedTasks: missedTasks.length,
          completionRate: tasks.length > 0 ? Math.round((completedTasks.length / tasks.length) * 100) : 0,
        },
        dailyLog,
      },
    });
  } catch (error: any) {
    console.error("Generate summary error:", error);
    res.status(500).json({
      success: false,
      error: error.message || "Failed to generate summary",
    });
  }
});

/**
 * @swagger
 * /api/ai/journal/{date}:
 *   get:
 *     summary: Get saved journal/diary entry for a date
 *     tags: [AI]
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
 *         description: Saved journal entry
 */
router.get("/journal/:date", authenticate, async (req: AuthRequest, res: Response) => {
  try {
    const userId = req.userId!;
    const { date } = req.params;
    const targetDate = new Date(date);
    targetDate.setHours(0, 0, 0, 0);

    const dailyLog = await prisma.dailyLog.findUnique({
      where: { userId_date: { userId, date: targetDate } },
    });

    res.json({
      success: true,
      data: dailyLog,
    });
  } catch (error: any) {
    console.error("Get journal error:", error);
    res.status(500).json({ error: "Failed to get journal entry" });
  }
});

/**
 * @swagger
 * /api/ai/journals:
 *   get:
 *     summary: Get all journal entries
 *     tags: [AI]
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: List of journal entries
 */
router.get("/journals", authenticate, async (req: AuthRequest, res: Response) => {
  try {
    const userId = req.userId!;
    const journals = await prisma.dailyLog.findMany({
      where: { userId },
      orderBy: { date: "desc" },
      take: 30,
    });

    res.json({ success: true, data: journals });
  } catch (error: any) {
    console.error("Get journals error:", error);
    res.status(500).json({ error: "Failed to get journals" });
  }
});

/**
 * @swagger
 * /api/ai/stats/consistency:
 *   get:
 *     summary: Get consistency heatmap data (Milestone 5)
 *     tags: [AI]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: query
 *         name: days
 *         schema:
 *           type: integer
 *           default: 90
 *     responses:
 *       200:
 *         description: Consistency data for heatmap
 */
router.get("/stats/consistency", authenticate, async (req: AuthRequest, res: Response) => {
  try {
    const userId = req.userId!;
    const days = parseInt(req.query.days as string) || 90;

    const startDate = new Date();
    startDate.setDate(startDate.getDate() - days);
    startDate.setHours(0, 0, 0, 0);

    const dailyLogs = await prisma.dailyLog.findMany({
      where: {
        userId,
        date: { gte: startDate },
      },
      orderBy: { date: "asc" },
    });

    // Also get task completion data directly
    const taskInstances = await prisma.taskInstance.findMany({
      where: {
        userId,
        date: { gte: startDate },
      },
      select: {
        date: true,
        isCompleted: true,
      },
    });

    // Build heatmap data
    const dateMap: Record<string, { total: number; completed: number; rate: number }> = {};

    taskInstances.forEach(task => {
      const dateStr = task.date.toISOString().split("T")[0];
      if (!dateMap[dateStr]) {
        dateMap[dateStr] = { total: 0, completed: 0, rate: 0 };
      }
      dateMap[dateStr].total++;
      if (task.isCompleted) dateMap[dateStr].completed++;
    });

    Object.keys(dateMap).forEach(dateStr => {
      const d = dateMap[dateStr];
      d.rate = d.total > 0 ? Math.round((d.completed / d.total) * 100) : 0;
    });

    res.json({
      success: true,
      data: {
        heatmap: dateMap,
        journals: dailyLogs.map(l => ({
          date: l.date.toISOString().split("T")[0],
          hasSummary: !!l.summary,
          totalTasks: l.totalTasks,
          completedTasks: l.completedTasks,
        })),
      },
    });
  } catch (error: any) {
    console.error("Get consistency error:", error);
    res.status(500).json({ error: "Failed to get consistency data" });
  }
});

export default router;
