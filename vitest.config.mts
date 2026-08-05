import { defineConfig, mergeConfig } from 'vitest/config';
import viteConfig from './vite.config';

export default mergeConfig(
  viteConfig,
  defineConfig({
    test: {
      environment: 'jsdom',
      environmentOptions: {
        jsdom: {
          url: 'http://localhost:5173/',
        },
      },
      setupFiles: ['./vitest.setup.ts'],
    },
  }),
);
