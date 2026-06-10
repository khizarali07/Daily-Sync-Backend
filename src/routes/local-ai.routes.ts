import { Router, Request, Response } from 'express';
import axios from 'axios';

const router = Router();

router.post('/analyze-food', async (req: Request, res: Response) => {
  try {
    const { image, prompt, history } = req.body;
    const localAiUrl = process.env.LOCAL_AI_URL; // Value: https://kathlyn-unsyndicated-grandiosely.ngrok-free.dev

    if (!localAiUrl) {
      return res.status(500).json({ error: 'LOCAL_AI_URL environment variable is not configured on Vercel.' });
    }

    // Hit your local PC via the static Ngrok tunnel
    const response = await axios.post(`${localAiUrl}/analyze-food`, {
      image,
      prompt,
      history
    }, {
      headers: { 'Content-Type': 'application/json' },
      timeout: 60000 // 60-second timeout to allow the RTX 3070 to run multi-turn image generation passes
    });

    // Directly forward the structured nutrition JSON back to the UI state engine
    return res.status(200).json(response.data);

  } catch (error: any) {
    console.error('Local AI Route execution error:', error.message);
    return res.status(500).json({
      error: 'Failed to communicate with local GPU engine.',
      details: error.response?.data || error.message
    });
  }
});

export default router;
