/** Extracts the caller IP, honouring the X-Forwarded-For set by Nginx. */
export function clientIp(headers: Headers): string {
  const xff = headers.get('x-forwarded-for');
  if (xff) return xff.split(',')[0]!.trim();
  return (
    headers.get('x-real-ip') ??
    headers.get('cf-connecting-ip') ??
    '127.0.0.1'
  );
}

function ipv4ToInt(ip: string): number | null {
  const parts = ip.split('.');
  if (parts.length !== 4) return null;
  let out = 0;
  for (const p of parts) {
    const n = Number(p);
    if (!Number.isInteger(n) || n < 0 || n > 255) return null;
    out = (out << 8) + n;
  }
  return out >>> 0;
}

/** Supports bare IPs, IPv4 CIDR blocks and a trailing '*' wildcard. */
export function ipMatches(ip: string, rule: string): boolean {
  const candidate = ip.replace(/^::ffff:/, '').trim();
  const pattern = rule.replace(/^::ffff:/, '').trim();
  if (!pattern) return false;
  if (pattern === '*' || pattern === '0.0.0.0/0') return true;
  if (pattern === candidate) return true;

  if (pattern.includes('/')) {
    const [base, bitsRaw] = pattern.split('/');
    const bits = Number(bitsRaw);
    const baseInt = ipv4ToInt(base!);
    const ipInt = ipv4ToInt(candidate);
    if (baseInt === null || ipInt === null || !Number.isInteger(bits) || bits < 0 || bits > 32) return false;
    const mask = bits === 0 ? 0 : (0xffffffff << (32 - bits)) >>> 0;
    return (baseInt & mask) === (ipInt & mask);
  }

  if (pattern.endsWith('*')) return candidate.startsWith(pattern.slice(0, -1));
  return false;
}

/** Empty allowlist means "no restriction". */
export function ipAllowed(ip: string, allowlist: string): boolean {
  const rules = allowlist.split(',').map((r) => r.trim()).filter(Boolean);
  if (rules.length === 0) return true;
  return rules.some((rule) => ipMatches(ip, rule));
}
