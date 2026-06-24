/**
 * @file vitest.config.ts
 * @description Vitest 配置，提供测试别名和 Vue 单文件组件支持。
 */
import { fileURLToPath } from 'node:url';
import vue from '@vitejs/plugin-vue';
import { defineConfig } from 'vitest/config';

export default defineConfig({
  plugins: [vue()],
  resolve: {
    alias: {
      '@@': fileURLToPath(new URL('.', import.meta.url)),
      '@': fileURLToPath(new URL('./src', import.meta.url)),
      types: fileURLToPath(new URL('./types', import.meta.url))
    }
  },
  server: {
    host: '127.0.0.1'
  },
  test: {
    environment: 'node',
    include: ['test/**/*.test.ts']
  }
});
