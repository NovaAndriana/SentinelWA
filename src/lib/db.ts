import { PrismaClient } from '@prisma/client';

const globalForPrisma = globalThis as unknown as {
  prisma: PrismaClient | undefined;
};

export const prisma =
  globalForPrisma.prisma ??
  new PrismaClient({
    log:
      process.env.NODE_ENV === 'development'
        ? [{ emit: 'event', level: 'error' }]
        : [{ emit: 'event', level: 'error' }],
  });

if (process.env.NODE_ENV !== 'production') globalForPrisma.prisma = prisma;

/** Round-trip a trivial statement to measure SQLite read latency. */
export async function measureDbLatency(): Promise<{ readMs: number; writeMs: number; ok: boolean }> {
  const t0 = performance.now();
  try {
    await prisma.$queryRaw`SELECT 1`;
    const readMs = performance.now() - t0;

    const t1 = performance.now();
    // PRAGMA quick_check touches the pager without mutating rows.
    await prisma.$queryRaw`PRAGMA schema_version`;
    const writeMs = performance.now() - t1;

    return { readMs: Number(readMs.toFixed(2)), writeMs: Number(writeMs.toFixed(2)), ok: true };
  } catch {
    return { readMs: -1, writeMs: -1, ok: false };
  }
}
