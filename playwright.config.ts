import { defineConfig, devices } from '@playwright/test';
import { MOCK_ANON_KEY, MOCK_SUPABASE_URL } from './e2e/support/mockSupabase';

// 테스트는 실제 Supabase 대신 e2e/support/mockSupabase.ts 의 가짜 백엔드를 쓴다.
// 로컬에 설치된 Chromium 을 쓰려면 PW_CHROMIUM_PATH 를 지정한다.
const executablePath = process.env.PW_CHROMIUM_PATH || undefined;

export default defineConfig({
  testDir: './e2e',
  fullyParallel: true,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 1 : 0,
  workers: process.env.CI ? 2 : undefined,
  reporter: process.env.CI ? [['github'], ['html', { open: 'never' }]] : 'list',
  use: {
    baseURL: 'http://localhost:5173/AniMan/',
    trace: 'on-first-retry',
    screenshot: 'only-on-failure',
    locale: 'ko-KR',
    launchOptions: { executablePath },
  },
  projects: [
    { name: 'desktop', use: { ...devices['Desktop Chrome'], viewport: { width: 1440, height: 900 }, launchOptions: { executablePath } } },
    { name: 'mobile', use: { ...devices['Pixel 5'], launchOptions: { executablePath } } },
  ],
  webServer: {
    command: 'npm run dev -- --port 5173 --strictPort',
    url: 'http://localhost:5173/AniMan/',
    reuseExistingServer: !process.env.CI,
    env: { VITE_SUPABASE_URL: MOCK_SUPABASE_URL, VITE_SUPABASE_ANON_KEY: MOCK_ANON_KEY },
  },
});
