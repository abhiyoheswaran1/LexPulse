ALTER TABLE "companies"
  ADD COLUMN "displayStatus" TEXT NOT NULL DEFAULT 'visible',
  ADD COLUMN "qualityReason" TEXT,
  ADD COLUMN "canonicalCompanyId" TEXT;

ALTER TABLE "companies"
  ADD CONSTRAINT "companies_canonicalCompanyId_fkey"
  FOREIGN KEY ("canonicalCompanyId") REFERENCES "companies"("id")
  ON DELETE SET NULL ON UPDATE CASCADE;

CREATE INDEX "companies_displayStatus_idx" ON "companies"("displayStatus");
CREATE INDEX "companies_canonicalCompanyId_idx" ON "companies"("canonicalCompanyId");

ALTER TABLE "observed_parties"
  ADD COLUMN "displayStatus" TEXT NOT NULL DEFAULT 'visible',
  ADD COLUMN "qualityReason" TEXT;

CREATE INDEX "observed_parties_displayStatus_idx" ON "observed_parties"("displayStatus");

CREATE TABLE "workspaces" (
  "id" TEXT NOT NULL,
  "name" TEXT NOT NULL,
  "slug" TEXT NOT NULL,
  "plan" TEXT NOT NULL DEFAULT 'starter',
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "workspaces_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "workspaces_slug_key" ON "workspaces"("slug");

CREATE TABLE "workspace_members" (
  "id" TEXT NOT NULL,
  "workspaceId" TEXT NOT NULL,
  "accountId" TEXT NOT NULL,
  "role" TEXT NOT NULL DEFAULT 'owner',
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "workspace_members_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "workspace_members_workspaceId_accountId_key" ON "workspace_members"("workspaceId", "accountId");
CREATE INDEX "workspace_members_accountId_idx" ON "workspace_members"("accountId");

ALTER TABLE "workspace_members"
  ADD CONSTRAINT "workspace_members_workspaceId_fkey"
  FOREIGN KEY ("workspaceId") REFERENCES "workspaces"("id")
  ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "workspace_members"
  ADD CONSTRAINT "workspace_members_accountId_fkey"
  FOREIGN KEY ("accountId") REFERENCES "accounts"("id")
  ON DELETE CASCADE ON UPDATE CASCADE;
