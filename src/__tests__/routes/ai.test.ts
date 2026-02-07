import request from "supertest";
import { createApp } from "../../app";
import { generateTestToken } from "../helpers/testUtils";

// Mock fetch globally
const mockFetch = jest.fn();
global.fetch = mockFetch;

// Set GEMINI_API_KEY for tests
process.env.GEMINI_API_KEY = "test-gemini-key";

const app = createApp();

describe("AI Routes", () => {
  const token = generateTestToken("test-user-id-123");

  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe("POST /api/ai/analyze-food", () => {
    const validBase64Image = "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==";

    it("should analyze food image successfully", async () => {
      const mockGeminiResponse = {
        candidates: [{
          content: {
            parts: [{
              text: JSON.stringify({
                foodItems: [
                  { name: "Grilled Chicken", quantity: "150g" },
                  { name: "Rice", quantity: "1 cup" }
                ],
                totalCalories: 450,
                macros: {
                  protein: 35,
                  carbs: 45,
                  fat: 12,
                  fiber: 2
                }
              })
            }]
          }
        }]
      };

      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => mockGeminiResponse,
      });

      const response = await request(app)
        .post("/api/ai/analyze-food")
        .set("Authorization", `Bearer ${token}`)
        .send({ image: validBase64Image });

      expect(response.status).toBe(200);
      expect(response.body.success).toBe(true);
      expect(response.body.data).toHaveProperty("foodItems");
      expect(response.body.data).toHaveProperty("totalCalories");
      expect(response.body.data).toHaveProperty("macros");
    });

    it("should return 400 when image is missing", async () => {
      const response = await request(app)
        .post("/api/ai/analyze-food")
        .set("Authorization", `Bearer ${token}`)
        .send({});

      expect(response.status).toBe(400);
      expect(response.body.error).toContain("Image is required");
    });

    it("should return 401 without authentication", async () => {
      const response = await request(app)
        .post("/api/ai/analyze-food")
        .send({ image: validBase64Image });

      expect(response.status).toBe(401);
    });

    it("should handle Gemini API errors gracefully", async () => {
      mockFetch.mockResolvedValueOnce({
        ok: false,
        text: async () => "API Error: Rate limit exceeded",
      });

      const response = await request(app)
        .post("/api/ai/analyze-food")
        .set("Authorization", `Bearer ${token}`)
        .send({ image: validBase64Image });

      expect(response.status).toBe(500);
    });
  });

  describe("POST /api/ai/analyze-workout", () => {
    const validBase64Image = "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==";

    it("should analyze workout image successfully", async () => {
      const mockGeminiResponse = {
        candidates: [{
          content: {
            parts: [{
              text: JSON.stringify({
                exercises: [
                  { name: "Push-ups", sets: 3, reps: 15, estimatedCalories: 50 },
                  { name: "Squats", sets: 3, reps: 20, estimatedCalories: 80 }
                ],
                totalCaloriesBurned: 130,
                workoutType: "Strength Training",
                duration: "20 minutes",
                intensity: "Medium"
              })
            }]
          }
        }]
      };

      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => mockGeminiResponse,
      });

      const response = await request(app)
        .post("/api/ai/analyze-workout")
        .set("Authorization", `Bearer ${token}`)
        .send({ image: validBase64Image });

      expect(response.status).toBe(200);
      expect(response.body.success).toBe(true);
      expect(response.body.data).toHaveProperty("exercises");
      expect(response.body.data).toHaveProperty("totalCaloriesBurned");
    });

    it("should return 400 when image is missing", async () => {
      const response = await request(app)
        .post("/api/ai/analyze-workout")
        .set("Authorization", `Bearer ${token}`)
        .send({});

      expect(response.status).toBe(400);
    });
  });

  describe("POST /api/ai/analyze-general", () => {
    const validBase64Image = "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==";

    it("should analyze with custom prompt", async () => {
      const mockGeminiResponse = {
        candidates: [{
          content: {
            parts: [{
              text: "This image shows a healthy breakfast with eggs and toast."
            }]
          }
        }]
      };

      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => mockGeminiResponse,
      });

      const response = await request(app)
        .post("/api/ai/analyze-general")
        .set("Authorization", `Bearer ${token}`)
        .send({
          image: validBase64Image,
          prompt: "Describe this meal"
        });

      expect(response.status).toBe(200);
      expect(response.body.success).toBe(true);
      expect(response.body.data).toHaveProperty("response");
    });

    it("should return 400 when prompt is missing", async () => {
      const response = await request(app)
        .post("/api/ai/analyze-general")
        .set("Authorization", `Bearer ${token}`)
        .send({ image: validBase64Image });

      expect(response.status).toBe(400);
    });
  });
});
