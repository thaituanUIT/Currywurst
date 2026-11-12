import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { App } from './App';
import { PopupController } from './features/lookup/controller';
import { SavedWordsController } from './features/saved-words/controller';
import './styles.css';

const controller = new PopupController({ browser: chrome });
const saved = new SavedWordsController(chrome);
// Bootstrap belongs to this popup lifetime, so StrictMode effect replay cannot consume it twice.
void controller.initialize();
void saved.initialize();
createRoot(document.getElementById('root')!).render(<StrictMode><App controller={controller} saved={saved} /></StrictMode>);
window.addEventListener('pagehide', () => { controller.dispose(); saved.dispose(); }, { once: true });
