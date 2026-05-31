import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

const defaultTargets = [
  { nutrient: "Calories", unit: "kcal", min: 2000, target: 2300, max: 2700 },
  { nutrient: "Water", unit: "L", min: 3, target: 3.5, max: 4 },
  { nutrient: "Protein", unit: "g", min: 110, target: 140, max: 170 },
  { nutrient: "Carbs", unit: "g", min: 180, target: 230, max: 280 },
  { nutrient: "Fats", unit: "g", min: 50, target: 65, max: 85 },
  { nutrient: "Fiber", unit: "g", min: 25, target: 38, max: 50 },

  { nutrient: "Vitamin A", unit: "mcg", min: 600, target: 900, max: 3000 },
  { nutrient: "Vitamin C", unit: "mg", min: 60, target: 90, max: 2000 },
  { nutrient: "Vitamin D", unit: "iu", min: 400, target: 850, max: 4000 },
  { nutrient: "Vitamin E", unit: "mg", min: 12, target: 15, max: 1000 },
  { nutrient: "Vitamin K", unit: "mcg", min: 90, target: 120, max: 0 },
  { nutrient: "Vitamin B1", unit: "mg", min: 1, target: 1.2, max: 0 },
  { nutrient: "Vitamin B2", unit: "mg", min: 1.1, target: 1.3, max: 0 },
  { nutrient: "Vitamin B3", unit: "mg", min: 12, target: 16, max: 35 },
  { nutrient: "Vitamin B6", unit: "mg", min: 1.1, target: 1.3, max: 100 },
  { nutrient: "Vitamin B7", unit: "mcg", min: 25, target: 30, max: 0 },
  { nutrient: "Vitamin B9", unit: "mcg", min: 300, target: 400, max: 1000 },
  { nutrient: "Vitamin B12", unit: "mcg", min: 2, target: 2.4, max: 0 },

  { nutrient: "Calcium", unit: "mg", min: 800, target: 1000, max: 2500 },
  { nutrient: "Magnesium", unit: "mg", min: 330, target: 400, max: 0 },
  { nutrient: "Potassium", unit: "mg", min: 2800, target: 3400, max: 0 },
  { nutrient: "Sodium", unit: "mg", min: 1500, target: 2000, max: 2300 },
  { nutrient: "Iron", unit: "mg", min: 6, target: 8, max: 45 },
  { nutrient: "Zinc", unit: "mg", min: 9, target: 11, max: 40 },
  { nutrient: "Iodine", unit: "mcg", min: 120, target: 150, max: 1100 },
  { nutrient: "Selenium", unit: "mcg", min: 45, target: 55, max: 400 },
  { nutrient: "Copper", unit: "mg", min: 0.7, target: 0.9, max: 10 },
  { nutrient: "Phosphorus", unit: "mg", min: 500, target: 700, max: 4000 },
  { nutrient: "Manganese", unit: "mg", min: 1.8, target: 2.3, max: 11 },
  { nutrient: "Fluoride", unit: "mg", min: 3, target: 4, max: 10 },
  { nutrient: "Chromium", unit: "mcg", min: 25, target: 35, max: 0 },
  { nutrient: "Molybdenum", unit: "mcg", min: 35, target: 45, max: 2000 },
  { nutrient: "Chloride", unit: "mg", min: 1800, target: 2300, max: 3600 },

  { nutrient: "Omega-3", unit: "g", min: 1, target: 1.6, max: 3 },
  { nutrient: "EPA & DHA", unit: "g", min: 200, target: 250, max: 500 },
  { nutrient: "Omega-6", unit: "g", min: 12, target: 17, max: 0 },
  { nutrient: "Choline", unit: "mg", min: 400, target: 550, max: 3500 },
];

async function seed() {
  console.log("Seeding default nutrition targets...");
  const users = await prisma.user.findMany();
  
  if (users.length === 0) {
    console.log("No users found. Creating a default user to test.");
    const user = await prisma.user.create({
      data: {
        email: "test@example.com",
        password: "password123",
        name: "Test User",
      }
    });
    users.push(user);
  }

  // Assuming the user has a specific ID or we just apply to all for now
  for (const user of users) {
    console.log(`Applying targets for user: ${user.email}`);
    for (const t of defaultTargets) {
      await prisma.nutritionTarget.upsert({
        where: {
          userId_nutrient: {
            userId: user.id,
            nutrient: t.nutrient,
          }
        },
        update: {
          min: t.min,
          target: t.target,
          max: t.max,
          unit: t.unit,
        },
        create: {
          userId: user.id,
          nutrient: t.nutrient,
          min: t.min,
          target: t.target,
          max: t.max,
          unit: t.unit,
        }
      });
    }
  }

  console.log("Seeding complete!");
}

seed()
  .catch(e => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
