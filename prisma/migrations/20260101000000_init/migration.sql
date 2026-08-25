-- SentinelWA :: initial schema
-- Applied with `prisma migrate deploy` (production) or `prisma migrate dev` (local).

-- CreateTable
CREATE TABLE "ApiKey" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "keyPrefix" TEXT NOT NULL,
    "keyHash" TEXT NOT NULL,
    "scopes" TEXT NOT NULL DEFAULT 'otp.send,message.send,status.read,health.read',
    "rateLimitPerMin" INTEGER NOT NULL DEFAULT 120,
    "ipWhitelist" TEXT NOT NULL DEFAULT '',
    "active" BOOLEAN NOT NULL DEFAULT true,
    "requestCount" INTEGER NOT NULL DEFAULT 0,
    "lastUsedAt" DATETIME,
    "lastUsedIp" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "revokedAt" DATETIME
);

-- CreateTable
CREATE TABLE "Setting" (
    "key" TEXT NOT NULL PRIMARY KEY,
    "value" TEXT NOT NULL,
    "encrypted" BOOLEAN NOT NULL DEFAULT false,
    "updatedAt" DATETIME NOT NULL
);

-- CreateTable
CREATE TABLE "Contact" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "waId" TEXT NOT NULL,
    "displayName" TEXT,
    "profileName" TEXT,
    "optIn" BOOLEAN NOT NULL DEFAULT false,
    "blocked" BOOLEAN NOT NULL DEFAULT false,
    "note" TEXT,
    "lastInboundAt" DATETIME,
    "lastOutboundAt" DATETIME,
    "unreadCount" INTEGER NOT NULL DEFAULT 0,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL
);

-- CreateTable
CREATE TABLE "Message" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "wamid" TEXT,
    "waId" TEXT NOT NULL,
    "direction" TEXT NOT NULL DEFAULT 'outbound',
    "channel" TEXT NOT NULL DEFAULT 'text',
    "body" TEXT NOT NULL DEFAULT '',
    "templateName" TEXT,
    "templateLang" TEXT,
    "payload" TEXT,
    "status" TEXT NOT NULL DEFAULT 'queued',
    "errorCode" TEXT,
    "errorMessage" TEXT,
    "source" TEXT NOT NULL DEFAULT 'api',
    "conversationId" TEXT,
    "pricingCategory" TEXT,
    "sentAt" DATETIME,
    "deliveredAt" DATETIME,
    "readAt" DATETIME,
    "failedAt" DATETIME,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    "contactId" TEXT,
    "apiKeyId" TEXT,
    CONSTRAINT "Message_contactId_fkey" FOREIGN KEY ("contactId") REFERENCES "Contact" ("id") ON DELETE SET NULL ON UPDATE CASCADE,
    CONSTRAINT "Message_apiKeyId_fkey" FOREIGN KEY ("apiKeyId") REFERENCES "ApiKey" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "LogEntry" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "level" TEXT NOT NULL DEFAULT 'INFO',
    "channel" TEXT NOT NULL DEFAULT 'system',
    "message" TEXT NOT NULL,
    "meta" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- CreateTable
CREATE TABLE "WebhookEvent" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "eventType" TEXT NOT NULL DEFAULT 'unknown',
    "signatureValid" BOOLEAN NOT NULL DEFAULT false,
    "sourceIp" TEXT,
    "payload" TEXT NOT NULL,
    "processedAt" DATETIME,
    "error" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- CreateTable
CREATE TABLE "RequestMetric" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "path" TEXT NOT NULL,
    "method" TEXT NOT NULL,
    "statusCode" INTEGER NOT NULL,
    "durationMs" INTEGER NOT NULL,
    "sourceIp" TEXT,
    "outcome" TEXT NOT NULL DEFAULT 'ok',
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "apiKeyId" TEXT,
    CONSTRAINT "RequestMetric_apiKeyId_fkey" FOREIGN KEY ("apiKeyId") REFERENCES "ApiKey" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "CannedResponse" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "shortcut" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "body" TEXT NOT NULL,
    "useCount" INTEGER NOT NULL DEFAULT 0,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL
);

-- CreateIndex
CREATE UNIQUE INDEX "ApiKey_keyHash_key" ON "ApiKey"("keyHash");
CREATE INDEX "ApiKey_active_idx" ON "ApiKey"("active");

-- CreateIndex
CREATE UNIQUE INDEX "Contact_waId_key" ON "Contact"("waId");
CREATE INDEX "Contact_lastInboundAt_idx" ON "Contact"("lastInboundAt");

-- CreateIndex
CREATE UNIQUE INDEX "Message_wamid_key" ON "Message"("wamid");
CREATE INDEX "Message_waId_idx" ON "Message"("waId");
CREATE INDEX "Message_status_idx" ON "Message"("status");
CREATE INDEX "Message_createdAt_idx" ON "Message"("createdAt");
CREATE INDEX "Message_contactId_createdAt_idx" ON "Message"("contactId", "createdAt");

-- CreateIndex
CREATE INDEX "LogEntry_createdAt_idx" ON "LogEntry"("createdAt");
CREATE INDEX "LogEntry_level_idx" ON "LogEntry"("level");
CREATE INDEX "LogEntry_channel_idx" ON "LogEntry"("channel");

-- CreateIndex
CREATE INDEX "WebhookEvent_createdAt_idx" ON "WebhookEvent"("createdAt");

-- CreateIndex
CREATE INDEX "RequestMetric_createdAt_idx" ON "RequestMetric"("createdAt");
CREATE INDEX "RequestMetric_path_idx" ON "RequestMetric"("path");

-- CreateIndex
CREATE UNIQUE INDEX "CannedResponse_shortcut_key" ON "CannedResponse"("shortcut");
