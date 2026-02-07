-- CreateTable
CREATE TABLE "health_metrics" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "date" DATE NOT NULL,
    "sleepDuration" DOUBLE PRECISION,
    "sleepQuality" TEXT,
    "bedtime" TEXT,
    "wakeTime" TEXT,
    "restingHeartRate" INTEGER,
    "avgHeartRate" INTEGER,
    "maxHeartRate" INTEGER,
    "minHeartRate" INTEGER,
    "steps" INTEGER,
    "caloriesBurned" INTEGER,
    "activeMinutes" INTEGER,
    "distance" DOUBLE PRECISION,
    "weight" DOUBLE PRECISION,
    "bodyFat" DOUBLE PRECISION,
    "bmi" DOUBLE PRECISION,
    "caloriesConsumed" INTEGER,
    "proteinGrams" INTEGER,
    "carbsGrams" INTEGER,
    "fatGrams" INTEGER,
    "waterIntake" DOUBLE PRECISION,
    "moodScore" INTEGER,
    "energyLevel" INTEGER,
    "stressLevel" INTEGER,
    "source" TEXT,
    "rawData" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "health_metrics_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "health_metrics_userId_date_idx" ON "health_metrics"("userId", "date");

-- CreateIndex
CREATE UNIQUE INDEX "health_metrics_userId_date_key" ON "health_metrics"("userId", "date");

-- AddForeignKey
ALTER TABLE "health_metrics" ADD CONSTRAINT "health_metrics_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;
