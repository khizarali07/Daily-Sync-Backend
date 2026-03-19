import 'dotenv/config';

interface GeminiModelsResponse {
  error?: unknown;
  models?: Array<{
    name?: string;
    supportedGenerationMethods?: string[];
  }>;
}

// Using global fetch
const key = process.env.GEMINI_API_KEY;
const url = `https://generativelanguage.googleapis.com/v1beta/models?key=${key}`;

async function run() {
  console.log('Using key ending in:', key?.slice(-4));
  try {
    const res = await fetch(url);
    const data = (await res.json()) as GeminiModelsResponse;
    if (data.error) {
      console.error(JSON.stringify(data.error, null, 2));
    } else {
      console.log('Models:');
      data.models?.forEach((m) => {
        if (m.supportedGenerationMethods?.includes('generateContent')) {
          console.log(m.name);
        }
      });
    }
  } catch (e) {
    console.error(e);
  }
}

run();
