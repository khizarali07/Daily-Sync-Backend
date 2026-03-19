import 'dotenv/config';

interface GeminiModelsResponse {
  error?: unknown;
  models?: Array<{
    name?: string;
    displayName?: string;
    supportedGenerationMethods?: string[];
  }>;
}

const key = process.env.GEMINI_API_KEY;
const url = `https://generativelanguage.googleapis.com/v1beta/models?key=${key}`;

async function listModels() {
  try {
    console.log('Fetching models with key ending in...', key?.slice(-4));
    const res = await fetch(url);
    const data = (await res.json()) as GeminiModelsResponse;
    if (data.error) {
      console.error('Error:', data.error);
    } else {
      console.log('Available Models:');
      data.models?.forEach((m) => {
        if (m.supportedGenerationMethods?.includes('generateContent')) {
          console.log(`- ${m.name} (${m.displayName})`);
        }
      });
    }
  } catch (e) {
    console.error(e);
  }
}

listModels();
