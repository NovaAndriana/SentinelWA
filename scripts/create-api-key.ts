/**
 * Bootstrap an API key without the console.
 *
 *   npm run key:create -- --name "hris-payroll" --scopes otp.send,status.read --rate 240
 *
 * Useful on a headless install, or to get the very first credential before the
 * operator password has been set.
 */
import { PrismaClient } from '@prisma/client';
import crypto from 'node:crypto';

const prisma = new PrismaClient();

function arg(flag: string, fallback?: string): string | undefined {
  const i = process.argv.indexOf(flag);
  return i > -1 && process.argv[i + 1] ? process.argv[i + 1] : fallback;
}

async function main() {
  const name = arg('--name');
  if (!name) {
    console.error('Usage: npm run key:create -- --name <consumer> [--scopes a,b] [--rate 120] [--ips 10.0.0.0/8]');
    process.exit(1);
  }

  const scopes = arg('--scopes', 'otp.send,message.send,status.read,health.read')!;
  const rate = Number(arg('--rate', process.env.DEFAULT_RATE_LIMIT_PER_MIN ?? '120'));
  const ips = arg('--ips', '')!;

  const secret = crypto.randomBytes(20).toString('hex');
  const key = `swa_live_${secret}`;
  const keyHash = crypto.createHash('sha256').update(key).digest('hex');

  const created = await prisma.apiKey.create({
    data: {
      name,
      keyPrefix: key.slice(0, 13),
      keyHash,
      scopes,
      rateLimitPerMin: Number.isFinite(rate) ? rate : 120,
      ipWhitelist: ips,
    },
  });

  console.log('');
  console.log('  ┌─ SentinelWA :: credential issued ────────────────────────────');
  console.log(`  │  consumer  ${created.name}`);
  console.log(`  │  scopes    ${created.scopes}`);
  console.log(`  │  limit     ${created.rateLimitPerMin} req/min`);
  console.log(`  │  sources   ${created.ipWhitelist || 'any'}`);
  console.log('  ├──────────────────────────────────────────────────────────────');
  console.log(`  │  ${key}`);
  console.log('  └─ store it now — only the SHA-256 digest is persisted ────────');
  console.log('');
}

main()
  .catch((err) => {
    console.error(err);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
