import express, { Request, Response } from "express";
import OpenAI from "openai";
import { authenticate, AuthRequest } from "../middleware/auth.middleware";
import prisma from "../lib/prisma";

const router = express.Router();

const OPENAI_BASE_URL = process.env.OPENAI_BASE_URL || "http://localhost:1234/v1";
const LMSTUDIO_API_KEY = process.env.LMSTUDIO_API_KEY;
const OPENAI_API_KEY = process.env.OPENAI_API_KEY || LMSTUDIO_API_KEY || "lm-studio";
const LMSTUDIO_MODEL = process.env.LMSTUDIO_MODEL || "qwen3.5-9b-uncensored-hauhaucs-aggressive";

const OPENAI_FALLBACK_URLS = [
  OPENAI_BASE_URL,
  process.env.LMSTUDIO_BASE_URL,
  "http://127.0.0.1:1500/v1",
  "http://localhost:1234/v1",
].filter((v, i, arr): v is string => Boolean(v) && arr.indexOf(v as string) === i);

function createOpenAIClient(baseURL: string): OpenAI {
  return new OpenAI({
    baseURL,
    apiKey: OPENAI_API_KEY,
  });
}

function isRetryableAIConnectionError(error: any): boolean {
  return (
    error?.code === "ECONNREFUSED" ||
    error?.code === "ECONNRESET" ||
    error?.code === "ETIMEDOUT" ||
    error?.cause?.code === "ECONNREFUSED" ||
    error?.cause?.code === "ECONNRESET" ||
    error?.cause?.code === "ETIMEDOUT" ||
    error?.cause?.cause?.code === "ECONNREFUSED" ||
    error?.cause?.cause?.code === "ECONNRESET" ||
    error?.cause?.cause?.code === "ETIMEDOUT"
  );
}

async function withOpenAIFailover<T>(
  task: (client: OpenAI, baseURL: string) => Promise<T>,
): Promise<T> {
  let lastError: any;

  for (const baseURL of OPENAI_FALLBACK_URLS) {
    try {
      const client = createOpenAIClient(baseURL);
      return await task(client, baseURL);
    } catch (error: any) {
      lastError = error;
      if (!isRetryableAIConnectionError(error)) {
        throw error;
      }
    }
  }

  throw lastError;
}

function extractTextFromCompletion(messageContent: unknown): string {
  if (typeof messageContent === "string") {
    return messageContent;
  }

  if (Array.isArray(messageContent)) {
    return messageContent
      .map((part: any) => {
        if (typeof part === "string") return part;
        return typeof part?.text === "string" ? part.text : "";
      })
      .join("\n")
      .trim();
  }

  return "";
}

function stripThinkBlock(rawResponse: string): string {
  return rawResponse.replace(/<think>[\s\S]*?<\/think>/gi, "").trim();
}

function extractCleanJson(rawResponse: string): string | null {
  const withoutThink = stripThinkBlock(rawResponse);
  const match = withoutThink.match(/```json\s*([\s\S]*?)\s*```/i);
  return match?.[1]?.trim() || null;
}

function isLocalServerUnreachable(error: any): boolean {
  return (
    error?.code === "ECONNREFUSED" ||
    error?.cause?.code === "ECONNREFUSED" ||
    error?.cause?.cause?.code === "ECONNREFUSED"
  );
}

function isModelPredictionFailure(error: any): boolean {
  const msg = String(error?.message || "").toLowerCase();
  return error?.status === 400 && msg.includes("failed to predict");
}

function handleAIError(res: Response, error: any, context: string): Response {
  console.error(`${context} error:`, error);
  if (isLocalServerUnreachable(error)) {
    return res.status(503).json({
      success: false,
      error: "Local AI server is unreachable",
    });
  }

  return res.status(500).json({
    success: false,
    error: error?.message || "AI processing failed",
  });
}

function ensureDataUri(image: string): string {
  if (image.startsWith("data:image")) {
    return image;
  }
  return `data:image/jpeg;base64,${image}`;
}

async function callLocalReasoningWithImage(
  image: string,
  prompt: string,
  options?: {
    maxTokens?: number;
    temperature?: number;
    systemInstruction?: string;
  },
): Promise<string> {
  const imageUri = ensureDataUri(image);
  const maxTokens = options?.maxTokens ?? 1000;
  const temperature = options?.temperature ?? 0.2;
  const systemInstruction =
    options?.systemInstruction ||
    "Return the final answer as a markdown JSON block. Reasoning may appear inside <think>...</think>, but final answer must be a ```json block.";

  const completion = await withOpenAIFailover((client) =>
    client.chat.completions.create({
      model: LMSTUDIO_MODEL,
      temperature,
      max_tokens: maxTokens,
      // Intentionally stateless: only system + current user prompt/image to stay within local 8K context window.
      messages: [
        {
          role: "system",
          content: systemInstruction,
        },
        {
          role: "user",
          content: [
            { type: "text", text: prompt },
            { type: "image_url", image_url: { url: imageUri } },
          ],
        },
      ],
    }),
  );

  return extractTextFromCompletion(completion.choices?.[0]?.message?.content);
}

async function callLocalReasoningText(prompt: string): Promise<string> {
  const completion = await withOpenAIFailover((client) =>
    client.chat.completions.create({
      model: LMSTUDIO_MODEL,
      temperature: 0.4,
      max_tokens: 2200,
      messages: [
        {
          role: "system",
          content:
            "Return the final answer as a markdown JSON block. If reasoning is present, keep it inside <think>...</think> only.",
        },
        {
          role: "user",
          content: prompt,
        },
      ],
    }),
  );

  return extractTextFromCompletion(completion.choices?.[0]?.message?.content);
}

function safeParseJson<T>(jsonText: string | null): T | null {
  if (!jsonText) {
    return null;
  }

  try {
    return JSON.parse(jsonText) as T;
  } catch {
    return null;
  }
}

function toNumber(value: unknown, fallback = 0): number {
  if (typeof value === "number" && Number.isFinite(value)) {
    return value;
  }

  if (typeof value === "string") {
    const parsed = Number(value.replace(/[^\d.-]/g, ""));
    if (Number.isFinite(parsed)) {
      return parsed;
    }
  }

  return fallback;
}

function toNullableNumber(value: unknown): number | null {
  if (value == null) {
    return null;
  }

  const parsed = toNumber(value, Number.NaN);
  return Number.isNaN(parsed) ? null : parsed;
}

function normalizeFoodData(input: any): {
  foodItems: Array<{ name: string; quantity: string }>;
  totalCalories: number;
  macros: { protein: number; carbs: number; fat: number; fiber: number };
  summary: string;
  error?: string;
} {
  const foodItems = Array.isArray(input?.foodItems)
    ? input.foodItems
        .map((item: any) => ({
          name: String(item?.name || "Unknown"),
          quantity: String(item?.quantity || "unknown"),
        }))
        .filter((item: { name: string }) => item.name.trim().length > 0)
    : [];

  const totalCalories = toNumber(input?.totalCalories, 0);
  const macros = {
    protein: toNumber(input?.macros?.protein, 0),
    carbs: toNumber(input?.macros?.carbs, 0),
    fat: toNumber(input?.macros?.fat, 0),
    fiber: toNumber(input?.macros?.fiber, 0),
  };

  const summary = String(input?.summary || "Food analysis completed.");

  return {
    foodItems,
    totalCalories,
    macros,
    summary,
    ...(input?.error ? { error: String(input.error) } : {}),
  };
}

function normalizeWorkoutData(input: any): {
  workoutType?: string;
  exercises: Array<{
    name: string;
    sets: number | null;
    reps: number | null;
    weight: string | null;
    duration: string | null;
    distance: string | null;
  }>;
  totalDuration?: string;
  caloriesBurned: number;
  summary: string;
  error?: string;
} {
  const exercises = Array.isArray(input?.exercises)
    ? input.exercises.map((ex: any) => ({
        name: String(ex?.name || "Unknown Exercise"),
        sets: toNullableNumber(ex?.sets),
        reps: toNullableNumber(ex?.reps),
        weight: ex?.weight == null ? null : String(ex.weight),
        duration: ex?.duration == null ? null : String(ex.duration),
        distance: ex?.distance == null ? null : String(ex.distance),
      }))
    : [];

  return {
    ...(input?.workoutType ? { workoutType: String(input.workoutType) } : {}),
    exercises,
    ...(input?.totalDuration ? { totalDuration: String(input.totalDuration) } : {}),
    caloriesBurned: toNumber(input?.caloriesBurned, 0),
    summary: String(input?.summary || "Workout analysis completed."),
    ...(input?.error ? { error: String(input.error) } : {}),
  };
}

function parseFoodJsonBlock(raw: string): ReturnType<typeof normalizeFoodData> | null {
  const extracted = extractCleanJson(raw);
  const parsed = safeParseJson<any>(extracted);
  if (!parsed) return null;
  return normalizeFoodData(parsed);
}

function parseWorkoutJsonBlock(raw: string): ReturnType<typeof normalizeWorkoutData> | null {
  const extracted = extractCleanJson(raw);
  const parsed = safeParseJson<any>(extracted);
  if (!parsed) return null;
  return normalizeWorkoutData(parsed);
}

function truncateForRepair(raw: string, maxChars = 7000): string {
  if (raw.length <= maxChars) return raw;
  return raw.slice(0, maxChars);
}

async function repairFoodJsonFromRaw(raw: string): Promise<ReturnType<typeof normalizeFoodData> | null> {
  const compactRaw = truncateForRepair(stripThinkBlock(raw));
  const prompt = `Convert the following food-analysis text into STRICT JSON markdown only.
Return exactly one fenced JSON block and nothing else.

Required schema:
\`\`\`json
{
  "foodItems": [{"name":"string","quantity":"string"}],
  "totalCalories": 0,
  "macros": {"protein":0,"carbs":0,"fat":0,"fiber":0},
  "summary": "string"
}
\`\`\`

Input text:
${compactRaw}`;

  const repairedRaw = await callLocalReasoningText(prompt);
  const parsed = parseFoodJsonBlock(repairedRaw);
  return parsed;
}

async function repairWorkoutJsonFromRaw(raw: string): Promise<ReturnType<typeof normalizeWorkoutData> | null> {
  const compactRaw = truncateForRepair(stripThinkBlock(raw));
  const prompt = `Convert the following workout-analysis text into STRICT JSON markdown only.
Return exactly one fenced JSON block and nothing else.

Required schema:
\`\`\`json
{
  "workoutType": "string",
  "exercises": [{"name":"string","sets":null,"reps":null,"weight":null,"duration":null,"distance":null}],
  "totalDuration": "string",
  "caloriesBurned": 0,
  "summary": "string"
}
\`\`\`

Input text:
${compactRaw}`;

  const repairedRaw = await callLocalReasoningText(prompt);
  const parsed = parseWorkoutJsonBlock(repairedRaw);
  return parsed;
}

function heuristicFoodFromText(raw: string): {
  totalCalories: number;
  macros: { protein: number; carbs: number; fat: number; fiber: number };
} {
  const text = raw.toLowerCase();

  const kcalMatches = [...text.matchAll(/(\d+(?:\.\d+)?)\s*kcal/g)].map((m) => Number(m[1]));
  const totalCalories = kcalMatches.length > 0 ? Math.round(Math.max(...kcalMatches)) : 0;

  const proteinMatch = text.match(/protein[^\d]*(\d+(?:\.\d+)?)/);
  const carbsMatch = text.match(/carb(?:s)?[^\d]*(\d+(?:\.\d+)?)/);
  const fatMatch = text.match(/fat[^\d]*(\d+(?:\.\d+)?)/);
  const fiberMatch = text.match(/fiber[^\d]*(\d+(?:\.\d+)?)/);

  return {
    totalCalories,
    macros: {
      protein: proteinMatch ? Math.round(Number(proteinMatch[1])) : 0,
      carbs: carbsMatch ? Math.round(Number(carbsMatch[1])) : 0,
      fat: fatMatch ? Math.round(Number(fatMatch[1])) : 0,
      fiber: fiberMatch ? Math.round(Number(fiberMatch[1])) : 0,
    },
  };
}

function parseDurationMinutes(duration: string | undefined): number {
  if (!duration) return 0;

  const hhmmMatch = duration.match(/(\d{1,2}):(\d{2})(?::(\d{2}))?/);
  if (hhmmMatch) {
    const hours = Number(hhmmMatch[1]);
    const minutes = Number(hhmmMatch[2]);
    const seconds = hhmmMatch[3] ? Number(hhmmMatch[3]) : 0;
    return Math.round(hours * 60 + minutes + seconds / 60);
  }

  const minMatch = duration.match(/(\d{1,3})\s*(?:min|mins|minute|minutes)/i);
  if (minMatch) {
    return Number(minMatch[1]);
  }

  return 0;
}

function estimateCaloriesFromWorkout(durationMins: number, exerciseCount: number): number {
  if (durationMins > 0) {
    const estimated = Math.round(durationMins * 6.5 + Math.max(exerciseCount, 1) * 1.5);
    return Math.max(60, Math.min(1500, estimated));
  }

  if (exerciseCount > 0) {
    return Math.max(50, Math.min(800, Math.round(exerciseCount * 12)));
  }

  return 0;
}

function heuristicWorkoutFromText(raw: string): {
  workoutType?: string;
  exercises: Array<{
    name: string;
    sets: number | null;
    reps: number | null;
    weight: string | null;
    duration: string | null;
    distance: string | null;
  }>;
  totalDuration?: string;
  caloriesBurned: number;
  summary: string;
} {
  const text = stripThinkBlock(raw);
  const lower = text.toLowerCase();

  const durationMatch = text.match(/(\d{1,3})\s*(?:min|mins|minute|minutes)/i);
  const duration = durationMatch ? `${Number(durationMatch[1])} mins` : undefined;

  const quotedNames = Array.from(text.matchAll(/(?:text|exercise(?:\s*name)?|name)\s*:\s*"([^"]{3,120})"/gi)).map(
    (m) => m[1].trim(),
  );

  const nameRepInline = Array.from(
    text.matchAll(/([A-Za-z][A-Za-z0-9\s\-()&'/]{3,100}?)\s*[x×]\s*(\d{1,4})/g),
  ).map((m) => ({ name: m[1].trim(), reps: Number(m[2]) }));

  const extracted: Array<{
    name: string;
    sets: number | null;
    reps: number | null;
    weight: string | null;
    duration: string | null;
    distance: string | null;
  }> = [];

  if (quotedNames.length > 0) {
    const repHints = Array.from(text.matchAll(/(?:data(?:\s*below)?|reps?)\s*:\s*"?x?\s*(\d{1,4})"?/gi)).map((m) => Number(m[1]));

    quotedNames.forEach((name, idx) => {
      const cleaned = name.replace(/\s+/g, " ").trim();
      if (!cleaned) return;
      extracted.push({
        name: cleaned,
        sets: null,
        reps: repHints[idx] ?? null,
        weight: null,
        duration: null,
        distance: null,
      });
    });
  }

  nameRepInline.forEach((item) => {
    extracted.push({
      name: item.name,
      sets: null,
      reps: item.reps,
      weight: null,
      duration: null,
      distance: null,
    });
  });

  const deduped = extracted
    .filter((ex) => ex.name.length > 2)
    .filter((ex, idx, arr) => {
      const key = `${ex.name.toLowerCase()}::${ex.reps ?? "na"}`;
      return arr.findIndex((v) => `${v.name.toLowerCase()}::${v.reps ?? "na"}` === key) === idx;
    });

  let workoutType = "Workout";
  if (/(run|jog|treadmill)/i.test(lower)) workoutType = "Running";
  else if (/(cycle|bike)/i.test(lower)) workoutType = "Cycling";
  else if (/(yoga|pilates)/i.test(lower)) workoutType = "Mobility";
  else if (/(strength|weight|dumbbell|barbell|squat|deadlift|leg)/i.test(lower)) workoutType = "Strength Training";

  const explicitCalories = Array.from(text.matchAll(/(\d{2,4})\s*(?:kcal|calories)/gi)).map((m) => Number(m[1]));
  const durationMins = parseDurationMinutes(duration);
  const caloriesBurned =
    explicitCalories.length > 0
      ? Math.max(...explicitCalories)
      : estimateCaloriesFromWorkout(durationMins, deduped.length);

  const summary =
    deduped.length > 0
      ? `Parsed ${deduped.length} exercises${duration ? ` over ${duration}` : ""}.`
      : "Workout analysis completed.";

  return {
    workoutType,
    exercises: deduped,
    ...(duration ? { totalDuration: duration } : {}),
    caloriesBurned,
    summary,
  };
}

function mergeWorkoutData(
  parsed: ReturnType<typeof normalizeWorkoutData>,
  rawResponse: string,
): ReturnType<typeof normalizeWorkoutData> {
  const heuristics = heuristicWorkoutFromText(rawResponse);
  const hasMoreHeuristicExercises = heuristics.exercises.length > parsed.exercises.length;

  const mergedExercises = hasMoreHeuristicExercises ? heuristics.exercises : parsed.exercises;

  const parsedDuration = parseDurationMinutes(parsed.totalDuration);
  const mergedDuration = parsed.totalDuration || heuristics.totalDuration;
  const durationMins = parsedDuration || parseDurationMinutes(heuristics.totalDuration);

  const mergedCalories =
    parsed.caloriesBurned > 0
      ? parsed.caloriesBurned
      : heuristics.caloriesBurned > 0
        ? heuristics.caloriesBurned
        : estimateCaloriesFromWorkout(durationMins, mergedExercises.length);

  const mergedSummary =
    parsed.summary && parsed.summary.trim().length > 0 && !/parse failed/i.test(parsed.summary)
      ? parsed.summary
      : heuristics.summary;

  return {
    ...parsed,
    workoutType: parsed.workoutType || heuristics.workoutType,
    exercises: mergedExercises,
    ...(mergedDuration ? { totalDuration: mergedDuration } : {}),
    caloriesBurned: mergedCalories,
    summary: mergedSummary,
  };
}

/**
 * @swagger
 * /api/ai/analyze-food:
 *   post:
 *     summary: Analyze a food image using local AI server
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

    const prompt = `Analyze this food image and provide nutritional information.
  Do not include reasoning. Do not include explanations. Start immediately with a JSON markdown block.
  Return final answer ONLY inside a markdown JSON block:
\`\`\`json
{
  "foodItems": [{"name": "Food item name", "quantity": "estimated portion size"}],
  "totalCalories": 0,
  "macros": {"protein": 0, "carbs": 0, "fat": 0, "fiber": 0},
  "summary": "Brief description of the meal"
}
\`\`\`

If food is unclear, still return valid JSON with sensible defaults and a summary note.`;

    const result = await callLocalReasoningWithImage(image, prompt);
    const parsedFood = parseFoodJsonBlock(result) || await repairFoodJsonFromRaw(result);

    if (parsedFood) {
      res.json({
        success: true,
        data: parsedFood,
        rawResponse: result,
      });
    } else {
      const heuristics = heuristicFoodFromText(result);
      res.json({
        success: true,
        data: {
          summary: "Could not extract nutrition JSON from model output. Please retry with a clearer photo.",
          totalCalories: heuristics.totalCalories,
          macros: heuristics.macros,
          foodItems: [],
          error: "PARSE_FAILED",
        },
        rawResponse: result,
      });
    }
  } catch (error: any) {
    if (isModelPredictionFailure(error)) {
      return res.json({
        success: true,
        data: {
          summary:
            "Local model could not process this image. It may not support vision input. Please use a vision-capable model in LM Studio.",
          totalCalories: 0,
          macros: { protein: 0, carbs: 0, fat: 0, fiber: 0 },
          foodItems: [],
          error: "MODEL_VISION_UNAVAILABLE",
        },
      });
    }

    return handleAIError(res, error, "Food analysis");
  }
});

/**
 * @swagger
 * /api/ai/analyze-workout:
 *   post:
 *     summary: Analyze a workout image/screenshot using local AI server
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

    const prompt = `Analyze this workout or fitness app screenshot and extract every visible exercise row.
  Do not include reasoning. Do not include explanations. Start immediately with a JSON markdown block.
  Keep summary concise and avoid long prose.
  Ensure exercises includes all visible entries from top to bottom.
  If reps are shown like x16, put reps as 16.
  If calories are not visible, estimate calories based on workout duration and exercise intensity.
  Return final answer ONLY inside a markdown JSON block:
\`\`\`json
{
  "workoutType": "Running",
  "exercises": [{"name": "Exercise", "sets": null, "reps": null, "weight": null, "duration": null, "distance": null}],
  "totalDuration": "00:00",
  "caloriesBurned": 0,
  "summary": "Brief description"
}
\`\`\``;

    const result = await callLocalReasoningWithImage(image, prompt, {
      maxTokens: 1400,
      temperature: 0.15,
      systemInstruction:
        "You are an OCR-to-JSON extraction engine. Never include reasoning. Never include prose outside one fenced ```json block. Keep values compact and deterministic.",
    });
    const parsedWorkout = parseWorkoutJsonBlock(result) || await repairWorkoutJsonFromRaw(result);

    if (parsedWorkout) {
      const mergedWorkout = mergeWorkoutData(parsedWorkout, result);
      res.json({
        success: true,
        data: mergedWorkout,
        rawResponse: result,
      });
    } else {
      const heuristicWorkout = heuristicWorkoutFromText(result);
      res.json({
        success: true,
        data: {
          workoutType: heuristicWorkout.workoutType,
          exercises: heuristicWorkout.exercises,
          totalDuration: heuristicWorkout.totalDuration,
          caloriesBurned: heuristicWorkout.caloriesBurned,
          summary:
            heuristicWorkout.exercises.length > 0
              ? heuristicWorkout.summary
              : "Could not extract workout JSON from model output. Please retry with a clearer image.",
          error: "PARSE_FAILED",
        },
        rawResponse: result,
      });
    }
  } catch (error: any) {
    if (isModelPredictionFailure(error)) {
      return res.json({
        success: true,
        data: {
          summary:
            "Local model could not process this image. It may not support vision input. Please use a vision-capable model in LM Studio.",
          exercises: [],
          caloriesBurned: 0,
          error: "MODEL_VISION_UNAVAILABLE",
        },
      });
    }

    return handleAIError(res, error, "Workout analysis");
  }
});

/**
 * @swagger
 * /api/ai/analyze-general:
 *   post:
 *     summary: General image analysis using local AI server
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

    const result = await callLocalReasoningWithImage(image, prompt);

    res.json({
      success: true,
      data: {
        analysis: result,
      },
    });
  } catch (error: any) {
    return handleAIError(res, error, "General analysis");
  }
});

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
      orderBy: { startTime: "asc" },
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
      return `- ${t.startTime}-${t.endTime} | ${t.name} (${t.category || "General"}) | ${status}${notes}${reason}${aiInfo}`;
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
7. Return only a markdown JSON block with this shape:
\`\`\`json
{"summary":"..."}
\`\`\``;

  const summaryRaw = await callLocalReasoningText(megaPrompt);
  const summaryJson = safeParseJson<{ summary?: string }>(extractCleanJson(summaryRaw));
  const summary = String(summaryJson?.summary || stripThinkBlock(summaryRaw));

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
    return handleAIError(res, error, "Generate summary");
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
