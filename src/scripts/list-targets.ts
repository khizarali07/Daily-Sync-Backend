import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

async function main() {
  const targets = await prisma.nutritionTarget.findMany();
  console.log(targets.map(t => t.nutrient));
}

main().finally(() => prisma.$disconnect());
