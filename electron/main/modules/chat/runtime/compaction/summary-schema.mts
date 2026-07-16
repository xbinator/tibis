/**
 * @file summary-schema.mts
 * @description 结构化上下文摘要 JSON Schema 与跨字段语义校验。
 */
import type { JSONSchema7 } from 'json-schema';
import type { CompactionValidationErrorCode, StructuredContextSummary } from 'types/chat';

/** 摘要运行时校验错误码。 */
export type SummaryValidationErrorCode = CompactionValidationErrorCode;

/** 摘要运行时校验结果。 */
export type SummaryValidationResult = { ok: true; summary: StructuredContextSummary } | { ok: false; errorCode: SummaryValidationErrorCode };

/** 非空字符串 schema。 */
const nonEmptyStringSchema: JSONSchema7 = { type: 'string', minLength: 1 };

/** 非空字符串数组 schema。 */
const nonEmptyStringArraySchema: JSONSchema7 = {
  type: 'array',
  minItems: 1,
  items: nonEmptyStringSchema
};

/** Owner schema。 */
const ownerSchema: JSONSchema7 = {
  type: 'object',
  additionalProperties: false,
  required: ['type'],
  properties: {
    type: { type: 'string', enum: ['user', 'assistant', 'tool', 'external'] },
    id: nonEmptyStringSchema
  }
};

/** Objective schema。 */
const objectiveSchema: JSONSchema7 = {
  type: 'object',
  additionalProperties: false,
  required: ['id', 'description', 'status', 'successCriteria', 'sourcePartIds'],
  properties: {
    id: nonEmptyStringSchema,
    description: nonEmptyStringSchema,
    status: { type: 'string', enum: ['active', 'completed', 'blocked', 'superseded', 'abandoned'] },
    successCriteria: nonEmptyStringArraySchema,
    parentId: nonEmptyStringSchema,
    supersededById: nonEmptyStringSchema,
    sourcePartIds: nonEmptyStringArraySchema
  }
};

/** Context fact schema。 */
const factSchema: JSONSchema7 = {
  type: 'object',
  additionalProperties: false,
  required: ['id', 'type', 'content', 'sourcePartIds'],
  properties: {
    id: nonEmptyStringSchema,
    type: {
      type: 'string',
      enum: ['requirement', 'preference', 'constraint', 'decision', 'critical_fact', 'conversation_continuity']
    },
    content: nonEmptyStringSchema,
    sourcePartIds: nonEmptyStringArraySchema
  }
};

/** Artifact schema。 */
const artifactSchema: JSONSchema7 = {
  type: 'object',
  additionalProperties: false,
  required: ['id', 'purpose', 'status', 'keyChanges', 'shouldReload', 'sourcePartIds'],
  properties: {
    id: nonEmptyStringSchema,
    path: nonEmptyStringSchema,
    purpose: nonEmptyStringSchema,
    status: { type: 'string', enum: ['read', 'created', 'modified', 'deleted'] },
    keyChanges: { type: 'array', items: { type: 'string' } },
    shouldReload: { type: 'boolean' },
    sourcePartIds: nonEmptyStringArraySchema
  }
};

/** Context action schema。 */
const actionSchema: JSONSchema7 = {
  type: 'object',
  additionalProperties: false,
  required: ['id', 'description', 'owner', 'sourcePartIds'],
  properties: {
    id: nonEmptyStringSchema,
    description: nonEmptyStringSchema,
    owner: ownerSchema,
    sourcePartIds: nonEmptyStringArraySchema
  }
};

/** Open question schema。 */
const questionSchema: JSONSchema7 = {
  type: 'object',
  additionalProperties: false,
  required: ['id', 'question', 'owner', 'sourcePartIds'],
  properties: {
    id: nonEmptyStringSchema,
    question: nonEmptyStringSchema,
    owner: ownerSchema,
    sourcePartIds: nonEmptyStringArraySchema
  }
};

/** Context failure schema。 */
const failureSchema: JSONSchema7 = {
  type: 'object',
  additionalProperties: false,
  required: ['id', 'description', 'resolved', 'sourcePartIds'],
  properties: {
    id: nonEmptyStringSchema,
    description: nonEmptyStringSchema,
    resolved: { type: 'boolean' },
    sourcePartIds: nonEmptyStringArraySchema
  }
};

/** AI SDK 结构化输出使用的完整摘要 JSON Schema。 */
export const structuredSummarySchema: JSONSchema7 = {
  type: 'object',
  additionalProperties: false,
  required: ['schemaVersion', 'objectives', 'facts', 'artifacts', 'completedActions', 'pendingActions', 'openQuestions', 'failures'],
  properties: {
    schemaVersion: { type: 'number', const: 1 },
    activeObjectiveId: nonEmptyStringSchema,
    objectives: { type: 'array', items: objectiveSchema },
    facts: { type: 'array', items: factSchema },
    artifacts: { type: 'array', items: artifactSchema },
    completedActions: { type: 'array', items: actionSchema },
    pendingActions: { type: 'array', items: actionSchema },
    openQuestions: { type: 'array', items: questionSchema },
    failures: { type: 'array', items: failureSchema }
  }
};

/**
 * 判断值是否为记录对象。
 * @param value - 待判断值
 * @returns 是否为记录对象
 */
function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

/**
 * 判断值是否为非空字符串。
 * @param value - 待判断值
 * @returns 是否为非空字符串
 */
function isNonEmptyString(value: unknown): value is string {
  return typeof value === 'string' && value.length > 0;
}

/**
 * 判断记录是否只包含允许字段并具备全部必填字段。
 * @param value - 记录对象
 * @param requiredKeys - 必填字段
 * @param allowedKeys - 允许字段
 * @returns 字段集合是否有效
 */
function hasValidKeys(value: Record<string, unknown>, requiredKeys: readonly string[], allowedKeys: readonly string[]): boolean {
  return requiredKeys.every((key: string): boolean => key in value) && Object.keys(value).every((key: string): boolean => allowedKeys.includes(key));
}

/**
 * 判断值是否为字符串数组。
 * @param value - 待判断值
 * @param requireItems - 是否要求至少一项
 * @returns 是否为合法字符串数组
 */
function isStringArray(value: unknown, requireItems: boolean): value is string[] {
  return Array.isArray(value) && (!requireItems || value.length > 0) && value.every(isNonEmptyString);
}

/**
 * 判断值是否为合法 owner。
 * @param value - 待判断值
 * @returns 是否为 owner
 */
function isOwner(value: unknown): boolean {
  if (!isRecord(value) || !hasValidKeys(value, ['type'], ['type', 'id'])) return false;
  const ownerTypes = new Set<string>(['user', 'assistant', 'tool', 'external']);
  return typeof value.type === 'string' && ownerTypes.has(value.type) && (value.id === undefined || isNonEmptyString(value.id));
}

/**
 * 判断值是否为合法 objective。
 * @param value - 待判断值
 * @returns 是否为 objective
 */
function isObjective(value: unknown): boolean {
  if (
    !isRecord(value) ||
    !hasValidKeys(
      value,
      ['id', 'description', 'status', 'successCriteria', 'sourcePartIds'],
      ['id', 'description', 'status', 'successCriteria', 'parentId', 'supersededById', 'sourcePartIds']
    )
  ) {
    return false;
  }
  const statuses = new Set<string>(['active', 'completed', 'blocked', 'superseded', 'abandoned']);
  return (
    isNonEmptyString(value.id) &&
    isNonEmptyString(value.description) &&
    typeof value.status === 'string' &&
    statuses.has(value.status) &&
    isStringArray(value.successCriteria, true) &&
    (value.parentId === undefined || isNonEmptyString(value.parentId)) &&
    (value.supersededById === undefined || isNonEmptyString(value.supersededById)) &&
    isStringArray(value.sourcePartIds, true)
  );
}

/**
 * 判断值是否为合法 context fact。
 * @param value - 待判断值
 * @returns 是否为 context fact
 */
function isContextFact(value: unknown): boolean {
  if (!isRecord(value) || !hasValidKeys(value, ['id', 'type', 'content', 'sourcePartIds'], ['id', 'type', 'content', 'sourcePartIds'])) return false;
  const factTypes = new Set<string>(['requirement', 'preference', 'constraint', 'decision', 'critical_fact', 'conversation_continuity']);
  return (
    isNonEmptyString(value.id) &&
    typeof value.type === 'string' &&
    factTypes.has(value.type) &&
    isNonEmptyString(value.content) &&
    isStringArray(value.sourcePartIds, true)
  );
}

/**
 * 判断值是否为合法 artifact。
 * @param value - 待判断值
 * @returns 是否为 artifact
 */
function isArtifact(value: unknown): boolean {
  if (
    !isRecord(value) ||
    !hasValidKeys(
      value,
      ['id', 'purpose', 'status', 'keyChanges', 'shouldReload', 'sourcePartIds'],
      ['id', 'path', 'purpose', 'status', 'keyChanges', 'shouldReload', 'sourcePartIds']
    )
  ) {
    return false;
  }
  const statuses = new Set<string>(['read', 'created', 'modified', 'deleted']);
  return (
    isNonEmptyString(value.id) &&
    (value.path === undefined || isNonEmptyString(value.path)) &&
    isNonEmptyString(value.purpose) &&
    typeof value.status === 'string' &&
    statuses.has(value.status) &&
    isStringArray(value.keyChanges, false) &&
    typeof value.shouldReload === 'boolean' &&
    isStringArray(value.sourcePartIds, true)
  );
}

/**
 * 判断值是否为合法 context action。
 * @param value - 待判断值
 * @returns 是否为 context action
 */
function isContextAction(value: unknown): boolean {
  return (
    isRecord(value) &&
    hasValidKeys(value, ['id', 'description', 'owner', 'sourcePartIds'], ['id', 'description', 'owner', 'sourcePartIds']) &&
    isNonEmptyString(value.id) &&
    isNonEmptyString(value.description) &&
    isOwner(value.owner) &&
    isStringArray(value.sourcePartIds, true)
  );
}

/**
 * 判断值是否为合法 open question。
 * @param value - 待判断值
 * @returns 是否为 open question
 */
function isOpenQuestion(value: unknown): boolean {
  return (
    isRecord(value) &&
    hasValidKeys(value, ['id', 'question', 'owner', 'sourcePartIds'], ['id', 'question', 'owner', 'sourcePartIds']) &&
    isNonEmptyString(value.id) &&
    isNonEmptyString(value.question) &&
    isOwner(value.owner) &&
    isStringArray(value.sourcePartIds, true)
  );
}

/**
 * 判断值是否为合法 context failure。
 * @param value - 待判断值
 * @returns 是否为 context failure
 */
function isContextFailure(value: unknown): boolean {
  return (
    isRecord(value) &&
    hasValidKeys(value, ['id', 'description', 'resolved', 'sourcePartIds'], ['id', 'description', 'resolved', 'sourcePartIds']) &&
    isNonEmptyString(value.id) &&
    isNonEmptyString(value.description) &&
    typeof value.resolved === 'boolean' &&
    isStringArray(value.sourcePartIds, true)
  );
}

/**
 * 判断数组每一项是否满足指定 validator。
 * @param value - 待判断数组
 * @param validator - 单项 validator
 * @returns 是否为合法数组
 */
function isValidArray(value: unknown, validator: (item: unknown) => boolean): boolean {
  return Array.isArray(value) && value.every(validator);
}

/**
 * 校验摘要根结构。
 * @param value - 待校验值
 * @returns 是否具备完整摘要形状
 */
function hasSummaryShape(value: unknown): value is StructuredContextSummary {
  if (
    !isRecord(value) ||
    !hasValidKeys(
      value,
      ['schemaVersion', 'objectives', 'facts', 'artifacts', 'completedActions', 'pendingActions', 'openQuestions', 'failures'],
      ['schemaVersion', 'activeObjectiveId', 'objectives', 'facts', 'artifacts', 'completedActions', 'pendingActions', 'openQuestions', 'failures']
    )
  ) {
    return false;
  }

  return (
    value.schemaVersion === 1 &&
    (value.activeObjectiveId === undefined || isNonEmptyString(value.activeObjectiveId)) &&
    isValidArray(value.objectives, isObjective) &&
    isValidArray(value.facts, isContextFact) &&
    isValidArray(value.artifacts, isArtifact) &&
    isValidArray(value.completedActions, isContextAction) &&
    isValidArray(value.pendingActions, isContextAction) &&
    isValidArray(value.openQuestions, isOpenQuestion) &&
    isValidArray(value.failures, isContextFailure)
  );
}

/**
 * 校验 objective ID 和目标漂移关系。
 * @param summary - 已通过形状校验的摘要
 * @returns objective 关系是否有效
 */
function hasValidObjectives(summary: StructuredContextSummary): boolean {
  const objectiveIds = new Set(summary.objectives.map((objective) => objective.id));
  if (objectiveIds.size !== summary.objectives.length) return false;

  for (const objective of summary.objectives) {
    if (objective.parentId && (objective.parentId === objective.id || !objectiveIds.has(objective.parentId))) return false;
    if (objective.supersededById && (objective.supersededById === objective.id || !objectiveIds.has(objective.supersededById))) return false;
    if (objective.status === 'superseded' && !objective.supersededById) return false;
  }

  if (!summary.activeObjectiveId) return !summary.objectives.some((objective) => objective.status === 'active');
  return summary.objectives.some((objective) => objective.id === summary.activeObjectiveId && objective.status === 'active');
}

/**
 * 收集摘要中的所有证据引用。
 * @param summary - 结构化摘要
 * @returns source Part ID 列表
 */
function collectSourceIds(summary: StructuredContextSummary): string[] {
  return [
    ...summary.objectives,
    ...summary.facts,
    ...summary.artifacts,
    ...summary.completedActions,
    ...summary.pendingActions,
    ...summary.openQuestions,
    ...summary.failures
  ].flatMap((item): string[] => item.sourcePartIds);
}

/**
 * 校验结构化摘要形状、目标关系和证据引用。
 * @param value - 模型结构化输出
 * @param allowedPartIds - 冻结源允许引用的 Part ID
 * @returns 摘要校验结果
 */
export function validateStructuredSummary(value: unknown, allowedPartIds: ReadonlySet<string>): SummaryValidationResult {
  if (!hasSummaryShape(value)) return { ok: false, errorCode: 'INVALID_SHAPE' };
  if (!hasValidObjectives(value)) return { ok: false, errorCode: 'INVALID_OBJECTIVE_RELATION' };
  if (collectSourceIds(value).some((partId: string): boolean => !allowedPartIds.has(partId))) {
    return { ok: false, errorCode: 'INVALID_REFERENCE' };
  }

  return { ok: true, summary: value };
}
