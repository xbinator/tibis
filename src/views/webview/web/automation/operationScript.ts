/**
 * @file operationScript.ts
 * @description WebView 自动化页面操作脚本生成器。
 */
import type { ActiveWebviewSnapshotElement } from './types';
import type { WebviewOperateInput } from '@/ai/tools/context/webview';

/**
 * 构建页面操作脚本。
 * @param input - WebView 操作输入
 * @param snapshotElements - 快照中的元素身份信息
 * @returns 可通过 `executeJavaScript` 执行的脚本
 */
export function createPageOperationScript(input: WebviewOperateInput, snapshotElements: ActiveWebviewSnapshotElement[] = []): string {
  const serializedInput = JSON.stringify(input);
  const serializedSnapshotElements = JSON.stringify(snapshotElements);
  return `
(async () => {
  const input = ${serializedInput};
  const snapshotElements = ${serializedSnapshotElements};
  const readText = (value) => String(value || '').replace(/\\s+/g, ' ').trim();
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
  const hasNonSemanticClickHint = (element) => {
    if (!readLabel(element)) return false;
    return hasDirectClickHandler(element) || hasPointerCursor(element) || hasActionDataAttribute(element) || hasClickableClass(element);
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
  const elements = collectComposedElements(document)
    .filter((element) => matchesSelector(element, actionableCandidateSelector) || hasCompactNavigationText(element) || hasCompactTopbarText(element))
    .filter((element) => element instanceof HTMLElement && isVisible(element) && !(element instanceof HTMLInputElement && element.type === 'hidden'))
    .map((element) => ({ element, actions: readActions(element) }))
    .filter((item) => item.actions.length > 0)
    .map((item) => item.element);
  const findElement = (index) => elements[index - 1] || null;
  const findExpectedElement = (index) => snapshotElements.find((item) => item && item.index === index) || null;
  const assertElementMatchesSnapshot = (element, index) => {
    const expected = findExpectedElement(index);
    if (!expected || typeof expected.fingerprint !== 'string' || !expected.fingerprint) return;
    if (readFingerprint(element) !== expected.fingerprint) throw new Error('STALE_SNAPSHOT');
  };
  const createTarget = (element, index) => element ? { index, label: readLabel(element).slice(0, 300), tagName: element.tagName } : null;
  const dispatchInputEvents = (element) => {
    element.dispatchEvent(new InputEvent('input', { bubbles: true, inputType: 'insertText', data: element.value || element.innerText || '' }));
    element.dispatchEvent(new Event('change', { bubbles: true }));
  };
  const findScrollableAncestor = (element, direction) => {
    let current = element;
    while (current && current !== document.body && current !== document.documentElement) {
      if (canScrollElementInDirection(current, direction)) return current;
      current = current.parentElement;
    }
    return null;
  };
  const readScrollPosition = (target) => {
    if (target) {
      return { x: Number(target.scrollLeft || 0), y: Number(target.scrollTop || 0) };
    }

    return {
      x: Number(window.scrollX || document.documentElement.scrollLeft || document.body.scrollLeft || 0),
      y: Number(window.scrollY || document.documentElement.scrollTop || document.body.scrollTop || 0)
    };
  };
  const scrollTarget = (target, direction, pixels) => {
    const numericPixels = Number(pixels);
    const amount = Number.isFinite(numericPixels) && numericPixels > 0 ? numericPixels : Math.round(window.innerHeight * 0.7);
    const left = direction === 'left' ? -amount : direction === 'right' ? amount : 0;
    const top = direction === 'up' ? -amount : direction === 'down' ? amount : 0;
    const before = readScrollPosition(target);
    if (target) {
      target.scrollBy({ left, top, behavior: 'auto' });
    } else {
      window.scrollBy({ left, top, behavior: 'auto' });
    }

    const after = readScrollPosition(target);
    return {
      targetType: target ? 'element' : 'window',
      before,
      after,
      changed: before.x !== after.x || before.y !== after.y
    };
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
  const resolveClickTarget = (element) => {
    if (typeof document.elementsFromPoint !== 'function') return element;

    const rect = readViewportRect(element);
    if (rect.width <= 0 || rect.height <= 0) return element;

    const x = Math.max(0, Math.min(window.innerWidth - 1, rect.x + rect.width / 2));
    const y = Math.max(0, Math.min(window.innerHeight - 1, rect.y + rect.height / 2));
    const hit = document
      .elementsFromPoint(x, y)
      .find(
        (candidate) =>
          candidate instanceof HTMLElement &&
          candidate !== document.body &&
          candidate !== document.documentElement &&
          containsComposedElement(element, candidate)
      );
    return hit instanceof HTMLElement ? hit : element;
  };
  const pressKeyMap = {
    Enter: { code: 'Enter', keyCode: 13 },
    Tab: { code: 'Tab', keyCode: 9 },
    Escape: { code: 'Escape', keyCode: 27 },
    ArrowUp: { code: 'ArrowUp', keyCode: 38 },
    ArrowDown: { code: 'ArrowDown', keyCode: 40 },
    ArrowLeft: { code: 'ArrowLeft', keyCode: 37 },
    ArrowRight: { code: 'ArrowRight', keyCode: 39 }
  };
  const isPressKey = (key) => Object.prototype.hasOwnProperty.call(pressKeyMap, key);
  const dispatchKeyboardEvent = (target, type, key) => {
    const meta = pressKeyMap[key];
    const event = new KeyboardEvent(type, {
      key,
      code: meta.code,
      keyCode: meta.keyCode,
      which: meta.keyCode,
      bubbles: true,
      cancelable: true,
      composed: true
    });
    return target.dispatchEvent(event);
  };
  const submitClosestFormForEnter = (target) => {
    if (!(target instanceof HTMLElement)) return false;
    const form = target instanceof HTMLInputElement || target instanceof HTMLTextAreaElement || target instanceof HTMLSelectElement
      ? target.form
      : target.closest('form');
    if (!(form instanceof HTMLFormElement)) return false;
    return form.dispatchEvent(new Event('submit', { bubbles: true, cancelable: true })) === false;
  };
  const pressTarget = (target, key) => {
    if (!isPressKey(key)) throw new Error('INVALID_INPUT');
    target.focus({ preventScroll: true });
    const keydownAllowed = dispatchKeyboardEvent(target, 'keydown', key);
    const shouldSendKeypress = key === 'Enter';
    const keypressAllowed = shouldSendKeypress ? dispatchKeyboardEvent(target, 'keypress', key) : true;
    const submitted = key === 'Enter' && keydownAllowed && keypressAllowed ? submitClosestFormForEnter(target) : false;
    dispatchKeyboardEvent(target, 'keyup', key);
    return { submitted };
  };
  const readWaitSeconds = (value) => {
    const seconds = Number(value);
    if (!Number.isFinite(seconds)) return 1;
    return Math.max(0, Math.min(5, seconds));
  };
  const isScrollDirection = (direction) => ['up', 'down', 'left', 'right'].includes(direction);
  const action = input.action || {};
  if (document.readyState === 'loading' && action.type !== 'wait') {
    throw new Error('PAGE_LOADING');
  }
  if (action.type === 'wait') {
    await new Promise((resolve) => window.setTimeout(resolve, readWaitSeconds(action.seconds) * 1000));
    return {
      ok: true,
      action: 'wait',
      target: null,
      message: 'waited',
      navigationStarted: document.readyState === 'loading',
      pageChanged: document.readyState === 'loading',
      shouldReadAgain: document.readyState === 'loading'
    };
  }
  if (action.type === 'scroll' && typeof action.index !== 'number') {
    if (!isScrollDirection(action.direction)) throw new Error('INVALID_INPUT');
    const scroll = scrollTarget(null, action.direction, action.pixels);
    return {
      ok: true,
      action: 'scroll',
      target: null,
      message: scroll.changed ? 'executed' : 'no scroll movement',
      scroll,
      navigationStarted: document.readyState === 'loading',
      pageChanged: scroll.changed,
      shouldReadAgain: scroll.changed
    };
  }
  const element = typeof action.index === 'number' ? findElement(action.index) : null;
  if (!element) throw new Error('ELEMENT_NOT_FOUND');
  assertElementMatchesSnapshot(element, action.index);
  if (element.hasAttribute('disabled') || element.getAttribute('aria-disabled') === 'true') throw new Error('ACTION_NOT_SUPPORTED');
  if (action.type !== 'scroll') {
    element.scrollIntoView({ block: 'center', inline: 'center' });
  }
  let scroll = null;
  if (action.type === 'click') {
    const clickTarget = resolveClickTarget(element);
    const PointerEventClass = window.PointerEvent || MouseEvent;
    clickTarget.dispatchEvent(new PointerEventClass('pointerdown', { bubbles: true }));
    clickTarget.dispatchEvent(new MouseEvent('mousedown', { bubbles: true }));
    clickTarget.focus({ preventScroll: true });
    clickTarget.dispatchEvent(new PointerEventClass('pointerup', { bubbles: true }));
    clickTarget.dispatchEvent(new MouseEvent('mouseup', { bubbles: true }));
    clickTarget.click();
  } else if (action.type === 'input') {
    if (typeof action.text !== 'string') throw new Error('INVALID_INPUT');
    if (element instanceof HTMLInputElement || element instanceof HTMLTextAreaElement) {
      const nextValue = action.clear === false ? element.value + action.text : action.text;
      const descriptor = Object.getOwnPropertyDescriptor(Object.getPrototypeOf(element), 'value');
      if (descriptor && typeof descriptor.set === 'function') {
        descriptor.set.call(element, nextValue);
      } else {
        element.value = nextValue;
      }
      dispatchInputEvents(element);
    } else if (element.isContentEditable) {
      element.textContent = action.clear === false ? String(element.textContent || '') + action.text : action.text;
      element.dispatchEvent(new InputEvent('input', { bubbles: true, inputType: 'insertText', data: action.text }));
      element.dispatchEvent(new Event('change', { bubbles: true }));
    } else {
      throw new Error('ACTION_NOT_SUPPORTED');
    }
  } else if (action.type === 'select') {
    if (typeof action.optionText !== 'string') throw new Error('INVALID_INPUT');
    if (!(element instanceof HTMLSelectElement)) throw new Error('ACTION_NOT_SUPPORTED');
    const matches = Array.from(element.options).filter(
      (option) => option.text === action.optionText || option.text.trim() === String(action.optionText || '').trim()
    );
    if (matches.length > 1) throw new Error('OPTION_AMBIGUOUS');
    if (matches.length < 1) throw new Error('ELEMENT_NOT_FOUND');
    element.value = matches[0].value;
    element.dispatchEvent(new Event('change', { bubbles: true }));
  } else if (action.type === 'press') {
    if (typeof action.key !== 'string') throw new Error('INVALID_INPUT');
    pressTarget(element, action.key);
  } else if (action.type === 'scroll') {
    if (!isScrollDirection(action.direction)) throw new Error('INVALID_INPUT');
    const target = findScrollableAncestor(element, action.direction);
    scroll = scrollTarget(target, action.direction, action.pixels);
  } else {
    throw new Error('ACTION_NOT_SUPPORTED');
  }
  return {
    ok: true,
    action: action.type,
    target: createTarget(element, action.index),
    message: scroll && !scroll.changed ? 'no scroll movement' : 'executed',
    ...(scroll ? { scroll } : {}),
    navigationStarted: document.readyState === 'loading',
    pageChanged: scroll ? scroll.changed : true,
    shouldReadAgain: scroll ? scroll.changed : true
  };
})();
`;
}
