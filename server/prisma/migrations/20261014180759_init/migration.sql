-- CreateTable
CREATE TABLE "User" (
    "id" TEXT NOT NULL,
    "username" TEXT NOT NULL,
    "fullName" TEXT NOT NULL,
    "email" TEXT,
    "passwordHash" TEXT NOT NULL,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "lastLoginAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "User_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Role" (
    "id" TEXT NOT NULL,
    "code" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "roleType" TEXT NOT NULL DEFAULT 'LOS',
    "platform" TEXT,
    "isSystem" BOOLEAN NOT NULL DEFAULT false,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "sourceRef" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Role_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Permission" (
    "id" TEXT NOT NULL,
    "code" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "module" TEXT NOT NULL,
    "description" TEXT,

    CONSTRAINT "Permission_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "UserRole" (
    "userId" TEXT NOT NULL,
    "roleId" TEXT NOT NULL,

    CONSTRAINT "UserRole_pkey" PRIMARY KEY ("userId","roleId")
);

-- CreateTable
CREATE TABLE "RolePermission" (
    "roleId" TEXT NOT NULL,
    "permissionId" TEXT NOT NULL,

    CONSTRAINT "RolePermission_pkey" PRIMARY KEY ("roleId","permissionId")
);

-- CreateTable
CREATE TABLE "Product" (
    "id" TEXT NOT NULL,
    "code" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "category" TEXT,
    "description" TEXT,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    "sourceNote" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Product_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Scheme" (
    "id" TEXT NOT NULL,
    "productId" TEXT NOT NULL,
    "code" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "needsConfirmation" BOOLEAN NOT NULL DEFAULT false,
    "sourceRef" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Scheme_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ConfigVersion" (
    "id" TEXT NOT NULL,
    "productId" TEXT NOT NULL,
    "versionNo" INTEGER NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'DRAFT',
    "title" TEXT,
    "notes" TEXT,
    "basedOnVersionId" TEXT,
    "createdById" TEXT,
    "createdByName" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "lastModifiedByName" TEXT,
    "submittedByName" TEXT,
    "submittedAt" TIMESTAMP(3),
    "approvedByName" TEXT,
    "approvedAt" TIMESTAMP(3),
    "publishedByName" TEXT,
    "publishedAt" TIMESTAMP(3),
    "rejectionNote" TEXT,

    CONSTRAINT "ConfigVersion_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Stage" (
    "id" TEXT NOT NULL,
    "versionId" TEXT NOT NULL,
    "key" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "platform" TEXT,
    "sequence" INTEGER NOT NULL DEFAULT 0,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "needsConfirmation" BOOLEAN NOT NULL DEFAULT false,
    "sourceRef" TEXT,

    CONSTRAINT "Stage_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "SubStage" (
    "id" TEXT NOT NULL,
    "stageId" TEXT NOT NULL,
    "key" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "platform" TEXT,
    "primaryRoleCode" TEXT,
    "sequence" INTEGER NOT NULL DEFAULT 0,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "needsConfirmation" BOOLEAN NOT NULL DEFAULT false,
    "sourceRef" TEXT,

    CONSTRAINT "SubStage_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Module" (
    "id" TEXT NOT NULL,
    "subStageId" TEXT NOT NULL,
    "key" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "repeatable" BOOLEAN NOT NULL DEFAULT false,
    "sequence" INTEGER NOT NULL DEFAULT 0,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "needsConfirmation" BOOLEAN NOT NULL DEFAULT false,
    "sourceRef" TEXT,

    CONSTRAINT "Module_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "FieldDefinition" (
    "id" TEXT NOT NULL,
    "key" TEXT NOT NULL,
    "label" TEXT NOT NULL,
    "type" TEXT NOT NULL,
    "description" TEXT,
    "defaults" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "FieldDefinition_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Field" (
    "id" TEXT NOT NULL,
    "subStageId" TEXT NOT NULL,
    "moduleId" TEXT,
    "definitionId" TEXT,
    "key" TEXT NOT NULL,
    "label" TEXT NOT NULL,
    "type" TEXT NOT NULL,
    "helpText" TEXT,
    "placeholder" TEXT,
    "requirement" TEXT NOT NULL DEFAULT 'OPTIONAL',
    "defaultValue" TEXT,
    "minValue" DOUBLE PRECISION,
    "maxValue" DOUBLE PRECISION,
    "minLength" INTEGER,
    "maxLength" INTEGER,
    "pattern" TEXT,
    "patternMessage" TEXT,
    "format" TEXT,
    "dateMin" TEXT,
    "dateMax" TEXT,
    "readOnly" BOOLEAN NOT NULL DEFAULT false,
    "formula" TEXT,
    "sequence" INTEGER NOT NULL DEFAULT 0,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "sensitive" BOOLEAN NOT NULL DEFAULT false,
    "maskingRule" TEXT,
    "dataMapping" TEXT,
    "schemeCodes" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "visibleRoleCodes" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "editableRoleCodes" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "needsConfirmation" BOOLEAN NOT NULL DEFAULT false,
    "sourceRef" TEXT,
    "notes" TEXT,

    CONSTRAINT "Field_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "FieldOption" (
    "id" TEXT NOT NULL,
    "fieldId" TEXT NOT NULL,
    "value" TEXT NOT NULL,
    "label" TEXT NOT NULL,
    "sequence" INTEGER NOT NULL DEFAULT 0,
    "active" BOOLEAN NOT NULL DEFAULT true,

    CONSTRAINT "FieldOption_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "FieldRule" (
    "id" TEXT NOT NULL,
    "fieldId" TEXT NOT NULL,
    "ruleType" TEXT NOT NULL,
    "logic" TEXT NOT NULL DEFAULT 'ALL',
    "conditions" JSONB NOT NULL,
    "expression" TEXT,
    "message" TEXT,
    "active" BOOLEAN NOT NULL DEFAULT true,

    CONSTRAINT "FieldRule_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "DocumentRequirement" (
    "id" TEXT NOT NULL,
    "versionId" TEXT NOT NULL,
    "subStageId" TEXT,
    "code" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "category" TEXT,
    "requirement" TEXT NOT NULL DEFAULT 'MANDATORY',
    "captureMode" TEXT NOT NULL DEFAULT 'CAMERA_OR_UPLOAD',
    "allowedTypes" TEXT,
    "maxSizeMb" DOUBLE PRECISION,
    "minCount" INTEGER NOT NULL DEFAULT 1,
    "maxCount" INTEGER,
    "schemeCodes" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "validatedByRoleCodes" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "sequence" INTEGER NOT NULL DEFAULT 0,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "needsConfirmation" BOOLEAN NOT NULL DEFAULT false,
    "sourceRef" TEXT,
    "notes" TEXT,

    CONSTRAINT "DocumentRequirement_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "WorkflowTransition" (
    "id" TEXT NOT NULL,
    "versionId" TEXT NOT NULL,
    "fromSubStageId" TEXT NOT NULL,
    "toSubStageId" TEXT,
    "actionCode" TEXT NOT NULL,
    "actionLabel" TEXT NOT NULL,
    "outcome" TEXT NOT NULL,
    "resultingStatus" TEXT,
    "conditionLogic" TEXT NOT NULL DEFAULT 'ALL',
    "conditions" JSONB NOT NULL DEFAULT '[]',
    "allowedRoleCodes" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "remarksRequired" BOOLEAN NOT NULL DEFAULT false,
    "requireAllMandatoryFields" BOOLEAN NOT NULL DEFAULT false,
    "requiredFieldKeys" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "requiredDocCodes" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "exceptionHandling" TEXT,
    "isTerminal" BOOLEAN NOT NULL DEFAULT false,
    "sequence" INTEGER NOT NULL DEFAULT 0,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "needsConfirmation" BOOLEAN NOT NULL DEFAULT false,
    "sourceRef" TEXT,

    CONSTRAINT "WorkflowTransition_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AuditLog" (
    "id" TEXT NOT NULL,
    "at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "userId" TEXT,
    "username" TEXT,
    "action" TEXT NOT NULL,
    "entityType" TEXT NOT NULL,
    "entityId" TEXT,
    "productId" TEXT,
    "versionId" TEXT,
    "summary" TEXT NOT NULL,
    "before" JSONB,
    "after" JSONB,
    "ip" TEXT,

    CONSTRAINT "AuditLog_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "SystemSetting" (
    "key" TEXT NOT NULL,
    "value" TEXT NOT NULL,
    "description" TEXT,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "updatedBy" TEXT,

    CONSTRAINT "SystemSetting_pkey" PRIMARY KEY ("key")
);

-- CreateIndex
CREATE UNIQUE INDEX "User_username_key" ON "User"("username");

-- CreateIndex
CREATE UNIQUE INDEX "Role_code_key" ON "Role"("code");

-- CreateIndex
CREATE UNIQUE INDEX "Permission_code_key" ON "Permission"("code");

-- CreateIndex
CREATE UNIQUE INDEX "Product_code_key" ON "Product"("code");

-- CreateIndex
CREATE UNIQUE INDEX "Scheme_productId_code_key" ON "Scheme"("productId", "code");

-- CreateIndex
CREATE INDEX "ConfigVersion_productId_status_idx" ON "ConfigVersion"("productId", "status");

-- CreateIndex
CREATE UNIQUE INDEX "ConfigVersion_productId_versionNo_key" ON "ConfigVersion"("productId", "versionNo");

-- CreateIndex
CREATE INDEX "Stage_versionId_sequence_idx" ON "Stage"("versionId", "sequence");

-- CreateIndex
CREATE UNIQUE INDEX "Stage_versionId_key_key" ON "Stage"("versionId", "key");

-- CreateIndex
CREATE INDEX "SubStage_stageId_sequence_idx" ON "SubStage"("stageId", "sequence");

-- CreateIndex
CREATE INDEX "Module_subStageId_sequence_idx" ON "Module"("subStageId", "sequence");

-- CreateIndex
CREATE UNIQUE INDEX "FieldDefinition_key_key" ON "FieldDefinition"("key");

-- CreateIndex
CREATE INDEX "Field_subStageId_moduleId_sequence_idx" ON "Field"("subStageId", "moduleId", "sequence");

-- CreateIndex
CREATE INDEX "FieldOption_fieldId_sequence_idx" ON "FieldOption"("fieldId", "sequence");

-- CreateIndex
CREATE INDEX "DocumentRequirement_versionId_subStageId_idx" ON "DocumentRequirement"("versionId", "subStageId");

-- CreateIndex
CREATE INDEX "WorkflowTransition_versionId_fromSubStageId_idx" ON "WorkflowTransition"("versionId", "fromSubStageId");

-- CreateIndex
CREATE INDEX "AuditLog_at_idx" ON "AuditLog"("at");

-- CreateIndex
CREATE INDEX "AuditLog_entityType_entityId_idx" ON "AuditLog"("entityType", "entityId");

-- CreateIndex
CREATE INDEX "AuditLog_productId_idx" ON "AuditLog"("productId");

-- AddForeignKey
ALTER TABLE "UserRole" ADD CONSTRAINT "UserRole_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "UserRole" ADD CONSTRAINT "UserRole_roleId_fkey" FOREIGN KEY ("roleId") REFERENCES "Role"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "RolePermission" ADD CONSTRAINT "RolePermission_roleId_fkey" FOREIGN KEY ("roleId") REFERENCES "Role"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "RolePermission" ADD CONSTRAINT "RolePermission_permissionId_fkey" FOREIGN KEY ("permissionId") REFERENCES "Permission"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Scheme" ADD CONSTRAINT "Scheme_productId_fkey" FOREIGN KEY ("productId") REFERENCES "Product"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ConfigVersion" ADD CONSTRAINT "ConfigVersion_productId_fkey" FOREIGN KEY ("productId") REFERENCES "Product"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Stage" ADD CONSTRAINT "Stage_versionId_fkey" FOREIGN KEY ("versionId") REFERENCES "ConfigVersion"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SubStage" ADD CONSTRAINT "SubStage_stageId_fkey" FOREIGN KEY ("stageId") REFERENCES "Stage"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Module" ADD CONSTRAINT "Module_subStageId_fkey" FOREIGN KEY ("subStageId") REFERENCES "SubStage"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Field" ADD CONSTRAINT "Field_subStageId_fkey" FOREIGN KEY ("subStageId") REFERENCES "SubStage"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Field" ADD CONSTRAINT "Field_moduleId_fkey" FOREIGN KEY ("moduleId") REFERENCES "Module"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "FieldOption" ADD CONSTRAINT "FieldOption_fieldId_fkey" FOREIGN KEY ("fieldId") REFERENCES "Field"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "FieldRule" ADD CONSTRAINT "FieldRule_fieldId_fkey" FOREIGN KEY ("fieldId") REFERENCES "Field"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DocumentRequirement" ADD CONSTRAINT "DocumentRequirement_versionId_fkey" FOREIGN KEY ("versionId") REFERENCES "ConfigVersion"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DocumentRequirement" ADD CONSTRAINT "DocumentRequirement_subStageId_fkey" FOREIGN KEY ("subStageId") REFERENCES "SubStage"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "WorkflowTransition" ADD CONSTRAINT "WorkflowTransition_versionId_fkey" FOREIGN KEY ("versionId") REFERENCES "ConfigVersion"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "WorkflowTransition" ADD CONSTRAINT "WorkflowTransition_fromSubStageId_fkey" FOREIGN KEY ("fromSubStageId") REFERENCES "SubStage"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "WorkflowTransition" ADD CONSTRAINT "WorkflowTransition_toSubStageId_fkey" FOREIGN KEY ("toSubStageId") REFERENCES "SubStage"("id") ON DELETE SET NULL ON UPDATE CASCADE;
