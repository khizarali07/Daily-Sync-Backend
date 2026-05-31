import express, { Express, Request, Response } from "express";
import cors from "cors";
import swaggerUi from "swagger-ui-express";
import { swaggerSpec } from "./config/swagger";
import authRoutes from "./routes/auth.routes";
import scheduleRoutes from "./routes/schedule.routes";
import tasksRoutes from "./routes/tasks.routes";
import aiRoutes from "./routes/ai.routes";
import aiProviderRoutes from "./routes/ai-provider.routes";
import healthRoutes from "./routes/health.routes";
import nutritionTargetsRoutes from "./routes/nutrition-targets.routes";
import mealsRoutes from "./routes/meals.routes";

export const createApp = () => {
  const app = express();

  const allowedOrigins = [
    "http://localhost:3000",
    "http://localhost:3001",
    "http://localhost:3002",
    "http://localhost:3003",
    "http://127.0.0.1:3000",
    "http://127.0.0.1:3001",
    "http://127.0.0.1:3002",
    "http://127.0.0.1:3003",
  ];

  app.use(
    cors({
      origin: (origin, callback) => {
        // If there's no origin (like a server-to-server request) or it's in our allowed list
        if (!origin || allowedOrigins.includes(origin) || (process.env.ALLOWED_ORIGINS && process.env.ALLOWED_ORIGINS.split(",").includes(origin))) {
          callback(null, true);
        } else {
          callback(new Error("Not allowed by CORS"));
        }
      },
      credentials: true,
    }),
  );
  app.use(express.json({ limit: "50mb" }));
  app.use(express.urlencoded({ extended: true, limit: "50mb" }));

  // Swagger Documentation
  app.use(
    "/api-docs",
    swaggerUi.serve,
    swaggerUi.setup(swaggerSpec, {
      customCss: ".swagger-ui .topbar { display: none }",
      customSiteTitle: "DailySync API Docs",
    }),
  );

  // Routes
  app.get("/health", (req: Request, res: Response) => {
    res.json({ status: "OK", message: "DailySync API is running" });
  });

  app.use("/api/auth", authRoutes);
  app.use("/api/schedule", scheduleRoutes);
  app.use("/api/tasks", tasksRoutes);
  app.use("/api/ai", aiRoutes);
  app.use("/api/ai-provider", aiProviderRoutes);
  app.use("/api/health", healthRoutes);
  app.use("/api/nutrition-targets", nutritionTargetsRoutes);
  app.use("/api/meals", mealsRoutes);

  // Error handling middleware
  app.use((err: any, req: Request, res: Response, next: any) => {
    console.error(err.stack);
    res.status(500).json({ error: "Something went wrong!" });
  });

  return app;
};
