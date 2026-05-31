import express, { Request, Response } from "express";
import {
  getCurrentProvider,
  setProvider,
  getProviderStatus,
} from "../services/ai.service";

const router = express.Router();

/**
 * @swagger
 * /api/ai-provider/status:
 *   get:
 *     summary: Get current AI provider status
 *     tags: [AI Provider]
 *     responses:
 *       200:
 *         description: AI provider status
 */
router.get("/status", async (req: Request, res: Response) => {
  try {
    const status = await getProviderStatus();
    res.json({ success: true, data: status });
  } catch (error: any) {
    console.error("Get provider status error:", error);
    res.status(500).json({ success: false, error: error.message });
  }
});

/**
 * @swagger
 * /api/ai-provider/switch:
 *   post:
 *     summary: Switch AI provider
 *     tags: [AI Provider]
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - provider
 *             properties:
 *               provider:
 *                 type: string
 *                 enum: [local-gguf, gemini]
 *     responses:
 *       200:
 *         description: Provider switched successfully
 */
router.post("/switch", async (req: Request, res: Response) => {
  try {
    const { provider } = req.body;

    if (!provider || !["local-gguf", "gemini"].includes(provider)) {
      return res.status(400).json({
        success: false,
        error: "Invalid provider. Must be 'local-gguf' or 'gemini'",
      });
    }

    setProvider(provider);
    const status = await getProviderStatus();

    res.json({
      success: true,
      message: `Switched to ${provider}`,
      data: status,
    });
  } catch (error: any) {
    console.error("Switch provider error:", error);
    res.status(500).json({ success: false, error: error.message });
  }
});

export default router;
