import React from 'react';
import { createRoot } from 'react-dom/client';
import App from './App.jsx';
import { AppProvider } from './lib/store.jsx';
import './styles.css';

// Stop files dropped outside drop zones from navigating the window.
window.addEventListener('dragover', (e) => e.preventDefault());
window.addEventListener('drop', (e) => e.preventDefault());

createRoot(document.getElementById('root')).render(
  <AppProvider>
    <App />
  </AppProvider>,
);
