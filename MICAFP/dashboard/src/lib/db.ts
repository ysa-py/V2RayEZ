import { createRequire } from 'node:module';

type PrismaNamespace = {
  PrismaClient?: new (options?: Record<string, unknown>) => Record<string, unknown>;
};

const require = createRequire(import.meta.url);
const globalForPrisma = globalThis as unknown as {
  prisma: Record<string, unknown> | undefined;
};

function loadPrismaNamespace(): PrismaNamespace {
  try {
    return require('@prisma/client') as PrismaNamespace;
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    throw new Error(
      `PrismaClient is not generated or cannot be loaded. Run \`npm run db:generate\` in MICAFP/dashboard with Prisma engine downloads available. Cause: ${message}`,
    );
  }
}

function createPrismaClient() {
  const PrismaClient = loadPrismaNamespace().PrismaClient;
  if (!PrismaClient) {
    throw new Error(
      'PrismaClient is not generated. Run `npm run db:generate` in MICAFP/dashboard with Prisma engine downloads available.',
    );
  }
  return new PrismaClient({
    log: ['query'],
  });
}

function getPrismaClient() {
  if (!globalForPrisma.prisma) {
    globalForPrisma.prisma = createPrismaClient();
  }
  return globalForPrisma.prisma;
}

export const db = new Proxy({} as Record<string, unknown>, {
  get(_target, prop, receiver) {
    return Reflect.get(getPrismaClient(), prop, receiver);
  },
  set(_target, prop, value, receiver) {
    return Reflect.set(getPrismaClient(), prop, value, receiver);
  },
});
