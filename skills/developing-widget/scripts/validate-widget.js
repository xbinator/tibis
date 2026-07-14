/**
 * @file validate-widget.js
 * @description Static validator for Tibis Widget package directories.
 */
import { lstat, readFile, readdir } from 'node:fs/promises';
import { isAbsolute, relative, resolve, sep } from 'node:path';
import { pathToFileURL } from 'node:url';

/**
 * A single validation diagnostic.
 * @typedef {Object} Diagnostic
 * @property {'error' | 'warning'} severity - Diagnostic severity.
 * @property {string} path - JSON path or package path related to the diagnostic.
 * @property {string} message - Human-readable diagnostic message.
 */

/**
 * Aggregated validator result.
 * @typedef {Object} ValidationResult
 * @property {Diagnostic[]} errors - Blocking package or schema errors.
 * @property {Diagnostic[]} warnings - Non-blocking authoring warnings.
 */

/**
 * Loop locals available while checking element bindings.
 * @typedef {Object} LoopScope
 * @property {Set<string>} names - Local names that should not be treated as data fields.
 */

/**
 * State shared while walking the Widget element tree.
 * @typedef {Object} ElementContext
 * @property {ValidationResult} result - Aggregated diagnostics.
 * @property {Set<string>} elementIds - Element IDs already seen in the tree.
 * @property {Set<string>} inputFields - Top-level input schema fields.
 * @property {Set<string>} outputFields - Top-level output schema fields.
 * @property {Set<string>} dataFields - Top-level runtime data fields.
 * @property {Set<string>} declaredMethods - Public method names detected in execute.code.
 * @property {number | null} pageWidth - Optional Widget page width.
 * @property {number | null} pageHeight - Optional Widget page height.
 * @property {number} offsetX - Absolute x offset inherited from parent groups.
 * @property {number} offsetY - Absolute y offset inherited from parent groups.
 * @property {LoopScope} loopScope - Binding names introduced by active loops.
 */

/**
 * Template expression extracted from a metadata value.
 * @typedef {Object} TemplateExpression
 * @property {string} path - Relative path inside the scanned value.
 * @property {string} expression - Expression body without template delimiters.
 */

const SUPPORTED_ELEMENT_NAMES = new Set(['rect', 'text', 'image', 'button', 'group']);
const SCHEMA_PROPERTY_TYPES = new Set(['string', 'number', 'boolean', 'object', 'array']);
const MAX_PACKAGE_FILES = 50;
const MAX_RESOURCE_BYTES = 5 * 1024 * 1024;
const LOCAL_RESOURCE_SKIP_PATTERN = /^(?:https?:\/\/|data:|blob:|\{\{)/i;
const IDENTIFIER_PATTERN = /^[A-Za-z_$][\w$]*$/;
const RESERVED_BINDING_NAMES = new Set(['Array', 'Date', 'JSON', 'Math', 'Number', 'Object', 'String', 'false', 'null', 'true', 'undefined']);

/**
 * Add a diagnostic to the correct result bucket.
 * @param {ValidationResult} result - Aggregated validation result.
 * @param {'error' | 'warning'} severity - Diagnostic severity.
 * @param {string} path - JSON path or package path.
 * @param {string} message - Diagnostic message.
 * @returns {void}
 */
function addDiagnostic(result, severity, path, message) {
  const diagnostic = { severity, path, message };

  if (severity === 'error') {
    result.errors.push(diagnostic);
    return;
  }

  result.warnings.push(diagnostic);
}

/**
 * Check whether a value is a non-array object.
 * @param {unknown} value - Value to inspect.
 * @returns {value is Record<string, unknown>} True when the value is a plain record-like object.
 */
function isRecord(value) {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}

/**
 * Check whether a value is a non-empty string.
 * @param {unknown} value - Value to inspect.
 * @returns {boolean} True when the value is a string with visible content.
 */
function isNonEmptyString(value) {
  return typeof value === 'string' && value.trim().length > 0;
}

/**
 * Validate a required string property.
 * @param {Record<string, unknown>} record - Object that owns the field.
 * @param {string} key - Field name.
 * @param {string} path - Diagnostic path for the field.
 * @param {ValidationResult} result - Aggregated validation result.
 * @param {{ nonEmpty?: boolean }} [options] - String validation options.
 * @returns {boolean} True when the field is valid.
 */
function validateStringField(record, key, path, result, options = {}) {
  const value = record[key];

  if (typeof value !== 'string') {
    addDiagnostic(result, 'error', path, 'must be a string');
    return false;
  }

  if (options.nonEmpty === true && value.trim().length === 0) {
    addDiagnostic(result, 'error', path, 'must be a non-empty string');
    return false;
  }

  return true;
}

/**
 * Validate a required boolean property.
 * @param {Record<string, unknown>} record - Object that owns the field.
 * @param {string} key - Field name.
 * @param {string} path - Diagnostic path for the field.
 * @param {ValidationResult} result - Aggregated validation result.
 * @returns {boolean} True when the field is valid.
 */
function validateBooleanField(record, key, path, result) {
  if (typeof record[key] !== 'boolean') {
    addDiagnostic(result, 'error', path, 'must be a boolean');
    return false;
  }

  return true;
}

/**
 * Validate a finite number with optional bounds.
 * @param {unknown} value - Value to validate.
 * @param {string} path - Diagnostic path.
 * @param {ValidationResult} result - Aggregated validation result.
 * @param {{ positive?: boolean, nonNegative?: boolean, integer?: boolean }} [options] - Numeric constraints.
 * @returns {boolean} True when the value is a finite number satisfying the constraints.
 */
function validateFiniteNumber(value, path, result, options = {}) {
  if (typeof value !== 'number' || Number.isFinite(value) === false) {
    addDiagnostic(result, 'error', path, 'must be a finite number');
    return false;
  }

  if (options.integer === true && Number.isInteger(value) === false) {
    addDiagnostic(result, 'error', path, 'must be an integer');
    return false;
  }

  if (options.positive === true && value <= 0) {
    addDiagnostic(result, 'error', path, 'must be a positive finite number');
    return false;
  }

  if (options.nonNegative === true && value < 0) {
    addDiagnostic(result, 'error', path, 'must be a non-negative finite number');
    return false;
  }

  return true;
}

/**
 * Validate a JSON schema required array and warn about unknown properties.
 * @param {unknown} value - Required array value.
 * @param {string} path - Diagnostic path for the array.
 * @param {Record<string, unknown>} properties - Declared schema properties.
 * @param {ValidationResult} result - Aggregated validation result.
 * @returns {boolean} True when the required array shape is valid.
 */
function validateRequiredArray(value, path, properties, result) {
  if (value === undefined) {
    return true;
  }

  if (Array.isArray(value) === false) {
    addDiagnostic(result, 'error', path, 'must be an array of unique property names');
    return false;
  }

  const seen = new Set();

  for (const [index, fieldName] of value.entries()) {
    const itemPath = `${path}[${index}]`;

    if (isNonEmptyString(fieldName) === false) {
      addDiagnostic(result, 'error', itemPath, 'must be a non-empty string');
      continue;
    }

    if (seen.has(fieldName)) {
      addDiagnostic(result, 'error', itemPath, `duplicate required field "${fieldName}"`);
      continue;
    }

    seen.add(fieldName);

    if (Object.prototype.hasOwnProperty.call(properties, fieldName) === false) {
      addDiagnostic(result, 'warning', itemPath, `required field "${fieldName}" is not declared in properties`);
    }
  }

  return true;
}

/**
 * Validate a schema property used inside Widget schemas.
 * @param {unknown} value - Schema property value.
 * @param {string} path - Diagnostic path.
 * @param {ValidationResult} result - Aggregated validation result.
 * @returns {void}
 */
function validateSchemaProperty(value, path, result) {
  if (isRecord(value) === false) {
    addDiagnostic(result, 'error', path, 'must be a schema object');
    return;
  }

  const { type } = value;

  if (typeof type !== 'string' || SCHEMA_PROPERTY_TYPES.has(type) === false) {
    addDiagnostic(result, 'error', `${path}.type`, 'must be one of string, number, boolean, object, or array');
    return;
  }

  if (value.description !== undefined && typeof value.description !== 'string') {
    addDiagnostic(result, 'error', `${path}.description`, 'must be a string when present');
  }

  if (type === 'object') {
    if (value.properties !== undefined && isRecord(value.properties) === false) {
      addDiagnostic(result, 'error', `${path}.properties`, 'must be an object when present');
    }

    if (isRecord(value.properties)) {
      for (const [propertyName, propertyValue] of Object.entries(value.properties)) {
        validateSchemaProperty(propertyValue, `${path}.properties.${propertyName}`, result);
      }
    }

    validateRequiredArray(value.required, `${path}.required`, isRecord(value.properties) ? value.properties : {}, result);
  }

  if (type === 'array' && value.items !== undefined) {
    validateSchemaProperty(value.items, `${path}.items`, result);
  }
}

/**
 * Validate a top-level Widget schema object.
 * @param {unknown} value - Schema object value.
 * @param {string} path - Diagnostic path.
 * @param {ValidationResult} result - Aggregated validation result.
 * @returns {void}
 */
function validateSchemaObject(value, path, result) {
  if (isRecord(value) === false) {
    addDiagnostic(result, 'error', path, 'must be an object schema');
    return;
  }

  if (value.type !== 'object') {
    addDiagnostic(result, 'error', `${path}.type`, 'must be "object"');
  }

  if (isRecord(value.properties) === false) {
    addDiagnostic(result, 'error', `${path}.properties`, 'must be an object');
  }

  if (isRecord(value.properties)) {
    for (const [propertyName, propertyValue] of Object.entries(value.properties)) {
      validateSchemaProperty(propertyValue, `${path}.properties.${propertyName}`, result);
    }
  }

  validateRequiredArray(value.required, `${path}.required`, isRecord(value.properties) ? value.properties : {}, result);
}

/**
 * Validate a Widget element loop configuration.
 * @param {unknown} value - Loop configuration value.
 * @param {string} path - Diagnostic path.
 * @param {ValidationResult} result - Aggregated validation result.
 * @returns {void}
 */
function validateLoop(value, path, result) {
  if (isRecord(value) === false) {
    addDiagnostic(result, 'error', path, 'must be an object');
    return;
  }

  validateBooleanField(value, 'enabled', `${path}.enabled`, result);
  validateStringField(value, 'source', `${path}.source`, result);

  if (value.autoColumns !== undefined && typeof value.autoColumns !== 'boolean') {
    addDiagnostic(result, 'error', `${path}.autoColumns`, 'must be a boolean when present');
  }

  if (value.columns === 'auto') {
    // The runtime accepts "auto" when auto columns are enabled.
  } else {
    validateFiniteNumber(value.columns, `${path}.columns`, result, { integer: true, positive: true });
  }

  validateFiniteNumber(value.columnGap, `${path}.columnGap`, result, { nonNegative: true });
  validateFiniteNumber(value.rowGap, `${path}.rowGap`, result, { nonNegative: true });
  validateStringField(value, 'itemName', `${path}.itemName`, result);
  validateStringField(value, 'indexName', `${path}.indexName`, result);

  if (value.enabled === true && isNonEmptyString(value.source) === false) {
    addDiagnostic(result, 'error', `${path}.source`, 'must be non-empty when loop is enabled');
  }
}

/**
 * Validate a number or side/corner object used by box-like style values.
 * @param {unknown} value - Style value to validate.
 * @param {string} path - Diagnostic path.
 * @param {ValidationResult} result - Aggregated validation result.
 * @returns {void}
 */
function validateBoxStyle(value, path, result) {
  if (value === undefined) {
    return;
  }

  if (typeof value === 'number') {
    validateFiniteNumber(value, path, result, { nonNegative: true });
    return;
  }

  if (isRecord(value) === false) {
    addDiagnostic(result, 'error', path, 'must be a non-negative number or object');
    return;
  }

  for (const [key, item] of Object.entries(value)) {
    validateFiniteNumber(item, `${path}.${key}`, result, { nonNegative: true });
  }
}

/**
 * Validate known numeric style values without trying to own all renderer styling.
 * @param {unknown} value - Element style value.
 * @param {string} path - Diagnostic path.
 * @param {ValidationResult} result - Aggregated validation result.
 * @returns {void}
 */
function validateStyle(value, path, result) {
  if (isRecord(value) === false) {
    addDiagnostic(result, 'error', path, 'must be an object');
    return;
  }

  const nonNegativeNumbers = ['fontWeight', 'lineHeight'];
  const positiveNumbers = ['fontSize'];

  if (value.opacity !== undefined) {
    const isValidOpacity = typeof value.opacity === 'number' && Number.isFinite(value.opacity) && value.opacity >= 0 && value.opacity <= 1;

    if (isValidOpacity === false) {
      addDiagnostic(result, 'error', `${path}.opacity`, 'must be a number between 0 and 1');
    }
  }

  for (const key of nonNegativeNumbers) {
    if (value[key] !== undefined) {
      validateFiniteNumber(value[key], `${path}.${key}`, result, { nonNegative: true });
    }
  }

  for (const key of positiveNumbers) {
    if (value[key] !== undefined) {
      validateFiniteNumber(value[key], `${path}.${key}`, result, { positive: true });
    }
  }

  validateBoxStyle(value.borderWidth, `${path}.borderWidth`, result);
  validateBoxStyle(value.borderRadius, `${path}.borderRadius`, result);
  validateBoxStyle(value.padding, `${path}.padding`, result);
  validateBoxStyle(value.margin, `${path}.margin`, result);
}

/**
 * Extract all moustache template expressions from a nested metadata value.
 * @param {unknown} value - Value to scan.
 * @returns {TemplateExpression[]} Template expressions with relative paths.
 */
function collectTemplateExpressions(value) {
  const expressions = [];

  /**
   * Walk nested metadata values and collect string expressions.
   * @param {unknown} item - Current value.
   * @param {string} path - Relative path for the current value.
   * @returns {void}
   */
  function visit(item, path) {
    if (typeof item === 'string') {
      const expressionPattern = /\{\{\s*([^}]+?)\s*\}\}/g;
      let match = expressionPattern.exec(item);

      while (match !== null) {
        expressions.push({ path, expression: match[1].trim() });
        match = expressionPattern.exec(item);
      }

      return;
    }

    if (Array.isArray(item)) {
      item.forEach((child, index) => visit(child, `${path}[${index}]`));
      return;
    }

    if (isRecord(item)) {
      for (const [key, child] of Object.entries(item)) {
        visit(child, path === '' ? key : `${path}.${key}`);
      }
    }
  }

  visit(value, '');
  return expressions;
}

/**
 * Detect class method names declared in Widget execute code.
 * @param {string} code - Widget execute code.
 * @returns {Set<string>} Method names detected by a conservative static regex.
 */
function collectDeclaredMethods(code) {
  const methods = new Set();
  const classPattern = /class\s+[A-Za-z_$][\w$]*\s+extends\s+Widget\s*\{([\s\S]*)\}/m;
  const classMatch = classPattern.exec(code);

  if (classMatch === null) {
    return methods;
  }

  const methodPattern = /(?:^|[\n\r])\s*(?:async\s+)?([A-Za-z_$][\w$]*)\s*\([^)]*\)\s*\{/g;
  let match = methodPattern.exec(classMatch[1]);

  while (match !== null) {
    if (match[1] !== 'constructor') {
      methods.add(match[1]);
    }

    match = methodPattern.exec(classMatch[1]);
  }

  return methods;
}

/**
 * Build a set from the top-level properties of a schema object.
 * @param {unknown} schema - Widget schema object.
 * @returns {Set<string>} Declared top-level property names.
 */
function collectSchemaFields(schema) {
  if (isRecord(schema) === false || isRecord(schema.properties) === false) {
    return new Set();
  }

  return new Set(Object.keys(schema.properties));
}

/**
 * Extract a simple bare runtime data binding from an expression.
 * @param {string} expression - Template expression after scoped references are removed.
 * @returns {string | null} Bare data binding root name, or null for complex expressions.
 */
function extractBareBindingName(expression) {
  const trimmed = expression.trim();

  if (trimmed.length === 0) {
    return null;
  }

  const rootName = trimmed.split('.')[0];

  if (IDENTIFIER_PATTERN.test(rootName) === false) {
    return null;
  }

  return rootName;
}

/**
 * Validate `$input`, `$output`, and runtime-data bindings in one expression.
 * @param {string} expression - Template expression or loop source.
 * @param {string} path - Diagnostic path for warnings.
 * @param {ElementContext} context - Current element validation context.
 * @returns {void}
 */
function validateBindingExpression(expression, path, context) {
  const scopedPattern = /\$(input|output)\.([A-Za-z_$][\w$]*)/g;
  const cleanedExpression = expression.replace(scopedPattern, (match, scope, fieldName) => {
    const fields = scope === 'input' ? context.inputFields : context.outputFields;

    if (fields.has(fieldName) === false) {
      addDiagnostic(context.result, 'warning', path, `undeclared ${scope} field "${fieldName}"`);
    }

    return ' ';
  });

  const bareName = extractBareBindingName(cleanedExpression);

  if (bareName === null || context.loopScope.names.has(bareName) || RESERVED_BINDING_NAMES.has(bareName)) {
    return;
  }

  if (context.dataFields.has(bareName) === false) {
    addDiagnostic(context.result, 'warning', path, `undeclared data field "${bareName}"`);
  }
}

/**
 * Validate all template bindings contained in a metadata object.
 * @param {unknown} value - Metadata value to scan.
 * @param {string} path - Base diagnostic path.
 * @param {ElementContext} context - Current element validation context.
 * @returns {void}
 */
function validateTemplateBindings(value, path, context) {
  for (const item of collectTemplateExpressions(value)) {
    const itemPath = item.path === '' ? path : `${path}.${item.path}`;
    validateBindingExpression(item.expression, itemPath, context);
  }
}

/**
 * Clone a loop scope and optionally add locals introduced by the current element loop.
 * @param {LoopScope} parentScope - Loop scope inherited from the parent.
 * @param {unknown} loop - Current loop object.
 * @returns {LoopScope} Scope for children of the current element.
 */
function createChildLoopScope(parentScope, loop) {
  const names = new Set(parentScope.names);

  if (isRecord(loop) && loop.enabled === true) {
    if (isNonEmptyString(loop.itemName)) {
      names.add(loop.itemName);
    }

    if (isNonEmptyString(loop.indexName)) {
      names.add(loop.indexName);
    }
  }

  return { names };
}

/**
 * Warn when an element's absolute bounding box exceeds declared Widget dimensions.
 * @param {{ x: number | null, y: number | null, width: number | null, height: number | null }} geometry - Parsed element geometry.
 * @param {string} path - Diagnostic path.
 * @param {ElementContext} context - Current element validation context.
 * @returns {void}
 */
function warnWhenElementExitsCanvas(geometry, path, context) {
  if (
    geometry.x === null ||
    geometry.y === null ||
    geometry.width === null ||
    geometry.height === null ||
    context.pageWidth === null ||
    context.pageHeight === null
  ) {
    return;
  }

  const absoluteX = context.offsetX + geometry.x;
  const absoluteY = context.offsetY + geometry.y;
  const exceedsWidth = absoluteX < 0 || absoluteX + geometry.width > context.pageWidth;
  const exceedsHeight = absoluteY < 0 || absoluteY + geometry.height > context.pageHeight;

  if (exceedsWidth || exceedsHeight) {
    addDiagnostic(context.result, 'warning', `${path}.position`, 'element lies outside metadata width and height');
  }
}

/**
 * Validate element geometry and return values useful for child traversal.
 * @param {Record<string, unknown>} element - Element object.
 * @param {string} path - Diagnostic path.
 * @param {ElementContext} context - Current element validation context.
 * @returns {{ x: number | null, y: number | null, width: number | null, height: number | null }} Parsed geometry.
 */
function validateElementGeometry(element, path, context) {
  const geometry = { x: null, y: null, width: null, height: null };

  if (isRecord(element.position) === false) {
    addDiagnostic(context.result, 'error', `${path}.position`, 'must be an object');
  } else {
    if (validateFiniteNumber(element.position.x, `${path}.position.x`, context.result)) {
      geometry.x = element.position.x;
    }

    if (validateFiniteNumber(element.position.y, `${path}.position.y`, context.result)) {
      geometry.y = element.position.y;
    }
  }

  if (isRecord(element.size) === false) {
    addDiagnostic(context.result, 'error', `${path}.size`, 'must be an object');
  } else {
    if (validateFiniteNumber(element.size.width, `${path}.size.width`, context.result, { positive: true })) {
      geometry.width = element.size.width;
    }

    if (validateFiniteNumber(element.size.height, `${path}.size.height`, context.result, { positive: true })) {
      geometry.height = element.size.height;
    }
  }

  validateFiniteNumber(element.rotation, `${path}.rotation`, context.result);
  warnWhenElementExitsCanvas(geometry, path, context);

  return geometry;
}

/**
 * Validate a button action object.
 * @param {unknown} action - Button action value.
 * @param {string} path - Diagnostic path.
 * @param {ElementContext} context - Current element validation context.
 * @returns {void}
 */
function validateButtonAction(action, path, context) {
  if (isRecord(action) === false) {
    addDiagnostic(context.result, 'error', path, 'must be an object');
    return;
  }

  if (validateStringField(action, 'method', `${path}.method`, context.result, { nonEmpty: true })) {
    const methodName = action.method;

    if (context.declaredMethods.has(methodName) === false) {
      addDiagnostic(context.result, 'warning', `${path}.method`, `method "${methodName}" was not found in execute.code`);
    }
  }

  if (action.args !== undefined && Array.isArray(action.args) === false) {
    addDiagnostic(context.result, 'error', `${path}.args`, 'must be an array when present');
  }
}

/**
 * Validate button metadata and warn when action methods are missing.
 * @param {Record<string, unknown>} metadata - Button metadata object.
 * @param {string} path - Diagnostic path.
 * @param {ElementContext} context - Current element validation context.
 * @returns {void}
 */
function validateButtonMetadata(metadata, path, context) {
  validateStringField(metadata, 'text', `${path}.text`, context.result);

  if (metadata.disabled !== undefined && typeof metadata.disabled !== 'boolean' && typeof metadata.disabled !== 'string') {
    addDiagnostic(context.result, 'error', `${path}.disabled`, 'must be a boolean or binding string when present');
  }

  if (metadata.loading !== undefined && typeof metadata.loading !== 'boolean' && typeof metadata.loading !== 'string') {
    addDiagnostic(context.result, 'error', `${path}.loading`, 'must be a boolean or binding string when present');
  }

  if (metadata.actions !== undefined && Array.isArray(metadata.actions) === false) {
    addDiagnostic(context.result, 'error', `${path}.actions`, 'must be an array when present');
    return;
  }

  if (Array.isArray(metadata.actions)) {
    metadata.actions.forEach((action, index) => validateButtonAction(action, `${path}.actions[${index}]`, context));
  }
}

/**
 * Validate element-type-specific metadata contracts.
 * @param {Record<string, unknown>} element - Element object.
 * @param {string} path - Diagnostic path.
 * @param {ElementContext} context - Current element validation context.
 * @returns {void}
 */
function validateElementMetadata(element, path, context) {
  if (isRecord(element.metadata) === false) {
    addDiagnostic(context.result, 'error', `${path}.metadata`, 'must be an object');
    return;
  }

  validateTemplateBindings(element.metadata, `${path}.metadata`, context);

  if (element.name === 'image' && typeof element.metadata.src !== 'string') {
    addDiagnostic(context.result, 'error', `${path}.metadata.src`, 'must be a string');
  }

  if (element.name === 'button') {
    validateButtonMetadata(element.metadata, `${path}.metadata`, context);
  }
}

/**
 * Validate group children and reject children on non-group elements.
 * @param {Record<string, unknown>} element - Element object.
 * @param {string} path - Diagnostic path.
 * @param {ElementContext} context - Current element validation context.
 * @param {{ x: number | null, y: number | null, width: number | null, height: number | null }} geometry - Parsed parent geometry.
 * @returns {void}
 */
function validateGroupChildren(element, path, context, geometry) {
  if (element.children === undefined) {
    return;
  }

  if (element.name !== 'group') {
    addDiagnostic(context.result, 'error', `${path}.children`, 'only group elements may contain children');
    return;
  }

  if (Array.isArray(element.children) === false) {
    addDiagnostic(context.result, 'error', `${path}.children`, 'must be an array');
    return;
  }

  const nextContext = {
    ...context,
    offsetX: context.offsetX + (geometry.x ?? 0),
    offsetY: context.offsetY + (geometry.y ?? 0),
    loopScope: createChildLoopScope(context.loopScope, element.loop)
  };

  element.children.forEach((child, index) => {
    // eslint-disable-next-line no-use-before-define -- mutual recursion with validateElement below
    validateElement(child, `${path}.children[${index}]`, nextContext);
  });
}

/**
 * Validate one Widget element and recurse into group children.
 * @param {unknown} element - Element value.
 * @param {string} path - Diagnostic path.
 * @param {ElementContext} context - Current element validation context.
 * @returns {void}
 */
function validateElement(element, path, context) {
  if (isRecord(element) === false) {
    addDiagnostic(context.result, 'error', path, 'must be an object');
    return;
  }

  if (validateStringField(element, 'id', `${path}.id`, context.result, { nonEmpty: true })) {
    if (context.elementIds.has(element.id)) {
      addDiagnostic(context.result, 'error', `${path}.id`, `duplicate element id "${element.id}"`);
    }

    context.elementIds.add(element.id);
  }

  validateStringField(element, 'name', `${path}.name`, context.result, { nonEmpty: true });

  if (typeof element.name === 'string' && SUPPORTED_ELEMENT_NAMES.has(element.name) === false) {
    addDiagnostic(context.result, 'error', `${path}.name`, `unsupported element name "${element.name}"`);
  }

  validateStringField(element, 'label', `${path}.label`, context.result);
  validateStringField(element, 'icon', `${path}.icon`, context.result);
  validateStringField(element, 'title', `${path}.title`, context.result);
  const geometry = validateElementGeometry(element, path, context);
  validateStyle(element.style, `${path}.style`, context.result);
  validateLoop(element.loop, `${path}.loop`, context.result);

  if (isRecord(element.loop) && isNonEmptyString(element.loop.source)) {
    validateBindingExpression(element.loop.source, `${path}.loop.source`, context);
  }

  validateElementMetadata(element, path, context);
  validateGroupChildren(element, path, context, geometry);
}

/**
 * Validate top-level Widget metadata and return dimensions for bounds checks.
 * @param {unknown} value - Widget metadata value.
 * @param {ValidationResult} result - Aggregated validation result.
 * @returns {{ width: number | null, height: number | null }} Parsed dimensions.
 */
function validateWidgetMetadata(value, result) {
  const dimensions = { width: null, height: null };

  if (isRecord(value) === false) {
    addDiagnostic(result, 'error', 'metadata', 'must be an object');
    return dimensions;
  }

  if (value.width !== undefined && validateFiniteNumber(value.width, 'metadata.width', result, { positive: true })) {
    dimensions.width = value.width;
  }

  if (value.height !== undefined && validateFiniteNumber(value.height, 'metadata.height', result, { positive: true })) {
    dimensions.height = value.height;
  }

  return dimensions;
}

/**
 * Validate Widget execute metadata and return static script facts.
 * @param {unknown} value - Widget execute value.
 * @param {ValidationResult} result - Aggregated validation result.
 * @returns {{ code: string, declaredMethods: Set<string> }} Execute code and detected methods.
 */
function validateExecute(value, result) {
  if (isRecord(value) === false) {
    addDiagnostic(result, 'error', 'execute', 'must be an object');
    return { code: '', declaredMethods: new Set() };
  }

  if (value.enabled !== undefined && typeof value.enabled !== 'boolean') {
    addDiagnostic(result, 'error', 'execute.enabled', 'must be a boolean when present');
  }

  if (value.description !== undefined && typeof value.description !== 'string') {
    addDiagnostic(result, 'error', 'execute.description', 'must be a string when present');
  }

  if (typeof value.code !== 'string') {
    addDiagnostic(result, 'error', 'execute.code', 'must be a string');
    return { code: '', declaredMethods: new Set() };
  }

  if (value.enabled === true && /export\s+default\s+class\s+[A-Za-z_$][\w$]*\s+extends\s+Widget\b/.test(value.code) === false) {
    addDiagnostic(result, 'warning', 'execute.code', 'enabled scripts should export a default class that extends Widget');
  }

  return { code: value.code, declaredMethods: collectDeclaredMethods(value.code) };
}

/**
 * Validate top-level Widget fields and element tree.
 * @param {Record<string, unknown>} widget - Parsed Widget JSON.
 * @param {ValidationResult} result - Aggregated validation result.
 * @returns {void}
 */
function validateWidgetData(widget, result) {
  validateStringField(widget, 'name', 'name', result);
  validateStringField(widget, 'description', 'description', result);

  if (widget.name === '') {
    addDiagnostic(result, 'warning', 'name', 'should not be empty');
  }

  if (widget.description === '') {
    addDiagnostic(result, 'warning', 'description', 'should not be empty');
  }

  validateSchemaObject(widget.inputSchema, 'inputSchema', result);
  validateSchemaObject(widget.outputSchema, 'outputSchema', result);
  validateSchemaObject(widget.dataSchema, 'dataSchema', result);
  const { declaredMethods } = validateExecute(widget.execute, result);
  const dimensions = validateWidgetMetadata(widget.metadata, result);

  if (Array.isArray(widget.elements) === false) {
    addDiagnostic(result, 'error', 'elements', 'must be an array');
    return;
  }

  const context = {
    result,
    elementIds: new Set(),
    inputFields: collectSchemaFields(widget.inputSchema),
    outputFields: collectSchemaFields(widget.outputSchema),
    dataFields: collectSchemaFields(widget.dataSchema),
    declaredMethods,
    pageWidth: dimensions.width,
    pageHeight: dimensions.height,
    offsetX: 0,
    offsetY: 0,
    loopScope: { names: new Set() }
  };

  widget.elements.forEach((element, index) => validateElement(element, `elements[${index}]`, context));
}

/**
 * Normalize package paths for cross-platform diagnostics.
 * @param {string} value - Path returned by node:path.relative.
 * @returns {string} Package path using forward slashes.
 */
function normalizePackagePath(value) {
  return value.split(sep).join('/');
}

/**
 * Convert an unknown thrown value into a compact message.
 * @param {unknown} error - Thrown value.
 * @returns {string} Error message.
 */
function formatUnknownError(error) {
  if (error instanceof Error) {
    return error.message;
  }

  return String(error);
}

/**
 * Recursively count package files and enforce resource size constraints.
 * @param {string} widgetDirectory - Widget directory to scan.
 * @param {ValidationResult} result - Aggregated validation result.
 * @returns {Promise<void>}
 */
async function scanPackageFiles(widgetDirectory, result) {
  let fileCount = 0;

  /**
   * Walk a package directory without following symbolic links.
   * @param {string} directory - Directory to walk.
   * @returns {Promise<void>}
   */
  async function visitDirectory(directory) {
    let entries = [];

    try {
      entries = await readdir(directory);
    } catch (error) {
      addDiagnostic(result, 'error', '.', `failed to read directory: ${formatUnknownError(error)}`);
      return;
    }

    const counts = await Promise.all(
      entries.map(async (entry) => {
        const entryPath = resolve(directory, entry);
        const relativePath = normalizePackagePath(relative(widgetDirectory, entryPath));
        let stats;

        try {
          stats = await lstat(entryPath);
        } catch (error) {
          addDiagnostic(result, 'error', relativePath, `failed to inspect path: ${formatUnknownError(error)}`);
          return 0;
        }

        if (stats.isSymbolicLink()) {
          addDiagnostic(result, 'error', relativePath, 'package files must not be symbolic links');
          return 0;
        }

        if (stats.isDirectory()) {
          await visitDirectory(entryPath);
          return 0;
        }

        if (stats.isFile() === false) {
          addDiagnostic(result, 'error', relativePath, 'package entries must be regular files or directories');
          return 0;
        }

        if (relativePath !== 'widget.json' && stats.size > MAX_RESOURCE_BYTES) {
          addDiagnostic(result, 'error', relativePath, `resource exceeds ${MAX_RESOURCE_BYTES} bytes`);
        }

        return 1;
      })
    );

    for (const count of counts) {
      fileCount += count;
    }
  }

  await visitDirectory(widgetDirectory);

  if (fileCount > MAX_PACKAGE_FILES) {
    addDiagnostic(result, 'error', '.', `package contains ${fileCount} files; maximum is ${MAX_PACKAGE_FILES}`);
  }
}

/**
 * Collect image element sources from an element tree.
 * @param {unknown[]} elements - Element array.
 * @returns {Array<{ path: string, src: string }>} Image source paths and values.
 */
function collectImageSources(elements) {
  const sources = [];

  /**
   * Walk nested group children.
   * @param {unknown} element - Current element value.
   * @param {string} path - Diagnostic path.
   * @returns {void}
   */
  function visit(element, path) {
    if (isRecord(element) === false) {
      return;
    }

    if (element.name === 'image' && isRecord(element.metadata) && typeof element.metadata.src === 'string') {
      sources.push({ path: `${path}.metadata.src`, src: element.metadata.src });
    }

    if (Array.isArray(element.children)) {
      element.children.forEach((child, index) => visit(child, `${path}.children[${index}]`));
    }
  }

  elements.forEach((element, index) => visit(element, `elements[${index}]`));
  return sources;
}

/**
 * Decide whether an image source is external, dynamic, or empty.
 * @param {string} src - Image source string.
 * @returns {boolean} True when local package validation should be skipped.
 */
function shouldSkipLocalResource(src) {
  return src.trim().length === 0 || LOCAL_RESOURCE_SKIP_PATTERN.test(src.trim());
}

/**
 * Validate local image resources referenced by image elements.
 * @param {Record<string, unknown>} widget - Parsed Widget JSON.
 * @param {string} widgetDirectory - Widget directory path.
 * @param {ValidationResult} result - Aggregated validation result.
 * @returns {Promise<void>}
 */
async function validateLocalResources(widget, widgetDirectory, result) {
  if (Array.isArray(widget.elements) === false) {
    return;
  }

  const imageSources = collectImageSources(widget.elements);

  await Promise.all(
    imageSources.map(async (imageSource) => {
      if (shouldSkipLocalResource(imageSource.src)) {
        return;
      }

      const normalizedSource = imageSource.src.replace(/\\/g, '/');
      const absoluteResourcePath = resolve(widgetDirectory, normalizedSource);
      const relativeResourcePath = relative(widgetDirectory, absoluteResourcePath);

      if (relativeResourcePath === '' || relativeResourcePath.startsWith(`..${sep}`) || relativeResourcePath === '..' || isAbsolute(relativeResourcePath)) {
        addDiagnostic(result, 'error', imageSource.path, 'resource path escapes the Widget directory');
        return;
      }

      try {
        const stats = await lstat(absoluteResourcePath);

        if (stats.isSymbolicLink() || stats.isFile() === false) {
          addDiagnostic(result, 'error', imageSource.path, 'local resource does not exist');
        }
      } catch {
        addDiagnostic(result, 'error', imageSource.path, 'local resource does not exist');
      }
    })
  );
}

/**
 * Validate a Widget package directory.
 * @param {string} widgetDirectory - Directory that should contain widget.json.
 * @returns {Promise<ValidationResult>} Aggregated validation result.
 */
export async function validateWidgetDirectory(widgetDirectory) {
  const result = { errors: [], warnings: [] };
  const resolvedDirectory = resolve(widgetDirectory);
  const widgetJsonPath = resolve(resolvedDirectory, 'widget.json');
  let parsedWidget;

  try {
    parsedWidget = JSON.parse(await readFile(widgetJsonPath, 'utf8'));
  } catch (error) {
    addDiagnostic(result, 'error', 'widget.json', `failed to read or parse widget.json: ${formatUnknownError(error)}`);
    return result;
  }

  if (isRecord(parsedWidget) === false) {
    addDiagnostic(result, 'error', 'widget.json', 'must contain a JSON object');
    return result;
  }

  validateWidgetData(parsedWidget, result);
  await scanPackageFiles(resolvedDirectory, result);
  await validateLocalResources(parsedWidget, resolvedDirectory, result);

  return result;
}

/**
 * Format one diagnostic for CLI output.
 * @param {Diagnostic} diagnostic - Diagnostic to format.
 * @returns {string} CLI line.
 */
function formatDiagnostic(diagnostic) {
  const label = diagnostic.severity === 'error' ? 'ERROR' : 'WARN';
  return `${label} ${diagnostic.path}: ${diagnostic.message}`;
}

/**
 * Run the command-line interface.
 * @param {string[]} argv - Process argument vector.
 * @returns {Promise<void>}
 */
async function main(argv) {
  const widgetDirectory = argv[2];

  if (typeof widgetDirectory !== 'string' || widgetDirectory.length === 0) {
    console.error('ERROR usage: node validate-widget.js <widget-directory>');
    process.exitCode = 1;
    return;
  }

  const result = await validateWidgetDirectory(widgetDirectory);

  for (const diagnostic of result.errors) {
    console.error(formatDiagnostic(diagnostic));
  }

  for (const diagnostic of result.warnings) {
    console.warn(formatDiagnostic(diagnostic));
  }

  if (result.errors.length > 0) {
    process.exitCode = 1;
    return;
  }

  console.log('Widget validation passed.');
}

/**
 * Check whether this module is being executed directly by Node.js.
 * @returns {boolean} True when the file is the CLI entrypoint.
 */
function isDirectRun() {
  return process.argv[1] !== undefined && pathToFileURL(resolve(process.argv[1])).href === import.meta.url;
}

if (isDirectRun()) {
  main(process.argv).catch((error) => {
    console.error(`ERROR unexpected failure: ${formatUnknownError(error)}`);
    process.exitCode = 1;
  });
}
