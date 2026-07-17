/**
 * @file widget.ts
 * @description 技能引用 CodeMirror Widget 与创建函数。
 */
import { createApp, type App } from 'vue';
import { WidgetType } from '@codemirror/view';
import BIcon from '@/components/BIcon/index.vue';
import { projectSkillReference } from '../../skillReference';

/** 技能引用 CodeMirror Widget。 */
class SkillReferenceWidget extends WidgetType {
  /** 当前 Widget 创建过的图标 Vue 应用，随 DOM 销毁卸载。 */
  private readonly iconApps = new WeakMap<HTMLElement, App<Element>>();

  /**
   * 创建技能引用 Widget。
   * @param skillName - Skill frontmatter 名称
   * @param onOpenSkill - Skill 详情打开回调
   */
  constructor(private readonly skillName: string, private readonly onOpenSkill: (skillName: string) => void) {
    super();
  }

  /**
   * 判断两个技能引用 Widget 是否等价。
   * @param other - 另一个 Widget
   * @returns Skill 名称是否一致
   */
  eq(other: SkillReferenceWidget): boolean {
    return this.skillName === other.skillName;
  }

  /**
   * 创建技能引用 DOM。
   * @returns Widget 根节点
   */
  toDOM(): HTMLElement {
    const projectedName = projectSkillReference(this.skillName);
    const element = document.createElement('span');
    element.className = 'b-skill-reference';
    element.title = projectedName;
    element.setAttribute('role', 'button');
    element.tabIndex = 0;
    const iconHost = document.createElement('span');
    iconHost.className = 'b-skill-reference__icon';
    const iconApp = createApp(BIcon, { icon: 'lucide:hammer', size: 13 });
    const nameElement = document.createElement('span');
    nameElement.className = 'b-skill-reference__name';
    nameElement.textContent = projectedName;

    iconApp.mount(iconHost);
    element.append(iconHost, nameElement);
    this.iconApps.set(element, iconApp);

    element.addEventListener('mousedown', (event: MouseEvent): void => event.preventDefault());
    element.addEventListener('click', (event: MouseEvent): void => {
      event.preventDefault();
      event.stopPropagation();
      this.onOpenSkill(this.skillName);
    });
    element.addEventListener('keydown', (event: KeyboardEvent): void => {
      if (event.key !== 'Enter' && event.key !== ' ') return;
      event.preventDefault();
      this.onOpenSkill(this.skillName);
    });

    return element;
  }

  /**
   * 销毁技能图标 Vue 应用。
   * @param dom - Widget 根节点
   */
  destroy(dom: HTMLElement): void {
    const iconApp = this.iconApps.get(dom);
    if (!iconApp) return;
    iconApp.unmount();
    this.iconApps.delete(dom);
  }

  /**
   * 保留 Widget 内键盘与鼠标事件。
   * @returns 不忽略事件
   */
  ignoreEvent(): boolean {
    return false;
  }
}

/**
 * 创建技能引用 CodeMirror Widget。
 * @param skillName - Skill frontmatter 名称
 * @param onOpenSkill - Skill 详情打开回调
 * @returns 技能引用 Widget
 */
export function createSkillReferenceWidget(skillName: string, onOpenSkill: (skillName: string) => void): WidgetType {
  return new SkillReferenceWidget(skillName, onOpenSkill);
}
