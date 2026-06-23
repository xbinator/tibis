/**
 * @file runtime.ts
 * @description WebView 页面内 DOM 采集运行时代码生成器。
 */

/**
 * 构建注入页面的扁平 DOM 采集运行时代码。
 * @returns 页面运行时代码片段
 */
export function createRuntimeScript(): string {
  return `
const __tibisWebviewEngine = (() => {
  const TEXT_NODE = 3;
  const ELEMENT_NODE = 1;
  const HIDDEN_TAGS = new Set(['script', 'style', 'template', 'noscript']);
  const HEADING_SELECTOR = [
    ':scope > h1',
    ':scope > h2',
    ':scope > h3',
    ':scope > h4',
    ':scope > h5',
    ':scope > h6',
    '[role="heading"]'
  ].join(',');
  const INTERACTIVE_ARIA_ATTRS = [
    'aria-expanded',
    'aria-checked',
    'aria-selected',
    'aria-pressed',
    'aria-haspopup',
    'aria-controls',
    'aria-owns',
    'aria-activedescendant',
    'aria-valuenow',
    'aria-valuetext',
    'aria-valuemax',
    'aria-valuemin',
    'aria-autocomplete'
  ];
  const ACTIONABLE_SELECTOR = [
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
    '[tabindex]',
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
  const COMPACT_NAVIGATION_SELECTOR = [
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

  const readText = (value) => String(value || '').replace(/[\\uE000-\\uF8FF]/g, '').replace(/\\s+/g, ' ').trim();
  const readClassName = (element) => typeof element.className === 'string' ? element.className : '';
  const matchesSelector = (element, selector) => {
    try {
      return element.matches(selector);
    } catch {
      return false;
    }
  };
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
  const readViewportRect = (element) => {
    const rect = element.getBoundingClientRect();
    return {
      x: Math.round(rect.left),
      y: Math.round(rect.top),
      width: Math.round(rect.width),
      height: Math.round(rect.height)
    };
  };
  const isVisible = (element) => {
    if (!(element instanceof HTMLElement)) return false;
    if (element === document.body || element === document.documentElement) return true;
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
  const readDirectText = (element) =>
    Array.from(element.childNodes)
      .filter((node) => node.nodeType === TEXT_NODE)
      .map((node) => node.textContent || '')
      .join(' ');
  const readElementText = (element) => readText(element.innerText || element.textContent).slice(0, 300);
  const readValuePreview = (element) => {
    if (!(element instanceof HTMLInputElement || element instanceof HTMLTextAreaElement)) return undefined;
    if (element.type === 'password' || element.type === 'hidden') return undefined;
    return readText(element.value).slice(0, 300);
  };
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
  const canScrollElementInDirection = (element, direction) => {
    const style = window.getComputedStyle(element);
    if (direction === 'up' || direction === 'down') {
      if (!isScrollableOverflow(style.overflowY)) return false;
      const maxTop = Math.max((element.scrollHeight || 0) - (element.clientHeight || 0), 0);
      if (maxTop <= 1) return false;
      return direction === 'up' ? element.scrollTop > 1 : element.scrollTop < maxTop - 1;
    }
    if (!isScrollableOverflow(style.overflowX)) return false;
    const maxLeft = Math.max((element.scrollWidth || 0) - (element.clientWidth || 0), 0);
    if (maxLeft <= 1) return false;
    return direction === 'left' ? element.scrollLeft > 1 : element.scrollLeft < maxLeft - 1;
  };
  const canScrollElement = (element) => ['up', 'down', 'left', 'right'].some((direction) => canScrollElementInDirection(element, direction));
  const readScrollData = (element) => ({
    top: Number(element.scrollTop || 0),
    right: Math.max((element.scrollWidth || 0) - (element.clientWidth || 0) - Number(element.scrollLeft || 0), 0),
    bottom: Math.max((element.scrollHeight || 0) - (element.clientHeight || 0) - Number(element.scrollTop || 0), 0),
    left: Number(element.scrollLeft || 0)
  });
  const hasScrollableAncestor = (element) => {
    let current = element;
    while (current && current !== document.body && current !== document.documentElement) {
      if (canScrollElement(current)) return true;
      current = current.parentElement;
    }
    return false;
  };
  const findScrollableAncestor = (element, direction) => {
    let current = element;
    while (current && current !== document.body && current !== document.documentElement) {
      if (canScrollElementInDirection(current, direction)) return current;
      current = current.parentElement;
    }
    return null;
  };
  const hasDirectClickHandler = (element) => typeof element.onclick === 'function' || element.hasAttribute('onclick');
  const hasPointerCursor = (element) => window.getComputedStyle(element).cursor === 'pointer';
  const hasActionDataAttribute = (element) =>
    ['data-action', 'data-ai-action', 'data-click', 'data-command', 'data-href'].some((name) => element.hasAttribute(name));
  const hasClickableClass = (element) =>
    /(^|[-_\\s])(btn|button|click|clickable|card|item|row|cell|option|menuitem|link)([-_\\s]|$)/i.test(readClassName(element));
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
  const hasCompactNavigationText = (element) => isCompactTextElement(element) && Boolean(element.closest(COMPACT_NAVIGATION_SELECTOR));
  const hasCompactTopbarText = (element) => {
    if (!isCompactTextElement(element) || element.closest(COMPACT_NAVIGATION_SELECTOR)) return false;
    if (element.closest('main,article,section,form,table')) return false;
    return isVisibleTopbarRect(element) && hasCompactTextSiblingCluster(element);
  };
  const hasNativeClickAction = (element) => {
    const tagName = element.tagName.toLowerCase();
    if (tagName === 'a' || tagName === 'button' || tagName === 'summary') return true;
    return element instanceof HTMLInputElement && ['button', 'submit', 'reset', 'checkbox', 'radio'].includes(String(element.type || 'text').toLowerCase());
  };
  const hasInteractiveAria = (element) => INTERACTIVE_ARIA_ATTRS.some((name) => element.hasAttribute(name));
  const hasNonSemanticClickHint = (element) => {
    if (!readLabel(element)) return false;
    return (
      hasDirectClickHandler(element) ||
      hasPointerCursor(element) ||
      hasActionDataAttribute(element) ||
      hasClickableClass(element) ||
      hasInteractiveAria(element)
    );
  };
  const hasDirectScrollableLabel = (element) => canScrollElement(element) && Boolean(readExplicitElementLabel(element));
  const isActionableCandidate = (element) =>
    matchesSelector(element, ACTIONABLE_SELECTOR) || hasCompactNavigationText(element) || hasCompactTopbarText(element) || hasDirectScrollableLabel(element);
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
    if (hasDirectScrollableLabel(element) || hasScrollableAncestor(element)) actions.push('scroll');
    return Array.from(new Set(actions));
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
      const heading = current.querySelector && current.querySelector(HEADING_SELECTOR);
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
  const readContainedElementIndexes = (container, elementEntries) =>
    elementEntries
      .map((item, index) => ({ item, index: index + 1 }))
      .filter(({ item }) => containsComposedElement(container, item.element))
      .map(({ index }) => index);
  const readPrimaryActionIndex = (indexes, elementEntries) => {
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
  const readTopLayerInfo = (elementEntries) => {
    const viewportArea = Math.max(window.innerWidth * window.innerHeight, 1);
    const candidates = collectComposedElements(document)
      .filter((element) => element instanceof HTMLElement && isVisible(element) && element !== document.body && element !== document.documentElement)
      .map((element) => {
        const rect = readViewportRect(element);
        const areaRatio = (rect.width * rect.height) / viewportArea;
        const elementIndexes = readContainedElementIndexes(element, elementEntries);
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
    const primaryActionIndex = readPrimaryActionIndex(topCandidate.elementIndexes, elementEntries);
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
  const readElementLayer = (element, rect, topLayerInfo) => {
    if (!topLayerInfo) return 'page';
    if (containsComposedElement(topLayerInfo.element, element)) return 'top';
    return topLayerInfo.summary.dimmed || intersectsRect(rect, topLayerInfo.summary.rect) ? 'background' : 'page';
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
    if (hitTarget && hitTarget.insideTarget) reasons.push('hit-test-pass');
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
  const readSerializableAttribute = (element, name) => {
    if (name === 'checked' && element instanceof HTMLInputElement) return element.checked ? 'true' : '';
    if (name === 'value') return readValuePreview(element) || '';
    const value = element.getAttribute(name);
    return value === null ? '' : readText(value);
  };
  const readAttributes = (element) => {
    const attributeNames = [
      'title',
      'type',
      'checked',
      'name',
      'role',
      'value',
      'placeholder',
      'data-date-format',
      'alt',
      'aria-label',
      'aria-expanded',
      'data-state',
      'aria-checked',
      'id',
      'for',
      'target',
      'aria-haspopup',
      'aria-controls',
      'aria-owns',
      'contenteditable',
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
    ];
    return Object.fromEntries(
      attributeNames
        .map((name) => [name, readSerializableAttribute(element, name)])
        .filter((entry) => entry[1])
    );
  };
  const isTextNodeVisible = (node) => {
    const parent = node.parentElement;
    return Boolean(parent && isVisible(parent));
  };
  const isTopElement = (element) => {
    if (typeof document.elementsFromPoint !== 'function') return true;
    if (element === document.body || element === document.documentElement) return true;
    const rect = readViewportRect(element);
    if (rect.width <= 0 || rect.height <= 0) return false;
    const x = Math.max(0, Math.min(window.innerWidth - 1, rect.x + rect.width / 2));
    const y = Math.max(0, Math.min(window.innerHeight - 1, rect.y + rect.height / 2));
    return document.elementsFromPoint(x, y).some((candidate) => candidate instanceof HTMLElement && containsComposedElement(element, candidate));
  };
  const markSeen = (fingerprint) => {
    const globalKey = '__tibisWebviewSeenElementFingerprints';
    const seen = window[globalKey] instanceof Set ? window[globalKey] : new Set();
    window[globalKey] = seen;
    const isNew = !seen.has(fingerprint);
    seen.add(fingerprint);
    return isNew;
  };
  const readElementEntries = (limit) =>
    collectComposedElements(document)
      .filter((element) => isActionableCandidate(element))
      .filter((element) => element instanceof HTMLElement && isVisible(element) && !(element instanceof HTMLInputElement && element.type === 'hidden'))
      .map((element) => ({ element, actions: readActions(element) }))
      .filter((item) => item.actions.length > 0)
      .slice(0, limit);
  const readIndexedNodes = (flatTree) =>
    Object.values(flatTree.map)
      .filter((node) => node && node.type === 'ELEMENT_NODE' && typeof node.highlightIndex === 'number')
      .sort((first, second) => first.highlightIndex - second.highlightIndex);
  const collectFlatDomTree = (options = {}) => {
    const limit = Number.isFinite(Number(options.elementLimit)) ? Number(options.elementLimit) : 180;
    const map = {};
    const refs = new Map();
    let nextNodeId = 0;
    const elementEntries = readElementEntries(limit);
    const elementEntryMap = new Map(elementEntries.map((item, index) => [item.element, { ...item, index: index + 1 }]));
    const topLayerInfo = readTopLayerInfo(elementEntries);
    const createNodeId = () => String(nextNodeId++);
    const visitTextNode = (node) => {
      const text = readText(node.textContent || '');
      if (!text) return null;
      const id = createNodeId();
      map[id] = {
        type: 'TEXT_NODE',
        text,
        isVisible: isTextNodeVisible(node)
      };
      return id;
    };
    const visitElementNode = (node) => {
      const tagName = node.tagName.toLowerCase();
      if (HIDDEN_TAGS.has(tagName)) return null;
      if (node.dataset && (node.dataset.browserUseIgnore === 'true' || node.dataset.pageAgentIgnore === 'true')) return null;
      if (node.getAttribute && node.getAttribute('aria-hidden') === 'true') return null;

      const id = createNodeId();
      const entry = elementEntryMap.get(node);
      const rect = readViewportRect(node);
      const visibleRatio = readVisibleRatio(rect);
      const layer = readElementLayer(node, rect, topLayerInfo);
      const hitTarget = entry ? readHitTarget(node, rect) : undefined;
      const reasons = entry ? readClickabilityReasons(node, entry.actions, hitTarget) : [];
      const fingerprint = readFingerprint(node);
      const label = readLabel(node).slice(0, 300);
      const directText = readText(readDirectText(node)).slice(0, 300);
      const text = readElementText(node);
      const scrollable = canScrollElement(node);
      const nodeData = {
        type: 'ELEMENT_NODE',
        tagName,
        attributes: readAttributes(node),
        children: [],
        isVisible: isVisible(node),
        isTopElement: isTopElement(node),
        isInViewport: visibleRatio > 0,
        isInteractive: Boolean(entry),
        isNew: false,
        text,
        directText,
        label,
        fingerprint,
        actions: entry ? entry.actions : [],
        roleHint: entry ? readRoleHint(node, entry.actions) : undefined,
        rect,
        visibleRatio,
        covered: layer === 'background',
        layer,
        primary: Boolean(entry && topLayerInfo && topLayerInfo.summary.primaryActionIndex === entry.index),
        clickableScore: entry ? readClickableScore(entry.actions, reasons, visibleRatio, layer) : undefined,
        reasons: entry ? reasons : undefined,
        semanticPath: entry ? readSemanticPath(node) : undefined,
        hitTarget,
        href: node instanceof HTMLAnchorElement ? node.href : undefined,
        valuePreview: readValuePreview(node),
        disabled: Boolean(node.hasAttribute('disabled') || node.getAttribute('aria-disabled') === 'true'),
        checked: node instanceof HTMLInputElement && (node.type === 'checkbox' || node.type === 'radio') ? node.checked : undefined,
        selected: typeof HTMLOptionElement !== 'undefined' && node instanceof HTMLOptionElement ? node.selected : undefined,
        extra: scrollable ? { scrollable: true, scrollData: readScrollData(node) } : undefined,
        shadowRoot: Boolean(node.shadowRoot)
      };
      if (entry) {
        nodeData.highlightIndex = entry.index;
        nodeData.isNew = markSeen(fingerprint);
        refs.set(entry.index, node);
      }
      map[id] = nodeData;

      Array.from(node.childNodes || []).forEach((child) => {
        const childId = visit(child);
        if (childId) nodeData.children.push(childId);
      });
      if (node.shadowRoot) {
        Array.from(node.shadowRoot.childNodes || []).forEach((child) => {
          const childId = visit(child);
          if (childId) nodeData.children.push(childId);
        });
      }
      if (tagName === 'iframe') {
        try {
          const iframeDoc = node.contentDocument || (node.contentWindow && node.contentWindow.document);
          if (iframeDoc) {
            Array.from(iframeDoc.childNodes || []).forEach((child) => {
              const childId = visit(child);
              if (childId) nodeData.children.push(childId);
            });
          }
        } catch {
          // Cross-origin iframes are intentionally represented by the iframe element only.
        }
      }
      return id;
    };
    const visit = (node) => {
      if (!node || (node.nodeType !== ELEMENT_NODE && node.nodeType !== TEXT_NODE)) return null;
      if (node.nodeType === TEXT_NODE) return visitTextNode(node);
      if (!(node instanceof HTMLElement)) return null;
      return visitElementNode(node);
    };
    const rootId = document.body ? visit(document.body) : null;
    const flatTree = { rootId: rootId || '0', map };
    const indexedNodes = readIndexedNodes(flatTree);
    return { flatTree, refs, indexedNodes, topLayer: topLayerInfo ? topLayerInfo.summary : undefined };
  };

  return {
    canScrollElementInDirection,
    collectFlatDomTree,
    containsComposedElement,
    findScrollableAncestor,
    readActions,
    readFingerprint,
    readIndexedNodes,
    readLabel,
    readText,
    readViewportRect
  };
})();
`;
}
