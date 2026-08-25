import { breaker } from './circuit-breaker';
import { getMetaConfig, type MetaConfig } from './settings';
import { logger } from './logger';
import { normalizeWaId } from './utils';

const GRAPH_HOST = 'https://graph.facebook.com';
const TIMEOUT_MS = 15_000;

export interface MetaResult<T = unknown> {
  ok: boolean;
  status: number;
  latencyMs: number;
  data: T | null;
  error?: { code?: string | number; type?: string; message: string; details?: unknown };
}

interface GraphError {
  error?: { message?: string; type?: string; code?: number; error_subcode?: number; fbtrace_id?: string };
}

async function graphFetch<T>(
  path: string,
  init: RequestInit & { config: MetaConfig },
): Promise<MetaResult<T>> {
  const { config, ...rest } = init;
  const blocked = breaker.guard();
  if (blocked) {
    return {
      ok: false,
      status: 503,
      latencyMs: 0,
      data: null,
      error: { code: 'CIRCUIT_OPEN', message: `Meta gateway circuit breaker is open (${blocked})` },
    };
  }

  const url = `${GRAPH_HOST}/${config.apiVersion}/${path.replace(/^\/+/, '')}`;
  const started = performance.now();
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), TIMEOUT_MS);

  try {
    const res = await fetch(url, {
      ...rest,
      signal: controller.signal,
      headers: {
        Authorization: `Bearer ${config.accessToken}`,
        'Content-Type': 'application/json',
        ...(rest.headers as Record<string, string> | undefined),
      },
      cache: 'no-store',
    });
    const latencyMs = Math.round(performance.now() - started);
    const text = await res.text();
    const parsed = text ? (JSON.parse(text) as T & GraphError) : ({} as T & GraphError);

    if (!res.ok) {
      breaker.failure(parsed?.error?.message ?? `HTTP ${res.status}`);
      return {
        ok: false,
        status: res.status,
        latencyMs,
        data: null,
        error: {
          code: parsed?.error?.code ?? res.status,
          type: parsed?.error?.type,
          message: parsed?.error?.message ?? `Meta returned HTTP ${res.status}`,
          details: parsed?.error,
        },
      };
    }

    breaker.success();
    return { ok: true, status: res.status, latencyMs, data: parsed as T };
  } catch (err) {
    const latencyMs = Math.round(performance.now() - started);
    const message = err instanceof Error ? err.message : String(err);
    breaker.failure(message);
    return {
      ok: false,
      status: 0,
      latencyMs,
      data: null,
      error: { code: 'NETWORK', message },
    };
  } finally {
    clearTimeout(timer);
  }
}

function mockWamid(): string {
  return `wamid.MOCK${Date.now().toString(36).toUpperCase()}${Math.random().toString(36).slice(2, 8).toUpperCase()}`;
}

export interface SendResult {
  ok: boolean;
  wamid: string | null;
  latencyMs: number;
  status: number;
  error?: MetaResult['error'];
  mocked?: boolean;
}

/** Free-form session message — only valid inside the 24h customer service window. */
export async function sendTextMessage(to: string, body: string): Promise<SendResult> {
  const config = await getMetaConfig();
  const waId = normalizeWaId(to);

  if (config.mock) {
    await logger.info('meta', `MOCK text dispatch to ${waId}`, { chars: body.length });
    return { ok: true, wamid: mockWamid(), latencyMs: 12, status: 200, mocked: true };
  }
  if (!config.accessToken || !config.phoneNumberId) {
    return {
      ok: false,
      wamid: null,
      latencyMs: 0,
      status: 428,
      error: { code: 'NOT_CONFIGURED', message: 'Meta credentials are not configured. Visit /settings.' },
    };
  }

  const res = await graphFetch<{ messages?: { id: string }[] }>(`${config.phoneNumberId}/messages`, {
    config,
    method: 'POST',
    body: JSON.stringify({
      messaging_product: 'whatsapp',
      recipient_type: 'individual',
      to: waId,
      type: 'text',
      text: { preview_url: false, body },
    }),
  });

  return {
    ok: res.ok,
    wamid: res.data?.messages?.[0]?.id ?? null,
    latencyMs: res.latencyMs,
    status: res.status,
    error: res.error,
  };
}

export interface TemplateComponent {
  type: 'header' | 'body' | 'button' | 'footer';
  sub_type?: string;
  index?: string;
  parameters?: Array<Record<string, unknown>>;
}

export async function sendTemplateMessage(
  to: string,
  templateName: string,
  language: string,
  components?: TemplateComponent[],
): Promise<SendResult> {
  const config = await getMetaConfig();
  const waId = normalizeWaId(to);

  if (config.mock) {
    await logger.info('meta', `MOCK template dispatch "${templateName}" to ${waId}`);
    return { ok: true, wamid: mockWamid(), latencyMs: 14, status: 200, mocked: true };
  }
  if (!config.accessToken || !config.phoneNumberId) {
    return {
      ok: false,
      wamid: null,
      latencyMs: 0,
      status: 428,
      error: { code: 'NOT_CONFIGURED', message: 'Meta credentials are not configured. Visit /settings.' },
    };
  }

  const res = await graphFetch<{ messages?: { id: string }[] }>(`${config.phoneNumberId}/messages`, {
    config,
    method: 'POST',
    body: JSON.stringify({
      messaging_product: 'whatsapp',
      recipient_type: 'individual',
      to: waId,
      type: 'template',
      template: {
        name: templateName,
        language: { code: language },
        ...(components?.length ? { components } : {}),
      },
    }),
  });

  return {
    ok: res.ok,
    wamid: res.data?.messages?.[0]?.id ?? null,
    latencyMs: res.latencyMs,
    status: res.status,
    error: res.error,
  };
}

/**
 * Meta's authentication templates expect the code in the body parameter and
 * repeated as the URL/copy-code button parameter.
 */
export async function sendOtpTemplate(
  to: string,
  code: string,
  templateName?: string,
  language?: string,
): Promise<SendResult & { template: string }> {
  const config = await getMetaConfig();
  const template = templateName || config.otpTemplate;
  const lang = language || config.otpLang;

  const result = await sendTemplateMessage(to, template, lang, [
    { type: 'body', parameters: [{ type: 'text', text: code }] },
    { type: 'button', sub_type: 'url', index: '0', parameters: [{ type: 'text', text: code }] },
  ]);

  return { ...result, template };
}

/** Marks an inbound message read so the customer sees the blue ticks. */
export async function markAsRead(wamid: string): Promise<MetaResult> {
  const config = await getMetaConfig();
  if (config.mock || !config.accessToken || !config.phoneNumberId) {
    return { ok: config.mock, status: config.mock ? 200 : 428, latencyMs: 0, data: null };
  }
  return graphFetch(`${config.phoneNumberId}/messages`, {
    config,
    method: 'POST',
    body: JSON.stringify({ messaging_product: 'whatsapp', status: 'read', message_id: wamid }),
  });
}

export interface HandshakeReport {
  ok: boolean;
  latencyMs: number;
  phoneNumber?: string;
  verifiedName?: string;
  qualityRating?: string;
  codeVerificationStatus?: string;
  platformType?: string;
  wabaName?: string;
  apiVersion: string;
  error?: string;
  mocked?: boolean;
}

/** GET /{version}/{phone-number-id} — the credential smoke test used by /settings. */
export async function executeHandshake(): Promise<HandshakeReport> {
  const config = await getMetaConfig();

  if (config.mock) {
    return {
      ok: true,
      latencyMs: 11,
      phoneNumber: '+00 000 0000',
      verifiedName: 'MOCK MODE',
      qualityRating: 'GREEN',
      codeVerificationStatus: 'VERIFIED',
      platformType: 'CLOUD_API',
      apiVersion: config.apiVersion,
      mocked: true,
    };
  }

  if (!config.accessToken || !config.phoneNumberId) {
    return {
      ok: false,
      latencyMs: 0,
      apiVersion: config.apiVersion,
      error: 'Access token and Phone Number ID are both required before a handshake can run.',
    };
  }

  const res = await graphFetch<{
    display_phone_number?: string;
    verified_name?: string;
    quality_rating?: string;
    code_verification_status?: string;
    platform_type?: string;
  }>(
    `${config.phoneNumberId}?fields=display_phone_number,verified_name,quality_rating,code_verification_status,platform_type`,
    { config, method: 'GET' },
  );

  if (!res.ok) {
    return { ok: false, latencyMs: res.latencyMs, apiVersion: config.apiVersion, error: res.error?.message };
  }

  let wabaName: string | undefined;
  if (config.wabaId) {
    const waba = await graphFetch<{ name?: string }>(`${config.wabaId}?fields=name`, { config, method: 'GET' });
    wabaName = waba.data?.name;
  }

  return {
    ok: true,
    latencyMs: res.latencyMs,
    phoneNumber: res.data?.display_phone_number,
    verifiedName: res.data?.verified_name,
    qualityRating: res.data?.quality_rating,
    codeVerificationStatus: res.data?.code_verification_status,
    platformType: res.data?.platform_type,
    wabaName,
    apiVersion: config.apiVersion,
  };
}

export interface PingResult {
  reachable: boolean;
  latencyMs: number | null;
  status: number;
  checkedAt: string;
  detail?: string;
}

/**
 * Lightweight liveness probe against graph.facebook.com. Deliberately hits an
 * unauthenticated path so it measures transport latency, not credential state.
 */
export async function pingGraph(): Promise<PingResult> {
  const config = await getMetaConfig();
  if (config.mock) {
    return { reachable: true, latencyMs: 9, status: 200, checkedAt: new Date().toISOString(), detail: 'mock' };
  }

  const started = performance.now();
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 8_000);
  try {
    const res = await fetch(`${GRAPH_HOST}/${config.apiVersion}/`, {
      method: 'GET',
      signal: controller.signal,
      cache: 'no-store',
    });
    const latencyMs = Math.round(performance.now() - started);
    // Any HTTP answer proves the edge is reachable; 400 is the expected reply
    // for a version root with no node id.
    return {
      reachable: true,
      latencyMs,
      status: res.status,
      checkedAt: new Date().toISOString(),
    };
  } catch (err) {
    return {
      reachable: false,
      latencyMs: null,
      status: 0,
      checkedAt: new Date().toISOString(),
      detail: err instanceof Error ? err.message : String(err),
    };
  } finally {
    clearTimeout(timer);
  }
}
