import { GoogleGenerativeAI } from "@google/generative-ai";
import fs from "fs";

// AI Provider configuration
let currentProvider: "local-gguf" | "gemini" = (process.env.AI_PROVIDER as any) === "gemini" ? "gemini" : "local-gguf";

const LOCAL_MODEL_PATH = "C:\\Users\\PC\\Desktop\\DATA\\AI\\Models\\GGUF\\Jackrong-Qwen3.5-9B-Claude-4.6-Opus\\Qwen3.5-9B-Claude-4.6-Opus-Reasoning-Distilled-v2-GGUF\\Qwen3.5-9B.Q4_K_M.gguf";

// Gemini configuration
const GEMINI_API_KEY = process.env.GEMINI_API_KEY || "";
const GEMINI_MODEL = process.env.GEMINI_MODEL || "gemini-2.0-flash-exp";

let geminiClient: GoogleGenerativeAI | null = null;
let llamaModel: any = null;

async function getLlamaModel() {
  if (llamaModel) return llamaModel;
  try {
    // @ts-ignore
    const { getLlama } = await import("node-llama-cpp");
    const llama = await getLlama();
    llamaModel = await llama.loadModel({ modelPath: LOCAL_MODEL_PATH });
    return llamaModel;
  } catch (error) {
    console.error("[AI Service] Error loading local GGUF model:", error);
    throw error;
  }
}

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
  try {
    return fs.existsSync(LOCAL_MODEL_PATH);
  } catch (error) {
    return false;
  }
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
}

export async function analyzeImageWithText(
  image: string,
  prompt: string,
  options?: ImageAnalysisOptions
): Promise<string> {
  const provider = await ensureProviderAvailable();

  if (provider === "local-gguf") {
    // Pass image directly in prompt structure. If the model supports vision natively, it can process it.
    return generateLocalText(`![image](${image})\n${prompt}`, options?.systemInstruction);
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
  const model = await getLlamaModel();
  // Using contextSize: 2048 to prevent Vulkan Out of Memory (OOM) errors!
  const context = await model.createContext({ contextSize: 2048 });
  
  // @ts-ignore
  const { LlamaChatSession } = await import("node-llama-cpp");
  
  const sequence = context.getSequence();
  const session = new LlamaChatSession({ 
    contextSequence: sequence,
    systemPrompt: systemInstruction || undefined
  });
  
  try {
    const response = await session.prompt(prompt, {
      maxTokens: 2200,
      temperature: 0.4
    });
    return response;
  } finally {
    // Dispose sequence to free up memory for the next request
    sequence.dispose();
  }
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


