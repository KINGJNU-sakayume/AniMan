import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import App from './App.tsx';
import * as progress from './lib/progress';
import './index.css';

// 화면 밖에서도 진행 기록 API를 쓸 수 있도록 노출 (콘솔, 향후 Life Hub 연동 등)
window.animan = { progress };

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>
);
