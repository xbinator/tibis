/**
 * @file index.ts
 * @description 聚合应用内链接、文档、草稿与 Skill 的统一导航能力。
 */
import type { NavigateActions } from './types';
import { useDocumentNavigation } from './actions/document';
import { extractNameAndExt, useDraftNavigation } from './actions/draft';
import { useLinkNavigation } from './actions/link';
import { useFileReferenceNavigation } from './actions/reference';
import { useSkillNavigation } from './actions/skill';

export { extractNameAndExt, useDocumentNavigation, useDraftNavigation, useFileReferenceNavigation, useLinkNavigation, useSkillNavigation };
export type {
  DocumentNavigationActions,
  DraftNavigationActions,
  FileReferenceNavigationActions,
  FileRouteLocation,
  FileSelectionRange,
  LinkNavigationActions,
  NavigateActions,
  OpenFileOptions,
  SkillNavigationActions
} from './types';

/**
 * 创建统一导航门面。
 * @returns 应用内统一导航动作
 */
export function useNavigate(): NavigateActions {
  const linkActions = useLinkNavigation();
  const documentActions = useDocumentNavigation();
  const fileReferenceActions = useFileReferenceNavigation(documentActions);
  const draftActions = useDraftNavigation(documentActions);
  const skillActions = useSkillNavigation();

  return {
    ...linkActions,
    ...documentActions,
    ...fileReferenceActions,
    ...draftActions,
    ...skillActions
  };
}
