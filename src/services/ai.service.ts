import { GoogleGenerativeAI } from "@google/generative-ai";
import fs from "fs";

import axios from "axios";

// AI Provider configuration
let currentProvider: "local-gguf" | "gemini" = (process.env.AI_PROVIDER as any) === "gemini" ? "gemini" : "local-gguf";

// Gemini configuration
const GEMINI_API_KEY = process.env.GEMINI_API_KEY || "";
const GEMINI_MODEL = process.env.GEMINI_MODEL || "gemini-2.0-flash-exp";

let geminiClient: GoogleGenerativeAI | null = null;

function getGeminiClient(): GoogleGenerativeAI {
  if (!geminiClient) {
    if (!GEMINI_API_KEY) {
      throw new Error("GEMINI_API_KEY is not configured in .env");
    }
    geminiClient = new GoogleGenerativeAI(GEMINI_API_KEY);
  }
  return geminiClient;
}

// Provider management
export function getCurrentProvider(): "local-gguf" | "gemini" {
  return currentProvider;
}

export function setProvider(provider: "local-gguf" | "gemini"): void {
  currentProvider = provider;
  console.log(`[AI Service] Switched to ${provider}`);
}

// Check if local model is available
export async function checkLocalModelAvailability(): Promise<boolean> {
  if (!process.env.LOCAL_AI_URL) return false;
  return true; // Assume true if URL exists, or we could ping it
}

export function checkGeminiAvailability(): boolean {
  return !!GEMINI_API_KEY;
}

export async function getProviderStatus(): Promise<{
  current: "local-gguf" | "gemini";
  lmstudio: { available: boolean; url: string };
  gemini: { available: boolean; configured: boolean };
}> {
  const localAvailable = await checkLocalModelAvailability();
  const geminiConfigured = checkGeminiAvailability();

  return {
    current: currentProvider,
    lmstudio: {
      available: localAvailable,
      url: "local_gguf_execution",
    },
    gemini: {
      available: geminiConfigured,
      configured: geminiConfigured,
    },
  };
}

export async function ensureProviderAvailable(): Promise<"local-gguf" | "gemini"> {
  if (currentProvider === "local-gguf") {
    const isAvailable = await checkLocalModelAvailability();
    if (isAvailable) {
      return "local-gguf";
    }
    console.log("[AI Service] Local GGUF unavailable, falling back to Gemini");
    if (checkGeminiAvailability()) {
      return "gemini";
    }
    throw new Error("No AI provider available. Please configure Gemini API key or place model at path.");
  }

  if (currentProvider === "gemini") {
    if (checkGeminiAvailability()) {
      return "gemini";
    }
    throw new Error("Gemini API key not configured");
  }

  return currentProvider;
}

function base64ToGenerativePart(base64Data: string, mimeType: string = "image/jpeg") {
  const base64 = base64Data.replace(/^data:image\/\w+;base64,/, "");
  return {
    inlineData: {
      data: base64,
      mimeType,
    },
  };
}

export interface ImageAnalysisOptions {
  maxTokens?: number;
  temperature?: number;
  systemInstruction?: string;
  isFood?: boolean;
}

export async function analyzeImageWithText(
  image: string,
  prompt: string,
  options?: ImageAnalysisOptions
): Promise<string> {
  const provider = await ensureProviderAvailable();

  if (provider === "local-gguf") {
    const localAiUrl = process.env.LOCAL_AI_URL;
    if (!localAiUrl) throw new Error("LOCAL_AI_URL not configured for local AI engine.");

    const sysInstruction = options?.systemInstruction ? options.systemInstruction + "\n\n" : "";
    
    // Format the image properly to remove the MIME type prefix if the Python backend adds it
    const base64 = image.replace(/^data:image\/\w+;base64,/, "");
    
    const endpoint = options?.isFood ? "/analyze-food" : "/analyze-image";

    const response = await axios.post(`${localAiUrl}${endpoint}`, {
      image: base64,
      prompt: sysInstruction + prompt
    }, {
      timeout: 300000 // 5 minutes for VLM analysis on heavy images
    });
    
    // The Python server returns JSON directly, we stringify it to pass it back to our JSON-repair logic
    return typeof response.data === 'string' ? response.data : JSON.stringify(response.data);
  } else {
    return analyzeGeminiImage(image, prompt, options);
  }
}

async function analyzeGeminiImage(
  image: string,
  prompt: string,
  options?: ImageAnalysisOptions
): Promise<string> {
  const client = getGeminiClient();
  const model = client.getGenerativeModel({
    model: GEMINI_MODEL,
    systemInstruction: options?.systemInstruction,
  });

  const imagePart = base64ToGenerativePart(image);
  const result = await model.generateContent({
    contents: [{ role: "user", parts: [{ text: prompt }, imagePart] }],
    generationConfig: {
      temperature: options?.temperature ?? 0.2,
      maxOutputTokens: options?.maxTokens ?? 1000,
    },
  });

  return result.response.text();
}

export async function generateText(prompt: string, systemInstruction?: string): Promise<string> {
  const provider = await ensureProviderAvailable();

  if (provider === "local-gguf") {
    return generateLocalText(prompt, systemInstruction);
  } else {
    return generateGeminiText(prompt, systemInstruction);
  }
}

async function generateLocalText(prompt: string, systemInstruction?: string): Promise<string> {
  const localAiUrl = process.env.LOCAL_AI_URL;
  if (!localAiUrl) throw new Error("LOCAL_AI_URL not configured for local AI engine.");

  const sysInstruction = systemInstruction ? systemInstruction + "\n\n" : "";

  const response = await axios.post(`${localAiUrl}/analyze-food`, {
    prompt: sysInstruction + prompt
  }, {
    timeout: 120000
  });

  return typeof response.data === 'string' ? response.data : JSON.stringify(response.data);
}

async function generateGeminiText(prompt: string, systemInstruction?: string): Promise<string> {
  const client = getGeminiClient();
  const model = client.getGenerativeModel({
    model: GEMINI_MODEL,
    systemInstruction,
  });

  const result = await model.generateContent({
    contents: [{ role: "user", parts: [{ text: prompt }] }],
    generationConfig: {
      temperature: 0.4,
      maxOutputTokens: 2200,
    },
  });

  return result.response.text();
}

export async function recalculateFood(foodItems: {name: string, quantity: string}[], summary: string): Promise<string> {
  const localAiUrl = process.env.LOCAL_AI_URL;
  if (!localAiUrl) throw new Error("LOCAL_AI_URL not configured for local AI engine.");

  let processedItems = [...foodItems];

  try {
    const itemsText = foodItems.map(item => `- ${item.name} (${item.quantity})`).join('\n');
    const prompt = `You are a nutrition data entry AI. Your ONLY job is to translate complex food names into STANDARD USDA format.
You MUST NOT return the original name. You MUST translate it.

EXAMPLE INPUT:
- Beef Qeema (100g)
- 3 Whole Eggs (None)
- 2 Medium Whole Wheat Rotis (100g)
- 1 Cup Fresh Buffalo Milk (None)

EXAMPLE OUTPUT:
\`\`\`json
{
  "items": [
    {
      "name": "Ground beef",
      "quantity": "100g"
    },
    {
      "name": "Egg, whole, raw",
      "quantity": "150g"
    },
    {
      "name": "Whole wheat flatbread",
      "quantity": "100g"
    },
    {
      "name": "Milk, whole",
      "quantity": "250g"
    }
  ]
}
\`\`\`

ACTUAL INPUT:
${itemsText}

Translate the ACTUAL INPUT exactly like the example. DO NOT return the original names.
Return ONLY the JSON block.
`;

    const aiResponse = await generateText(prompt, "You return strict markdown JSON blocks only.");
    const match = aiResponse.match(/```json\s*([\s\S]*?)\s*```/i);
    const rawJson = match ? match[1] : aiResponse.replace(/```/g, '');
    const parsed = JSON.parse(rawJson);
    
    if (parsed && Array.isArray(parsed.items) && parsed.items.length > 0) {
      processedItems = parsed.items.map((item: any) => ({
        name: item.name,
        quantity: String(item.grams || item.quantity || "100g").replace(/[^0-9.]/g, '') + "g"
      }));
      console.log("[AI Service] Translated food items for USDA:", processedItems);
    }
  } catch (error) {
    console.error("[AI Service] AI translation of food items failed, falling back to original items:", error);
  }

  const response = await axios.post(`${localAiUrl}/recalculate-food`, {
    foodItems: processedItems,
    summary
  }, {
    timeout: 60000 // 60 seconds for LLM + USDA API aggregation
  });

  return typeof response.data === 'string' ? response.data : JSON.stringify(response.data);
}
