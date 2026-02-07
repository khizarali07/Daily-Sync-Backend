import express, { Express, Request, Response } from "express";
import cors from "cors";
import swaggerUi from "swagger-ui-express";
import { swaggerSpec } from "./config/swagger";
import authRoutes from "./routes/auth.routes";
import scheduleRoutes from "./routes/schedule.routes";
import tasksRoutes from "./routes/tasks.routes";
import aiRoutes from "./routes/ai.routes";
import healthRoutes from "./routes/health.routes";

export const createApp = (): Express => {
  const app: Express = express();

  // Middleware
  app.use(
    cors({
      origin: process.env.ALLOWED_ORIGINS?.split(",") || "http://localhost:3000",
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
  app.use("/api/health", healthRoutes);

  // Error handling middleware
  app.use((err: any, req: Request, res: Response, next: any) => {
    console.error(err.stack);
    res.status(500).json({ error: "Something went wrong!" });
  });

  return app;
};
