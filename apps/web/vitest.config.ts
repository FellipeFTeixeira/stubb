import { defineConfig, mergeConfig } from 'vitest/config';
import viteConfig from './vite.config.js';

export default mergeConfig(
  viteConfig,
  defineConfig({
    test: {
      environment: 'jsdom',
      setupFiles: ['src/test/setup.ts'],
      include: ['src/**/*.test.{ts,tsx}'],
      passWithNoTests: true,
      // Com os pacotes rodando em paralelo (e a stack no ar) os testes de formulário passam de 5 s.
      testTimeout: 15_000,
    },
  }),
);
