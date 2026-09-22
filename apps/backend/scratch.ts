import { PrismaClient } from '@prisma/client';
const prisma = new PrismaClient();
async function main() {
  const res = await prisma.$queryRaw`SELECT 40.50 as "closingQuantity"`;
  console.log(res);
  console.log(typeof res[0].closingQuantity);
  console.log(res[0].closingQuantity.constructor.name);
}
main().catch(console.error).finally(() => prisma.$disconnect());
