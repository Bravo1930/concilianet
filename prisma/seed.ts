import "dotenv/config";
import { prisma } from "../src/lib/db";
import { seedDemoPackage } from "../src/lib/seed-demo";

async function main() {
  const result = await seedDemoPackage();
  console.log("Seed ConciliaSAT completado:");
  console.log(`- Despacho: ${result.organizationName} (${result.adminEmail} / Concilia2026!)`);
  console.log(`- Cliente: ${result.clientName} (${result.clientRfc})`);
  console.log(`- Periodo: ${result.month}/${result.year}`);
  console.log("- Paquete creado:", JSON.stringify(result.counts));
}

main()
  .catch((err) => {
    console.error("Error ejecutando seed:", err);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
