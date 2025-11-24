import React from 'react';
import { createRoot } from 'react-dom/client';
import App from './App';
import ErrorBoundary from './ErrorBoundary';

const rootEl = document.getElementById('root');
if (!rootEl) {
  // Affiche un message clair dans la console si root manquant
  console.error('Element #root introuvable dans index.html');
} else {
  const root = createRoot(rootEl);
  console.log('Démarrage de l\'application...');
  root.render(
    <React.StrictMode>
      <ErrorBoundary>
        <App />
      </ErrorBoundary>
    </React.StrictMode>
  );
}
