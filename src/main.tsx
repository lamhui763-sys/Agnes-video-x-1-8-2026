import {StrictMode} from 'react';
import {createRoot} from 'react-dom/client';
import App from './App.tsx';
import './index.css';
import { setupGlobalLogger } from './lib/logger';
import { installStorageGuard } from './lib/storageGuard';

// Must run BEFORE any App localStorage writes
installStorageGuard();
setupGlobalLogger();

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>,
);
