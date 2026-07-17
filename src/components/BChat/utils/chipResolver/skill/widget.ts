/**
 * @file widget.ts
 * @description 技能引用 CodeMirror Widget 与创建函数。
 */
import { WidgetType } from '@codemirror/view';
import { projectSkillReference } from '../../skillReference';

/** 技能引用 CodeMirror Widget。 */
class SkillReferenceWidget extends WidgetType {
  /**
   * 创建技能引用 Widget。
   * @param skillName - Skill frontmatter 名称
   */
  constructor(private readonly skillName: string) {
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
    const nameElement = document.createElement('span');
    nameElement.className = 'b-skill-reference__name';
    nameElement.textContent = projectedName;

    element.append(nameElement);
    return element;
  }
}

/**
 * 创建技能引用 CodeMirror Widget。
 * @param skillName - Skill frontmatter 名称
 * @returns 技能引用 Widget
 */
export function createSkillReferenceWidget(skillName: string): WidgetType {
  return new SkillReferenceWidget(skillName);
}
