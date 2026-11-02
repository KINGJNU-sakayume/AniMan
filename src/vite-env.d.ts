/// <reference types="vite/client" />

interface Window {
  animan?: { progress: typeof import('./lib/progress') };
}
