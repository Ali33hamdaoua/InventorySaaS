/**
 * Inventory MDB — bootstrap seed (production-safe, idempotent).
 *
 * Creates ONLY what is required to boot a usable system:
 *   - 2 branches : Joliette + Bishop (deterministic UUIDs)
 *   - 1 admin user (cross-branch access) — login: admin@inventorymdb.local
 *
 * No demo data: the client adds their own categories, suppliers, products,
 * purchases, inventory periods and accounting expenses through the UI.
 *
 * Safe to re-run at any time. Existing branches/admin are upserted (never
 * wiped). To clear historical data first, run `prisma/wipe-data.ts`.
 */
import { PrismaClient, UserRole } from '@prisma/client';
import * as argon2 from 'argon2';

const prisma = new PrismaClient();

// Deterministic branch IDs — kept in sync with the migration backfill so a
// fresh deployment always lands on the same UUIDs.
const JOLIETTE_BRANCH_ID = '11111111-1111-1111-1111-111111111111';
const BISHOP_BRANCH_ID = '22222222-2222-2222-2222-222222222222';

async function seedBranches() {
  const joliette = await prisma.branch.upsert({
    where: { id: JOLIETTE_BRANCH_ID },
    update: { name: 'Joliette', slug: 'joliette', isActive: true },
    create: {
      id: JOLIETTE_BRANCH_ID,
      name: 'Joliette',
      slug: 'joliette',
      address: null,
      isActive: true,
    },
  });
  const bishop = await prisma.branch.upsert({
    where: { id: BISHOP_BRANCH_ID },
    update: { name: 'Bishop', slug: 'bishop', isActive: true },
    create: {
      id: BISHOP_BRANCH_ID,
      name: 'Bishop',
      slug: 'bishop',
      address: null,
      isActive: true,
    },
  });
  return { joliette, bishop };
}

async function seedAdmin() {
  const passwordHash = await argon2.hash('Admin123!');
  return prisma.user.upsert({
    where: { email: 'admin@inventorymdb.local' },
    // Re-hash the password on every seed run so the documented default
    // credentials always work, but don't overwrite anything else.
    update: { passwordHash, isActive: true },
    create: {
      name: 'Admin',
      email: 'admin@inventorymdb.local',
      passwordHash,
      role: UserRole.ADMIN,
      branchId: null, // cross-branch access
      isActive: true,
    },
  });
}

async function main() {
  /* eslint-disable no-console */
  console.log('🏢 Seeding branches (Joliette + Bishop)…');
  await seedBranches();

  console.log('👤 Seeding bootstrap admin…');
  await seedAdmin();

  console.log('✅ Bootstrap seed complete. Login: admin@inventorymdb.local / Admin123!');
  console.log('   No demo data was created — the client owns the catalog.');
  /* eslint-enable no-console */
}

main()
  .catch((e) => {
    // eslint-disable-next-line no-console
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
