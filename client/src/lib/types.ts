export interface User {
  id: string;
  username: string;
  fullName: string;
  roles: { code: string; name: string }[];
  permissions: string[];
}

export interface Scheme {
  id: string;
  productId: string;
  code: string;
  name: string;
  description?: string | null;
  active: boolean;
  needsConfirmation: boolean;
  sourceRef?: string | null;
}

export type VersionStatus = 'DRAFT' | 'SUBMITTED' | 'APPROVED' | 'PUBLISHED' | 'ARCHIVED';

export interface Version {
  id: string;
  productId: string;
  versionNo: number;
  status: VersionStatus;
  title?: string | null;
  notes?: string | null;
  basedOnVersionId?: string | null;
  createdByName?: string | null;
  createdAt: string;
  updatedAt: string;
  lastModifiedByName?: string | null;
  submittedByName?: string | null;
  submittedAt?: string | null;
  approvedByName?: string | null;
  approvedAt?: string | null;
  publishedByName?: string | null;
  publishedAt?: string | null;
  rejectionNote?: string | null;
  product?: Product;
}

export interface Product {
  id: string;
  code: string;
  name: string;
  category?: string | null;
  description?: string | null;
  active: boolean;
  sortOrder: number;
  sourceNote?: string | null;
  schemes: Scheme[];
  versions: Pick<Version, 'id' | 'versionNo' | 'status' | 'publishedAt' | 'updatedAt'>[];
  published?: Pick<Version, 'id' | 'versionNo' | 'status'> | null;
  openVersion?: Pick<Version, 'id' | 'versionNo' | 'status'> | null;
  counts?: { stages: number; subStages: number; fields: number };
}

export interface Condition {
  fieldKey: string;
  operator: string;
  value?: string | string[] | number | boolean | null;
}

export interface Rule {
  id?: string;
  ruleType: 'VISIBILITY' | 'REQUIRED' | 'VALIDATION';
  logic: 'ALL' | 'ANY';
  conditions: Condition[];
  expression?: string | null;
  message?: string | null;
  active: boolean;
}

export interface Option {
  id?: string;
  value: string;
  label: string;
  active: boolean;
  sequence?: number;
}

export interface Field {
  id: string;
  subStageId: string;
  moduleId: string | null;
  key: string;
  label: string;
  type: string;
  helpText: string | null;
  placeholder: string | null;
  requirement: 'MANDATORY' | 'OPTIONAL' | 'CONDITIONAL';
  defaultValue: string | null;
  minValue: number | null;
  maxValue: number | null;
  minLength: number | null;
  maxLength: number | null;
  pattern: string | null;
  patternMessage: string | null;
  format: string | null;
  dateMin: string | null;
  dateMax: string | null;
  readOnly: boolean;
  formula: string | null;
  sequence: number;
  active: boolean;
  sensitive: boolean;
  maskingRule: string | null;
  dataMapping: string | null;
  schemeCodes: string[];
  visibleRoleCodes: string[];
  editableRoleCodes: string[];
  needsConfirmation: boolean;
  sourceRef: string | null;
  notes: string | null;
  options: Option[];
  rules: Rule[];
}

export interface Module {
  id: string;
  subStageId: string;
  key: string;
  name: string;
  description: string | null;
  repeatable: boolean;
  sequence: number;
  active: boolean;
  needsConfirmation: boolean;
  sourceRef: string | null;
}

export interface SubStage {
  id: string;
  stageId: string;
  key: string;
  name: string;
  description: string | null;
  platform: string | null;
  primaryRoleCode: string | null;
  sequence: number;
  active: boolean;
  needsConfirmation: boolean;
  sourceRef: string | null;
  modules: Module[];
  fields: Field[];
  _count?: { documents: number; transitionsFrom: number };
}

export interface Stage {
  id: string;
  versionId: string;
  key: string;
  name: string;
  description: string | null;
  platform: string | null;
  sequence: number;
  active: boolean;
  needsConfirmation: boolean;
  sourceRef: string | null;
  subStages: SubStage[];
}

export interface VersionTree extends Version {
  product: Product;
  stages: Stage[];
}

export interface Role {
  id: string;
  code: string;
  name: string;
  description: string | null;
  roleType: 'PORTAL' | 'LOS';
  platform: string | null;
  isSystem: boolean;
  active: boolean;
  sourceRef: string | null;
  permissions: string[];
  _count: { users: number };
}

export interface Permission {
  id: string;
  code: string;
  name: string;
  module: string;
}

export interface DocumentReq {
  id: string;
  versionId: string;
  subStageId: string | null;
  code: string;
  name: string;
  category: string | null;
  requirement: string;
  captureMode: string;
  allowedTypes: string | null;
  maxSizeMb: number | null;
  minCount: number;
  maxCount: number | null;
  schemeCodes: string[];
  validatedByRoleCodes: string[];
  sequence: number;
  active: boolean;
  needsConfirmation: boolean;
  sourceRef: string | null;
  notes: string | null;
  subStage?: { id: string; name: string; stage: { id: string; name: string } } | null;
}

export interface Transition {
  id: string;
  versionId: string;
  fromSubStageId: string;
  toSubStageId: string | null;
  actionCode: string;
  actionLabel: string;
  outcome: string;
  resultingStatus: string | null;
  conditionLogic: 'ALL' | 'ANY';
  conditions: Condition[];
  allowedRoleCodes: string[];
  remarksRequired: boolean;
  requireAllMandatoryFields: boolean;
  requiredFieldKeys: string[];
  requiredDocCodes: string[];
  exceptionHandling: string | null;
  isTerminal: boolean;
  sequence: number;
  active: boolean;
  needsConfirmation: boolean;
  sourceRef: string | null;
  fromSubStage: { id: string; name: string; stage: { id: string; name: string } };
  toSubStage: { id: string; name: string; stage: { id: string; name: string } } | null;
}

export interface Issue {
  severity: 'error' | 'warning';
  path: string;
  message: string;
}

export interface ValidationReport {
  valid: boolean;
  errors: Issue[];
  warnings: Issue[];
  stats: Record<string, number>;
}

export interface DiffEntry {
  kind: 'added' | 'removed' | 'changed';
  level: string;
  path: string;
  label: string;
  changes?: { prop: string; from: unknown; to: unknown }[];
}

export interface DiffResult {
  entries: DiffEntry[];
  summary: { added: number; removed: number; changed: number };
}

export interface AuditEntry {
  id: string;
  at: string;
  username: string | null;
  action: string;
  entityType: string;
  entityId: string | null;
  productId: string | null;
  versionId: string | null;
  summary: string;
  before: unknown;
  after: unknown;
}
