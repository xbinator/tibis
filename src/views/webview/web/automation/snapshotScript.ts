/**
 * @file snapshotScript.ts
 * @description WebView 自动化页面快照采集脚本生成器。
 */
import { WEBVIEW_PAGE_ELEMENT_LIMIT } from './constants';

/**
 * 构建页面快照读取脚本。
 * @returns 可通过 `executeJavaScript` 执行的脚本
 */
export function createPageSnapshotScript(): string {
  return `
(() => {
  const readText = (value) => String(value || '').replace(/\\s+/g, ' ').trim();
  const escapeText = (value) => readText(value).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
  const escapeAttribute = (value) => escapeText(value).replace(/"/g, '&quot;');
  const interactiveSelector = [
    'button',
    'a[href]',
    'input',
    'textarea',
    'select',
    'summary',
    '[contenteditable="true"]',
    '[role="button"]',
    '[role="link"]',
    '[role="checkbox"]',
    '[role="radio"]',
    '[role="tab"]',
    '[role="menuitem"]',
    '[tabindex]'
  ].join(',');
  const clickableHintSelector = [
    '[onclick]',
    '[data-action]',
    '[data-ai-action]',
    '[data-click]',
    '[data-command]',
    '[data-href]',
    '[style*="cursor"]',
    '[class*="btn"]',
    '[class*="Btn"]',
    '[class*="button"]',
    '[class*="Button"]',
    '[class*="click"]',
    '[class*="Click"]',
    '[class*="card"]',
    '[class*="Card"]',
    '[class*="item"]',
    '[class*="Item"]',
    '[class*="row"]',
    '[class*="Row"]',
    '[class*="cell"]',
    '[class*="Cell"]',
    '[class*="option"]',
    '[class*="Option"]',
    '[class*="tab"]',
    '[class*="Tab"]',
    '[class*="link"]',
    '[class*="Link"]'
  ].join(',');
  const actionableCandidateSelector = [interactiveSelector, clickableHintSelector].join(',');
  const collectComposedElements = (root) => {
    const elements = [];
    const visit = (node) => {
      if (!node) return;
      if (node instanceof HTMLElement) {
        elements.push(node);
        if (node.shadowRoot) visit(node.shadowRoot);
      }
      Array.from(node.childNodes || []).forEach(visit);
    };
    visit(root);
    return elements;
  };
  const containsComposedElement = (container, target) => {
    if (container === target || container.contains(target)) return true;
    if (!container.shadowRoot) return false;
    return collectComposedElements(container.shadowRoot).includes(target);
  };
  const matchesSelector = (element, selector) => {
    try {
      return element.matches(selector);
    } catch {
      return false;
    }
  };
  const isVisible = (element) => {
    if (!(element instanceof HTMLElement)) return false;
    const rect = element.getBoundingClientRect();
    const style = window.getComputedStyle(element);
    return rect.width > 0 && rect.height > 0 && style.display !== 'none' && style.visibility !== 'hidden' && Number(style.opacity || '1') > 0;
  };
  const readLabel = (element) => readText(
    element.getAttribute('aria-label') ||
    element.getAttribute('title') ||
    element.getAttribute('alt') ||
    element.getAttribute('placeholder') ||
    element.innerText ||
    element.textContent ||
    element.getAttribute('value')
  );
  const readExplicitElementLabel = (element) =>
    readText(
      element.getAttribute('aria-label') ||
        element.getAttribute('title') ||
        element.getAttribute('alt') ||
        element.getAttribute('placeholder') ||
        element.getAttribute('value') ||
        ''
    );
  const readClassName = (element) => typeof element.className === 'string' ? element.className : '';
  const readFingerprint = (element) => [
    element.tagName,
    element.id || '',
    readClassName(element),
    element.getAttribute('data-testid') || '',
    element.getAttribute('data-test') || '',
    element.getAttribute('data-cy') || '',
    element.getAttribute('data-id') || '',
    element.getAttribute('data-action') || '',
    element.getAttribute('data-ai-action') || '',
    element.getAttribute('role') || '',
    element.getAttribute('type') || '',
    element.getAttribute('name') || '',
    element instanceof HTMLAnchorElement ? element.href : element.getAttribute('href') || '',
    element.getAttribute('placeholder') || '',
    readLabel(element).slice(0, 120),
    readText(element.innerText || element.textContent).slice(0, 120)
  ].join('|');
  const isScrollableOverflow = (value) => /(auto|scroll|overlay)/.test(String(value || ''));
  const canScrollElement = (element) => {
    const style = window.getComputedStyle(element);
    const maxTop = Math.max((element.scrollHeight || 0) - (element.clientHeight || 0), 0);
    const maxLeft = Math.max((element.scrollWidth || 0) - (element.clientWidth || 0), 0);
    return (isScrollableOverflow(style.overflowY) && maxTop > 1) || (isScrollableOverflow(style.overflowX) && maxLeft > 1);
  };
  const hasScrollableAncestor = (element) => {
    let current = element;
    while (current && current !== document.body && current !== document.documentElement) {
      if (canScrollElement(current)) return true;
      current = current.parentElement;
    }
    return false;
  };
  const hasDirectClickHandler = (element) => typeof element.onclick === 'function' || element.hasAttribute('onclick');
  const hasPointerCursor = (element) => window.getComputedStyle(element).cursor === 'pointer';
  const hasActionDataAttribute = (element) =>
    ['data-action', 'data-ai-action', 'data-click', 'data-command', 'data-href'].some((name) => element.hasAttribute(name));
  const hasClickableClass = (element) =>
    /(^|[-_\\s])(btn|button|click|clickable|card|item|row|cell|option|tab|menuitem|link)([-_\\s]|$)/i.test(readClassName(element));
  const compactNavigationSelector = [
    'header',
    'nav',
    '[role="navigation"]',
    '[role="toolbar"]',
    '[class*="nav"]',
    '[class*="Nav"]',
    '[class*="header"]',
    '[class*="Header"]',
    '[class*="bar"]',
    '[class*="Bar"]',
    '[class*="action"]',
    '[class*="Action"]',
    '[class*="toolbar"]',
    '[class*="Toolbar"]'
  ].join(',');
  const isCompactTextElement = (element) => {
    const tagName = element.tagName.toLowerCase();
    if (!['span', 'div', 'li', 'label', 'i', 'em', 'strong'].includes(tagName)) return false;
    const label = readLabel(element);
    return label.length >= 2 && label.length <= 12 && !/[。！？!?，,；;：:]/.test(label);
  };
  const isVisibleTopbarRect = (element) => {
    const rect = element.getBoundingClientRect();
    const maxTop = Math.min(160, window.innerHeight * 0.25);
    if (rect.width <= 0 || rect.height <= 0 || rect.top < -4 || rect.top > maxTop) return false;
    return rect.width <= Math.min(220, window.innerWidth * 0.45) && rect.height <= 80;
  };
  const hasCompactTextSiblingCluster = (element) => {
    const parent = element.parentElement;
    if (!parent) return false;

    const rect = element.getBoundingClientRect();
    const centerY = rect.top + rect.height / 2;
    return (
      Array.from(parent.children).filter((child) => {
        if (!(child instanceof HTMLElement) || !isCompactTextElement(child) || !isVisible(child)) return false;
        const childRect = child.getBoundingClientRect();
        return Math.abs(childRect.top + childRect.height / 2 - centerY) <= 24;
      }).length >= 2
    );
  };
  const hasCompactNavigationText = (element) => isCompactTextElement(element) && Boolean(element.closest(compactNavigationSelector));
  const hasCompactTopbarText = (element) => {
    if (!isCompactTextElement(element) || element.closest(compactNavigationSelector)) return false;
    if (element.closest('main,article,section,form,table')) return false;
    return isVisibleTopbarRect(element) && hasCompactTextSiblingCluster(element);
  };
  const hasNativeClickAction = (element) => {
    const tagName = element.tagName.toLowerCase();
    if (tagName === 'a' || tagName === 'button' || tagName === 'summary') return true;
    return element instanceof HTMLInputElement && ['button', 'submit', 'reset', 'checkbox', 'radio'].includes(String(element.type || 'text').toLowerCase());
  };
  const hasNonSemanticClickHint = (element) => {
    if (!readLabel(element)) return false;
    return hasDirectClickHandler(element) || hasPointerCursor(element) || hasActionDataAttribute(element) || hasClickableClass(element);
  };
  const readRoleHint = (element, actions) => {
    const tagName = element.tagName.toLowerCase();
    const role = String(element.getAttribute('role') || '').toLowerCase();
    const className = readClassName(element).toLowerCase();
    if (element instanceof HTMLInputElement || tagName === 'textarea' || element.isContentEditable) return 'text-input';
    if (tagName === 'select') return 'select';
    if (tagName === 'a' || role === 'link') return 'link';
    if (tagName === 'button' || role === 'button') return 'button';
    if (role === 'tab' || /(^|[-_\\s])tab([-_\\s]|$)/i.test(className)) return 'tab';
    if (/(service|shortcut|entry|grid)/i.test(className)) return 'service-entry';
    if (/(card|panel)/i.test(className)) return 'card';
    if (/(item|cell|row|option)/i.test(className)) return 'list-item';
    if (actions.includes('scroll') && actions.length === 1) return 'scroll-target';
    if (actions.includes('click')) return 'clickable';
    return 'control';
  };
  const readSemanticPath = (element) => {
    const label = readLabel(element);
    const labels = [];
    let current = element.parentElement;
    while (current && current !== document.body && current !== document.documentElement && labels.length < 6) {
      const tagName = current.tagName.toLowerCase();
      const heading = current.querySelector?.(':scope > h1,:scope > h2,:scope > h3,:scope > h4,:scope > h5,:scope > h6,[role="heading"]');
      const currentLabel = readText(
        current.getAttribute('aria-label') ||
          current.getAttribute('title') ||
          (heading && (heading.getAttribute('aria-label') || heading.textContent)) ||
          ''
      );
      if (currentLabel && currentLabel !== label && !labels.includes(currentLabel)) {
        labels.unshift(currentLabel.slice(0, 120));
      } else if ((tagName === 'main' || tagName === 'nav' || tagName === 'section' || tagName === 'form') && current.id && !labels.includes(current.id)) {
        labels.unshift(current.id.slice(0, 120));
      }
      current = current.parentElement;
    }
    return labels;
  };
  const readActions = (element) => {
    const tagName = element.tagName.toLowerCase();
    const role = element.getAttribute('role') || '';
    const clickableRoles = ['button', 'link', 'checkbox', 'radio', 'tab', 'menuitem'];
    const keyboardTags = ['input', 'textarea', 'select'];
    const actions = [];
    if (element instanceof HTMLInputElement) {
      const inputType = String(element.type || 'text').toLowerCase();
      if (['button', 'submit', 'reset', 'checkbox', 'radio'].includes(inputType)) {
        actions.push('click');
      } else {
        actions.push('input');
      }
    } else if (tagName === 'textarea' || element.isContentEditable) {
      actions.push('input');
    }
    if (tagName === 'select') actions.push('select');
    if (tagName === 'a' || tagName === 'button' || tagName === 'summary' || clickableRoles.includes(role)) actions.push('click');
    if (hasNonSemanticClickHint(element)) actions.push('click');
    if (hasCompactNavigationText(element) || hasCompactTopbarText(element)) actions.push('click');
    if (keyboardTags.includes(tagName) || element.isContentEditable) actions.push('press');
    if (hasScrollableAncestor(element)) actions.push('scroll');
    return Array.from(new Set(actions));
  };
  const readClickabilityReasons = (element, actions, hitTarget) => {
    const reasons = [];
    const role = element.getAttribute('role') || '';
    if (hasNativeClickAction(element)) reasons.push('native-control');
    if (['button', 'link', 'checkbox', 'radio', 'tab', 'menuitem'].includes(role)) reasons.push('aria-role');
    if (hasDirectClickHandler(element)) reasons.push('inline-handler');
    if (hasPointerCursor(element)) reasons.push('pointer-cursor');
    if (hasActionDataAttribute(element)) reasons.push('action-data');
    if (hasClickableClass(element)) reasons.push('clickable-class');
    if (hasCompactNavigationText(element)) reasons.push('compact-navigation-text');
    if (hasCompactTopbarText(element)) reasons.push('compact-topbar-text');
    if (readLabel(element)) reasons.push('visible-label');
    if (hitTarget?.insideTarget) reasons.push('hit-test-pass');
    if (actions.includes('input')) reasons.push('editable-control');
    if (actions.includes('select')) reasons.push('select-control');
    if (actions.includes('scroll')) reasons.push('scrollable-ancestor');
    return Array.from(new Set(reasons));
  };
  const readClickableScore = (actions, reasons, visibleRatio, layer) => {
    let score = actions.includes('click') ? 0.32 : actions.length > 0 ? 0.18 : 0;
    if (reasons.includes('native-control')) score += 0.28;
    if (reasons.includes('aria-role')) score += 0.22;
    if (reasons.includes('inline-handler')) score += 0.2;
    if (reasons.includes('pointer-cursor')) score += 0.18;
    if (reasons.includes('action-data')) score += 0.18;
    if (reasons.includes('clickable-class')) score += 0.14;
    if (reasons.includes('compact-navigation-text')) score += 0.12;
    if (reasons.includes('compact-topbar-text')) score += 0.1;
    if (reasons.includes('visible-label')) score += 0.08;
    if (reasons.includes('hit-test-pass')) score += 0.12;
    if (layer === 'background') score -= 0.2;
    score *= Math.max(0.2, Math.min(1, visibleRatio || 0));
    return Math.max(0, Math.min(1, Number(score.toFixed(3))));
  };
  const readValuePreview = (element) => {
    if (!(element instanceof HTMLInputElement || element instanceof HTMLTextAreaElement)) return undefined;
    if (element.type === 'password' || element.type === 'hidden') return undefined;
    return readText(element.value).slice(0, 300);
  };
  const elementEntries = collectComposedElements(document)
    .filter((element) => matchesSelector(element, actionableCandidateSelector) || hasCompactNavigationText(element) || hasCompactTopbarText(element))
    .filter((element) => element instanceof HTMLElement && isVisible(element) && !(element instanceof HTMLInputElement && element.type === 'hidden'))
    .map((element) => ({ element, actions: readActions(element) }))
    .filter((item) => item.actions.length > 0)
    .slice(0, ${WEBVIEW_PAGE_ELEMENT_LIMIT});
  const elementIndexMap = new Map(elementEntries.map((item, index) => [item.element, index + 1]));
  const readSerializableAttribute = (element, name) => {
    if (name === 'checked' && element instanceof HTMLInputElement) return element.checked ? 'true' : '';
    if (name === 'value') return readValuePreview(element) || '';
    const value = element.getAttribute(name);
    return value === null ? '' : readText(value);
  };
  const readSerializedAttributes = (element) => {
    const attributeNames = [
      'title',
      'type',
      'checked',
      'name',
      'role',
      'value',
      'placeholder',
      'aria-label',
      'aria-expanded',
      'aria-checked',
      'data-state',
      'aria-haspopup',
      'aria-controls',
      'aria-owns',
      'contenteditable',
      'id',
      'class',
      'data-testid',
      'data-test',
      'data-cy',
      'data-id',
      'data-action',
      'data-ai-action',
      'data-click',
      'data-command',
      'data-href',
      'for',
      'target',
      'alt',
      'data-date-format'
    ];
    const seenValues = new Set();
    const preserveDuplicateAttributeNames = new Set([
      'class',
      'data-testid',
      'data-test',
      'data-cy',
      'data-id',
      'data-action',
      'data-ai-action',
      'data-click',
      'data-command',
      'data-href'
    ]);
    return attributeNames
      .map((name) => {
        const value = readSerializableAttribute(element, name);
        if (!value) return '';
        const tagName = element.tagName.toLowerCase();
        if (name === 'role' && value.toLowerCase() === tagName) return '';
        const shouldDedupe = !preserveDuplicateAttributeNames.has(name);
        if (shouldDedupe && value.length > 5 && seenValues.has(value)) return '';
        if (shouldDedupe && value.length > 5) seenValues.add(value);
        return name + '="' + escapeAttribute(value).slice(0, 200) + '"';
      })
      .filter(Boolean)
      .join(' ');
  };
  const readDirectText = (element) =>
    Array.from(element.childNodes)
      .filter((node) => node.nodeType === 3)
      .map((node) => node.textContent || '')
      .join(' ');
  const semanticTags = new Set([
    'main',
    'nav',
    'menu',
    'header',
    'footer',
    'section',
    'article',
    'aside',
    'form',
    'label',
    'ul',
    'ol',
    'li',
    'table',
    'thead',
    'tbody',
    'tr',
    'td',
    'th',
    'h1',
    'h2',
    'h3',
    'h4',
    'h5',
    'h6'
  ]);
  const voidTags = new Set(['area', 'base', 'br', 'col', 'embed', 'hr', 'img', 'input', 'link', 'meta', 'param', 'source', 'track', 'wbr']);
  const isHiddenForSnapshot = (element) => {
    const tagName = element.tagName.toLowerCase();
    if (['script', 'style', 'template', 'noscript'].includes(tagName)) return true;
    const style = window.getComputedStyle(element);
    return style.display === 'none' || style.visibility === 'hidden' || Number(style.opacity || '1') <= 0;
  };
  const isOpenShadowRoot = (node) => node && node.nodeType === 11 && node.host instanceof HTMLElement;
  const createSimplifiedLine = (element) => {
    const tagName = element.tagName.toLowerCase();
    const index = elementIndexMap.get(element);
    const directText = readText(readDirectText(element));
    const label = index ? readExplicitElementLabel(element) : '';
    const text = (directText || label).slice(0, 240);
    if (!index && !text && !semanticTags.has(tagName) && !element.shadowRoot) return { line: '', hasText: false };
    const attrs = readSerializedAttributes(element);
    const openTag = '<' + tagName + (attrs ? ' ' + attrs : '') + '>';
    const prefix = index ? '[' + index + ']' : '';
    if (voidTags.has(tagName)) {
      return { line: prefix + '<' + tagName + (attrs ? ' ' + attrs : '') + ' />', hasText: false };
    }
    return { line: prefix + openTag + escapeText(text) + '</' + tagName + '>', hasText: Boolean(text) };
  };
  const simplifiedLines = [];
  const appendSimplifiedNode = (node, depth) => {
    if (simplifiedLines.length >= 260) return;
    if (node.nodeType === 3) {
      const text = escapeText(node.textContent || '');
      if (text) simplifiedLines.push('\\t'.repeat(Math.min(depth, 6)) + text.slice(0, 240));
      return;
    }
    if (isOpenShadowRoot(node)) {
      simplifiedLines.push('\\t'.repeat(Math.min(depth, 6)) + '#shadow-root');
      Array.from(node.childNodes).forEach((child) => appendSimplifiedNode(child, depth + 1));
      return;
    }
    if (!(node instanceof HTMLElement) || isHiddenForSnapshot(node)) return;
    const { line, hasText } = createSimplifiedLine(node);
    const nextDepth = line ? depth + 1 : depth;
    if (line) simplifiedLines.push('\\t'.repeat(Math.min(depth, 6)) + line);
    const childNodes = [...Array.from(node.childNodes), ...(node.shadowRoot ? [node.shadowRoot] : [])];
    childNodes.forEach((child) => {
      if (hasText && child.nodeType === 3) return;
      appendSimplifiedNode(child, nextDepth);
    });
  };
  if (document.body) appendSimplifiedNode(document.body, 0);
  const content = simplifiedLines.length ? simplifiedLines.join('\\n') : '<EMPTY>';
  const readViewportRect = (element) => {
    const rect = element.getBoundingClientRect();
    return {
      x: Math.round(rect.left),
      y: Math.round(rect.top),
      width: Math.round(rect.width),
      height: Math.round(rect.height)
    };
  };
  const readHitTarget = (element, rect) => {
    if (typeof document.elementsFromPoint !== 'function' || rect.width <= 0 || rect.height <= 0) return undefined;

    const x = Math.max(0, Math.min(window.innerWidth - 1, rect.x + rect.width / 2));
    const y = Math.max(0, Math.min(window.innerHeight - 1, rect.y + rect.height / 2));
    const hit = document
      .elementsFromPoint(x, y)
      .find((candidate) => candidate instanceof HTMLElement && candidate !== document.body && candidate !== document.documentElement);
    if (!(hit instanceof HTMLElement)) return undefined;

    return {
      tagName: hit.tagName,
      label: readLabel(hit).slice(0, 300),
      insideTarget: containsComposedElement(element, hit)
    };
  };
  const readVisibleRatio = (rect) => {
    const visibleLeft = Math.max(rect.x, 0);
    const visibleTop = Math.max(rect.y, 0);
    const visibleRight = Math.min(rect.x + rect.width, window.innerWidth);
    const visibleBottom = Math.min(rect.y + rect.height, window.innerHeight);
    const visibleArea = Math.max(visibleRight - visibleLeft, 0) * Math.max(visibleBottom - visibleTop, 0);
    const area = Math.max(rect.width * rect.height, 1);
    return Math.max(0, Math.min(1, visibleArea / area));
  };
  const intersectsRect = (first, second) =>
    first.x < second.x + second.width &&
    first.x + first.width > second.x &&
    first.y < second.y + second.height &&
    first.y + first.height > second.y;
  const readCssAlpha = (color) => {
    const value = String(color || '').trim();
    if (!value || value === 'transparent') return 0;
    const match = value.match(/rgba?\\(([^)]+)\\)/i);
    if (!match) return 1;
    const parts = match[1].split(',').map((part) => part.trim());
    if (parts.length < 4) return 1;
    const alpha = Number(parts[3]);
    return Number.isFinite(alpha) ? alpha : 1;
  };
  const hasVisibleBackground = (style) => readCssAlpha(style.backgroundColor) > 0.02;
  const readNumericZIndex = (style) => {
    const value = Number(style.zIndex);
    return Number.isFinite(value) ? value : 0;
  };
  const readContainedElementIndexes = (container) =>
    elementEntries
      .map((item, index) => ({ item, index: index + 1 }))
      .filter(({ item }) => containsComposedElement(container, item.element))
      .map(({ index }) => index);
  const readLayerLabel = (element) => {
    const heading = collectComposedElements(element).find(
      (candidate) => candidate !== element && matchesSelector(candidate, 'h1,h2,h3,h4,h5,h6,[role="heading"]')
    );
    return readText(
      (heading && (heading.getAttribute('aria-label') || heading.textContent)) ||
        element.getAttribute('aria-label') ||
        element.getAttribute('title') ||
        element.textContent
    ).slice(0, 160);
  };
  const isDialogLikeElement = (element) => {
    const role = String(element.getAttribute('role') || '').toLowerCase();
    const isNativeDialog = typeof HTMLDialogElement !== 'undefined' && element instanceof HTMLDialogElement && element.open;
    return role === 'dialog' || role === 'alertdialog' || element.getAttribute('aria-modal') === 'true' || isNativeDialog;
  };
  const readPrimaryActionIndex = (indexes) => {
    const clickableIndexes = indexes.filter((index) => {
      const entry = elementEntries[index - 1];
      return entry && entry.actions.includes('click');
    });
    return clickableIndexes[clickableIndexes.length - 1];
  };
  const isDimmedBackdrop = (element, excludedElement) => {
    if (element === excludedElement || containsComposedElement(excludedElement, element)) return false;
    const rect = readViewportRect(element);
    const viewportArea = Math.max(window.innerWidth * window.innerHeight, 1);
    const rectArea = rect.width * rect.height;
    if (rectArea / viewportArea < 0.55) return false;
    const style = window.getComputedStyle(element);
    return hasVisibleBackground(style) && (readCssAlpha(style.backgroundColor) < 0.95 || Number(style.opacity || '1') < 0.95);
  };
  const readTopLayerInfo = () => {
    const viewportArea = Math.max(window.innerWidth * window.innerHeight, 1);
    const candidates = collectComposedElements(document)
      .filter((element) => element instanceof HTMLElement && isVisible(element) && element !== document.body && element !== document.documentElement)
      .map((element) => {
        const rect = readViewportRect(element);
        const areaRatio = (rect.width * rect.height) / viewportArea;
        const elementIndexes = readContainedElementIndexes(element);
        if (!elementIndexes.length || readVisibleRatio(rect) <= 0 || areaRatio > 0.96) return null;
        const style = window.getComputedStyle(element);
        const isDialog = isDialogLikeElement(element);
        if (!isDialog && areaRatio < 0.18) return null;
        const isLayerPosition = ['fixed', 'absolute', 'sticky'].includes(style.position);
        const hasBackground = hasVisibleBackground(style);
        if (!isDialog && !isLayerPosition && readNumericZIndex(style) <= 0) return null;
        if (!isDialog && !hasBackground && areaRatio < 0.12) return null;
        const score =
          (isDialog ? 1000 : 0) +
          (isLayerPosition ? 200 : 0) +
          (hasBackground ? 120 : 0) +
          Math.min(readNumericZIndex(style), 1000) +
          elementIndexes.length * 20 +
          Math.round(areaRatio * 100);
        return { element, rect, elementIndexes, score, kind: isDialog ? 'dialog' : 'panel' };
      })
      .filter(Boolean)
      .sort((first, second) => second.score - first.score);
    const topCandidate = candidates[0];
    if (!topCandidate) return null;
    const text = readText(topCandidate.element.textContent).slice(0, 1000);
    const label = readLayerLabel(topCandidate.element) || text.slice(0, 80) || '当前浮层';
    const dimmed = collectComposedElements(document).some(
      (element) => element instanceof HTMLElement && isVisible(element) && isDimmedBackdrop(element, topCandidate.element)
    );
    const primaryActionIndex = readPrimaryActionIndex(topCandidate.elementIndexes);
    return {
      element: topCandidate.element,
      summary: {
        kind: topCandidate.kind,
        label,
        text,
        rect: topCandidate.rect,
        elementIndexes: topCandidate.elementIndexes,
        ...(typeof primaryActionIndex === 'number' ? { primaryActionIndex } : {}),
        dimmed
      }
    };
  };
  const topLayerInfo = readTopLayerInfo();
  const readElementLayer = (element, rect) => {
    if (!topLayerInfo) return 'page';
    if (topLayerInfo.element.contains(element)) return 'top';
    return topLayerInfo.summary.dimmed || intersectsRect(rect, topLayerInfo.summary.rect) ? 'background' : 'page';
  };
  const elements = elementEntries
    .map(({ element, actions }, index) => {
      const input = element instanceof HTMLInputElement ? element : null;
      const option = element instanceof HTMLOptionElement ? element : null;
      const rect = readViewportRect(element);
      const visibleRatio = readVisibleRatio(rect);
      const layer = readElementLayer(element, rect);
      const primary = topLayerInfo?.summary.primaryActionIndex === index + 1;
      const hitTarget = readHitTarget(element, rect);
      const reasons = readClickabilityReasons(element, actions, hitTarget);
      return {
        index: index + 1,
        tagName: element.tagName,
        role: element.getAttribute('role') || undefined,
        text: readText(element.innerText || element.textContent).slice(0, 300),
        label: readLabel(element).slice(0, 300),
        roleHint: readRoleHint(element, actions),
        fingerprint: readFingerprint(element),
        placeholder: element.getAttribute('placeholder') || undefined,
        href: element instanceof HTMLAnchorElement ? element.href : undefined,
        valuePreview: readValuePreview(element),
        disabled: Boolean(element.hasAttribute('disabled') || element.getAttribute('aria-disabled') === 'true'),
        checked: input && (input.type === 'checkbox' || input.type === 'radio') ? input.checked : undefined,
        selected: option ? option.selected : undefined,
        isNew: false,
        rect,
        visibleRatio,
        covered: layer === 'background',
        layer,
        primary,
        clickableScore: readClickableScore(actions, reasons, visibleRatio, layer),
        reasons,
        semanticPath: readSemanticPath(element),
        ...(hitTarget ? { hitTarget } : {}),
        actions
      };
    });
  const scrollX = window.scrollX || document.documentElement.scrollLeft || document.body.scrollLeft || 0;
  const scrollY = window.scrollY || document.documentElement.scrollTop || document.body.scrollTop || 0;
  const scrollWidth = Math.max(document.documentElement.scrollWidth, document.body ? document.body.scrollWidth : 0, window.innerWidth);
  const scrollHeight = Math.max(document.documentElement.scrollHeight, document.body ? document.body.scrollHeight : 0, window.innerHeight);
  const remainingBottom = Math.max(scrollHeight - (scrollY + window.innerHeight), 0);
  const header = [
    'Page info: ',
    window.innerWidth,
    'x',
    window.innerHeight,
    'px, scroll ',
    Math.round(scrollX),
    ',',
    Math.round(scrollY),
    ' of ',
    Math.round(scrollWidth),
    'x',
    Math.round(scrollHeight),
    scrollY <= 0 ? ' [Start of page]' : ''
  ].join('');
  const footer = remainingBottom <= 2 ? '[End of page]' : '... ' + Math.round(remainingBottom) + ' pixels below ...';
  const headings = Array.from(document.querySelectorAll('h1,h2,h3,h4,h5,h6')).map((element) => ({
    level: Number(element.tagName.slice(1)),
    text: readText(element.innerText || element.textContent)
  })).filter((item) => item.text);
  const links = Array.from(document.querySelectorAll('a[href]')).map((element) => ({
    text: readText(element.innerText || element.textContent || element.getAttribute('aria-label')),
    href: element.href
  })).filter((item) => item.href);
  const viewport = {
    width: window.innerWidth,
    height: window.innerHeight,
    scrollX,
    scrollY,
    ...(topLayerInfo ? { topLayer: topLayerInfo.summary } : {}),
    elements: elements
      .filter((element) => typeof element.visibleRatio === 'number' && element.visibleRatio > 0)
      .map((element) => ({
        index: element.index,
        tagName: element.tagName,
        label: element.label,
        roleHint: element.roleHint,
        actions: element.actions,
        rect: element.rect,
        visibleRatio: element.visibleRatio,
        covered: element.covered,
        layer: element.layer,
        primary: element.primary,
        clickableScore: element.clickableScore,
        reasons: element.reasons,
        semanticPath: element.semanticPath,
        hitTarget: element.hitTarget
      }))
  };

  return {
    url: location.href,
    title: document.title || '',
    header,
    content,
    footer,
    text: readText(document.body ? document.body.innerText : ''),
    selectedText: readText(window.getSelection ? window.getSelection().toString() : ''),
    headings,
    links,
    loading: document.readyState === 'loading',
    scroll: {
      x: scrollX,
      y: scrollY,
      viewportWidth: window.innerWidth,
      viewportHeight: window.innerHeight,
      scrollWidth,
      scrollHeight,
      atTop: scrollY <= 0,
      atBottom: scrollY + window.innerHeight >= scrollHeight - 2
    },
    viewport,
    elements
  };
})();
`;
}
