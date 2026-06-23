/**
 * @file type.ts
 * @description 定义应用路由记录与路由元信息类型。
 */

import type { RouteLocationNormalizedLoaded, RouteRecordRaw } from 'vue-router';

/**
 * 路由标签页字段解析函数。
 */
export type RouteTabFieldResolver = (route: RouteLocationNormalizedLoaded) => string | undefined;

/**
 * 路由标签页字段配置。
 */
export type RouteTabField = string | RouteTabFieldResolver;

/**
 * 路由标签页配置。
 */
export interface RouteTabMeta {
  /** 标签页唯一标识，不配置时使用当前 fullPath */
  id?: RouteTabField;
  /** KeepAlive 缓存 key，不配置时使用标签页 ID */
  cacheKey?: RouteTabField;
  /** 标签页显示标题，不配置时使用路由默认标题 */
  title?: RouteTabField;
  /** 标签页显示图标，使用 Iconify 图标名 */
  icon?: RouteTabField;
}

/**
 * 应用路由元信息。
 */
export interface AppRouteMeta {
  /** 路由默认标题 */
  title?: string;
  /** true 表示该路由不应被添加到顶部标签页中 */
  hideTab?: boolean;
  /** 标签页与 KeepAlive 缓存行为配置 */
  tab?: RouteTabMeta;
}

declare module 'vue-router' {
  /**
   * 扩展 Vue Router 元信息，允许运行时读取应用自定义 meta 字段。
   */
  interface RouteMeta {
    /** 路由默认标题 */
    title?: string;
    /** true 表示该路由不应被添加到顶部标签页中 */
    hideTab?: boolean;
    /** 标签页与 KeepAlive 缓存行为配置 */
    tab?: RouteTabMeta;
  }
}

/**
 * 应用路由记录。
 */
export interface AppRouteRecordRaw extends Omit<RouteRecordRaw, 'meta'> {
  meta?: AppRouteMeta;
}
