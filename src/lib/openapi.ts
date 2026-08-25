/**
 * OpenAPI 3.0.3 description of the internal gateway surface.
 * Served at GET /api/openapi and rendered by the Swagger UI page at /docs.
 */
export function buildOpenApiDocument(origin: string) {
  return {
    openapi: '3.0.3',
    info: {
      title: 'SentinelWA Internal Gateway',
      version: '1.0.0',
      description: [
        'Internal API gateway for WhatsApp Business Cloud messaging.',
        '',
        'Every endpoint under `/api/v1` requires an `x-api-key` header issued from the',
        '**API Keys** console. Keys carry scopes and a per-minute rate limit, and may be',
        'restricted to a set of source addresses.',
        '',
        '**Rate limiting** — responses carry `X-RateLimit-Limit`, `X-RateLimit-Remaining`',
        'and `X-RateLimit-Reset`. A `429` includes `Retry-After` in seconds.',
        '',
        '**Correlation** — every response carries `X-Request-Id`; send your own',
        '`X-Request-Id` to have it echoed back into the gateway logs.',
      ].join('\n'),
      contact: { name: 'SentinelWA operations console', url: `${origin}/` },
      license: { name: 'Internal use only' },
    },
    servers: [
      { url: origin, description: 'This gateway' },
      { url: 'http://localhost:3000', description: 'Local development' },
    ],
    tags: [
      { name: 'Messaging', description: 'Dispatch OTP and transactional messages.' },
      { name: 'Delivery', description: 'Inspect the delivery lifecycle of a message.' },
      { name: 'System', description: 'Liveness and readiness probes.' },
    ],
    components: {
      securitySchemes: {
        ApiKeyAuth: {
          type: 'apiKey',
          in: 'header',
          name: 'x-api-key',
          description: 'Bearer token issued from the SentinelWA console (`swa_live_…`).',
        },
      },
      schemas: {
        SendOtpRequest: {
          type: 'object',
          required: ['to', 'code'],
          properties: {
            to: {
              type: 'string',
              description: 'Recipient in E.164 form. Punctuation is stripped automatically.',
              example: '+6281234567890',
            },
            code: {
              type: 'string',
              description: 'The one-time code. 4–10 alphanumeric characters.',
              example: '482913',
            },
            template_name: {
              type: 'string',
              description: 'Override the configured authentication template.',
              example: 'otp_verification',
            },
            language: {
              type: 'string',
              description: 'Template language code.',
              default: 'en_US',
              example: 'en_US',
            },
            reference: {
              type: 'string',
              description: 'Free-form correlation string stored with the message record.',
              example: 'payroll-login-8823',
            },
          },
        },
        SendMessageRequest: {
          type: 'object',
          required: ['to', 'message'],
          properties: {
            to: { type: 'string', example: '+6281234567890' },
            message: {
              type: 'string',
              description: 'Body text for `type: text`, or the template name for `type: template`.',
              example: 'Your ticket INC-4821 has been resolved.',
            },
            type: { type: 'string', enum: ['text', 'template'], default: 'text' },
            language: { type: 'string', default: 'en_US', description: 'Template language (template type only).' },
            components: {
              type: 'array',
              description: 'Raw Meta template components (template type only).',
              items: { type: 'object', additionalProperties: true },
            },
          },
        },
        DispatchResponse: {
          type: 'object',
          properties: {
            ok: { type: 'boolean', example: true },
            message_id: { type: 'string', example: 'wamid.HBgNNjI4MTIzNDU2Nzg5MBUCABEYEjc…' },
            record_id: { type: 'string', example: 'clx8n2k9q0000v3l8f1p2c9d4' },
            status: { type: 'string', enum: ['sent', 'queued', 'failed'], example: 'sent' },
            to: { type: 'string', example: '6281234567890' },
            latency_ms: { type: 'integer', example: 412 },
            request_id: { type: 'string', example: 'a91f3c02b7d4e5f6' },
          },
        },
        StatusResponse: {
          type: 'object',
          properties: {
            ok: { type: 'boolean' },
            message_id: { type: 'string' },
            status: { type: 'string', enum: ['queued', 'sent', 'delivered', 'read', 'failed'] },
            to: { type: 'string' },
            direction: { type: 'string', enum: ['inbound', 'outbound'] },
            timeline: {
              type: 'object',
              properties: {
                created_at: { type: 'string', format: 'date-time' },
                sent_at: { type: 'string', format: 'date-time', nullable: true },
                delivered_at: { type: 'string', format: 'date-time', nullable: true },
                read_at: { type: 'string', format: 'date-time', nullable: true },
                failed_at: { type: 'string', format: 'date-time', nullable: true },
              },
            },
            error: {
              type: 'object',
              nullable: true,
              properties: { code: { type: 'string' }, message: { type: 'string' } },
            },
            request_id: { type: 'string' },
          },
        },
        HealthResponse: {
          type: 'object',
          properties: {
            ok: { type: 'boolean' },
            status: { type: 'string', enum: ['operational', 'unconfigured', 'degraded', 'critical', 'offline'] },
            uptime_seconds: { type: 'integer' },
            version: { type: 'string' },
            system: {
              type: 'object',
              properties: {
                node: { type: 'string' },
                cpu_percent: { type: 'number' },
                memory_percent: { type: 'number' },
                event_loop_p99_ms: { type: 'number' },
              },
            },
            database: {
              type: 'object',
              properties: {
                ok: { type: 'boolean' },
                read_ms: { type: 'number' },
                write_ms: { type: 'number' },
                size_bytes: { type: 'integer' },
              },
            },
            meta_api: {
              type: 'object',
              properties: {
                reachable: { type: 'boolean' },
                latency_ms: { type: 'number', nullable: true },
                circuit_breaker: { type: 'string', enum: ['closed', 'half_open', 'open'] },
                configured: { type: 'boolean' },
              },
            },
            webhook: {
              type: 'object',
              properties: {
                last_payload_at: { type: 'string', format: 'date-time', nullable: true },
                queue_depth: { type: 'integer' },
                error_rate: { type: 'number' },
              },
            },
            request_id: { type: 'string' },
          },
        },
        Error: {
          type: 'object',
          properties: {
            ok: { type: 'boolean', example: false },
            error: {
              type: 'object',
              properties: {
                code: {
                  type: 'string',
                  enum: [
                    'UNAUTHORIZED',
                    'KEY_REVOKED',
                    'IP_NOT_ALLOWED',
                    'FORBIDDEN_SCOPE',
                    'RATE_LIMITED',
                    'VALIDATION_ERROR',
                    'NOT_CONFIGURED',
                    'CIRCUIT_OPEN',
                    'META_ERROR',
                    'NOT_FOUND',
                    'INTERNAL_ERROR',
                  ],
                },
                message: { type: 'string' },
                details: { type: 'object', additionalProperties: true },
              },
            },
            request_id: { type: 'string' },
          },
        },
      },
      responses: {
        Unauthorized: {
          description: 'Missing or invalid `x-api-key`.',
          content: { 'application/json': { schema: { $ref: '#/components/schemas/Error' } } },
        },
        Forbidden: {
          description: 'Key revoked, source address not allowlisted, or scope missing.',
          content: { 'application/json': { schema: { $ref: '#/components/schemas/Error' } } },
        },
        RateLimited: {
          description: 'Per-key rate limit exceeded.',
          headers: {
            'Retry-After': { schema: { type: 'integer' }, description: 'Seconds until a slot frees up.' },
          },
          content: { 'application/json': { schema: { $ref: '#/components/schemas/Error' } } },
        },
        ValidationError: {
          description: 'The request body failed schema validation.',
          content: { 'application/json': { schema: { $ref: '#/components/schemas/Error' } } },
        },
      },
    },
    security: [{ ApiKeyAuth: [] }],
    paths: {
      '/api/v1/send-otp': {
        post: {
          tags: ['Messaging'],
          summary: 'Dispatch a one-time password',
          description:
            'Sends the code through a Meta **authentication** template, which is deliverable ' +
            'outside the 24-hour customer service window. Requires the `otp.send` scope.',
          operationId: 'sendOtp',
          requestBody: {
            required: true,
            content: { 'application/json': { schema: { $ref: '#/components/schemas/SendOtpRequest' } } },
          },
          responses: {
            200: {
              description: 'Accepted by Meta.',
              content: { 'application/json': { schema: { $ref: '#/components/schemas/DispatchResponse' } } },
            },
            400: { $ref: '#/components/responses/ValidationError' },
            401: { $ref: '#/components/responses/Unauthorized' },
            403: { $ref: '#/components/responses/Forbidden' },
            429: { $ref: '#/components/responses/RateLimited' },
            502: {
              description: 'Meta rejected the dispatch.',
              content: { 'application/json': { schema: { $ref: '#/components/schemas/Error' } } },
            },
          },
        },
      },
      '/api/v1/send-message': {
        post: {
          tags: ['Messaging'],
          summary: 'Dispatch a transactional or agent message',
          description:
            'Free-form `text` messages are only deliverable inside the 24-hour service window ' +
            'opened by an inbound customer message. Use `type: template` outside it. ' +
            'Requires the `message.send` scope.',
          operationId: 'sendMessage',
          requestBody: {
            required: true,
            content: { 'application/json': { schema: { $ref: '#/components/schemas/SendMessageRequest' } } },
          },
          responses: {
            200: {
              description: 'Accepted by Meta.',
              content: { 'application/json': { schema: { $ref: '#/components/schemas/DispatchResponse' } } },
            },
            400: { $ref: '#/components/responses/ValidationError' },
            401: { $ref: '#/components/responses/Unauthorized' },
            403: { $ref: '#/components/responses/Forbidden' },
            429: { $ref: '#/components/responses/RateLimited' },
            502: {
              description: 'Meta rejected the dispatch.',
              content: { 'application/json': { schema: { $ref: '#/components/schemas/Error' } } },
            },
          },
        },
      },
      '/api/v1/status/{message_id}': {
        get: {
          tags: ['Delivery'],
          summary: 'Read the live delivery status of a message',
          description:
            'Accepts either the Meta `wamid.…` identifier or the gateway record id returned ' +
            'by a dispatch call. Requires the `status.read` scope.',
          operationId: 'getMessageStatus',
          parameters: [
            {
              name: 'message_id',
              in: 'path',
              required: true,
              schema: { type: 'string' },
              example: 'wamid.HBgNNjI4MTIzNDU2Nzg5MBUCABEYEjc',
            },
          ],
          responses: {
            200: {
              description: 'Current status and timeline.',
              content: { 'application/json': { schema: { $ref: '#/components/schemas/StatusResponse' } } },
            },
            401: { $ref: '#/components/responses/Unauthorized' },
            403: { $ref: '#/components/responses/Forbidden' },
            404: {
              description: 'No message with that identifier.',
              content: { 'application/json': { schema: { $ref: '#/components/schemas/Error' } } },
            },
          },
        },
      },
      '/api/v1/health': {
        get: {
          tags: ['System'],
          summary: 'Gateway health check',
          description:
            'Returns runtime, database and Meta connectivity state. Suitable as a load balancer ' +
            'or monitoring probe. Requires the `health.read` scope.',
          operationId: 'getHealth',
          responses: {
            200: {
              description: 'Gateway is serving traffic.',
              content: { 'application/json': { schema: { $ref: '#/components/schemas/HealthResponse' } } },
            },
            401: { $ref: '#/components/responses/Unauthorized' },
            503: {
              description: 'A subsystem is unavailable.',
              content: { 'application/json': { schema: { $ref: '#/components/schemas/HealthResponse' } } },
            },
          },
        },
      },
      '/api/webhook': {
        get: {
          tags: ['System'],
          summary: 'Meta webhook verification handshake',
          description:
            'Called once by Meta when you save the callback URL in the App Dashboard. ' +
            'Echoes `hub.challenge` when `hub.verify_token` matches the configured secret. ' +
            'No `x-api-key` is required.',
          operationId: 'verifyWebhook',
          security: [],
          parameters: [
            { name: 'hub.mode', in: 'query', schema: { type: 'string', example: 'subscribe' } },
            { name: 'hub.verify_token', in: 'query', schema: { type: 'string' } },
            { name: 'hub.challenge', in: 'query', schema: { type: 'string' } },
          ],
          responses: {
            200: { description: 'Challenge echoed.', content: { 'text/plain': { schema: { type: 'string' } } } },
            403: { description: 'Verify token mismatch.' },
          },
        },
        post: {
          tags: ['System'],
          summary: 'Meta webhook receiver',
          description:
            'Receives inbound messages and delivery receipts. Every payload is validated ' +
            'against `x-hub-signature-256` using the app secret before it is parsed. ' +
            'No `x-api-key` is required — authentication is the signature.',
          operationId: 'receiveWebhook',
          security: [],
          parameters: [
            {
              name: 'x-hub-signature-256',
              in: 'header',
              required: true,
              schema: { type: 'string', example: 'sha256=6f1c…' },
            },
          ],
          requestBody: {
            required: true,
            content: { 'application/json': { schema: { type: 'object', additionalProperties: true } } },
          },
          responses: {
            200: { description: 'Payload accepted (always answer 200 so Meta stops retrying).' },
            401: { description: 'Signature validation failed.' },
          },
        },
      },
    },
  } as const;
}
