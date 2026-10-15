import {createRoot} from 'react-dom/client';
import App from './App.tsx';
import './index.css';
import {initKvStore} from './services/kvStore';
import {ErrorBoundary} from './components/ErrorBoundary';

async function boot() {
  await initKvStore();
  createRoot(document.getElementById('root')!).render(
    <ErrorBoundary>
      <App />
    </ErrorBoundary>
  );
}

void boot();
