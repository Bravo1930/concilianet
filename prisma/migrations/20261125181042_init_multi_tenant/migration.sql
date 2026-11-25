-- CreateTable
CREATE TABLE "Organization" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "name" TEXT NOT NULL,
    "plan" TEXT NOT NULL DEFAULT 'FREE',
    "maxRfcs" INTEGER NOT NULL DEFAULT 3,
    "stripeCustomerId" TEXT,
    "stripeSubscriptionId" TEXT,
    "subscriptionStatus" TEXT NOT NULL DEFAULT 'TRIALING',
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL
);

-- CreateTable
CREATE TABLE "User" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "email" TEXT NOT NULL,
    "passwordHash" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "role" TEXT NOT NULL DEFAULT 'AUXILIAR',
    "organizationId" TEXT NOT NULL,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "User_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "Client" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "rfc" TEXT NOT NULL,
    "razonSocial" TEXT NOT NULL,
    "regimenFiscal" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "Client_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "BankAccount" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "clientId" TEXT NOT NULL,
    "bankName" TEXT NOT NULL,
    "last4Digits" TEXT NOT NULL,
    "currency" TEXT NOT NULL DEFAULT 'MXN',
    "columnMappingJson" JSONB,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "BankAccount_clientId_fkey" FOREIGN KEY ("clientId") REFERENCES "Client" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "Cfdi" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "clientId" TEXT NOT NULL,
    "uuid" TEXT NOT NULL,
    "tipoComprobante" TEXT NOT NULL,
    "metodoPago" TEXT,
    "formaPago" TEXT,
    "fechaEmision" DATETIME NOT NULL,
    "rfcEmisor" TEXT NOT NULL,
    "nombreEmisor" TEXT NOT NULL,
    "rfcReceptor" TEXT NOT NULL,
    "nombreReceptor" TEXT NOT NULL,
    "subtotal" DECIMAL NOT NULL,
    "total" DECIMAL NOT NULL,
    "moneda" TEXT NOT NULL DEFAULT 'MXN',
    "tipoCambio" DECIMAL NOT NULL DEFAULT 1,
    "saldoPendiente" DECIMAL NOT NULL,
    "direccion" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'PENDIENTE',
    "relatedUuidsJson" JSONB,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "Cfdi_clientId_fkey" FOREIGN KEY ("clientId") REFERENCES "Client" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "BankTransaction" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "bankAccountId" TEXT NOT NULL,
    "clientId" TEXT NOT NULL,
    "fecha" DATETIME NOT NULL,
    "concepto" TEXT NOT NULL,
    "monto" DECIMAL NOT NULL,
    "tipo" TEXT NOT NULL,
    "hashUnico" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'SIN_FACTURA',
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "BankTransaction_bankAccountId_fkey" FOREIGN KEY ("bankAccountId") REFERENCES "BankAccount" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "BankTransaction_clientId_fkey" FOREIGN KEY ("clientId") REFERENCES "Client" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "Reconciliation" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "clientId" TEXT NOT NULL,
    "cfdiId" TEXT NOT NULL,
    "bankTransactionId" TEXT NOT NULL,
    "montoAplicado" DECIMAL NOT NULL,
    "matchType" TEXT NOT NULL,
    "confidenceScore" INTEGER NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'AUTO',
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "Reconciliation_clientId_fkey" FOREIGN KEY ("clientId") REFERENCES "Client" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "Reconciliation_cfdiId_fkey" FOREIGN KEY ("cfdiId") REFERENCES "Cfdi" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "Reconciliation_bankTransactionId_fkey" FOREIGN KEY ("bankTransactionId") REFERENCES "BankTransaction" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateIndex
CREATE UNIQUE INDEX "Organization_stripeCustomerId_key" ON "Organization"("stripeCustomerId");

-- CreateIndex
CREATE UNIQUE INDEX "Organization_stripeSubscriptionId_key" ON "Organization"("stripeSubscriptionId");

-- CreateIndex
CREATE UNIQUE INDEX "User_email_key" ON "User"("email");

-- CreateIndex
CREATE INDEX "User_organizationId_idx" ON "User"("organizationId");

-- CreateIndex
CREATE INDEX "Client_organizationId_idx" ON "Client"("organizationId");

-- CreateIndex
CREATE INDEX "Client_rfc_idx" ON "Client"("rfc");

-- CreateIndex
CREATE UNIQUE INDEX "Client_organizationId_rfc_key" ON "Client"("organizationId", "rfc");

-- CreateIndex
CREATE INDEX "BankAccount_clientId_idx" ON "BankAccount"("clientId");

-- CreateIndex
CREATE UNIQUE INDEX "Cfdi_uuid_key" ON "Cfdi"("uuid");

-- CreateIndex
CREATE INDEX "Cfdi_clientId_fechaEmision_idx" ON "Cfdi"("clientId", "fechaEmision");

-- CreateIndex
CREATE INDEX "Cfdi_clientId_status_idx" ON "Cfdi"("clientId", "status");

-- CreateIndex
CREATE INDEX "Cfdi_rfcEmisor_idx" ON "Cfdi"("rfcEmisor");

-- CreateIndex
CREATE INDEX "Cfdi_rfcReceptor_idx" ON "Cfdi"("rfcReceptor");

-- CreateIndex
CREATE UNIQUE INDEX "BankTransaction_hashUnico_key" ON "BankTransaction"("hashUnico");

-- CreateIndex
CREATE INDEX "BankTransaction_clientId_fecha_idx" ON "BankTransaction"("clientId", "fecha");

-- CreateIndex
CREATE INDEX "BankTransaction_clientId_status_idx" ON "BankTransaction"("clientId", "status");

-- CreateIndex
CREATE INDEX "BankTransaction_bankAccountId_idx" ON "BankTransaction"("bankAccountId");

-- CreateIndex
CREATE INDEX "Reconciliation_clientId_status_idx" ON "Reconciliation"("clientId", "status");

-- CreateIndex
CREATE INDEX "Reconciliation_cfdiId_idx" ON "Reconciliation"("cfdiId");

-- CreateIndex
CREATE INDEX "Reconciliation_bankTransactionId_idx" ON "Reconciliation"("bankTransactionId");

-- CreateIndex
CREATE UNIQUE INDEX "Reconciliation_cfdiId_bankTransactionId_key" ON "Reconciliation"("cfdiId", "bankTransactionId");
