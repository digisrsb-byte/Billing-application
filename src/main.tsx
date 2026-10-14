import {createRoot} from 'react-dom/client';
import App from './App.tsx';
import './index.css';
import {initKvStore} from './services/kvStore';

async function boot() {
  await initKvStore();
  createRoot(document.getElementById('root')!).render(<App />);
}

void boot();
