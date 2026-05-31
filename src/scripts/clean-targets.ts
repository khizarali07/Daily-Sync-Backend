import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

async function main() {
  const targets = await prisma.nutritionTarget.findMany();
  
  const toDelete = targets.filter(t => 
    t.nutrient.startsWith('Vit ') || t.nutrient === 'EPA_DHA'
  );
  
  console.log(`Deleting ${toDelete.length} duplicate/old targets...`);
  
  for (const t of toDelete) {
    await prisma.nutritionTarget.delete({ where: { id: t.id } });
    console.log(`Deleted: ${t.nutrient}`);
  }
}

main().finally(() => prisma.$disconnect());
