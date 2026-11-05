import React from 'react';
import { createRoot } from 'react-dom/client';
import App from './App';
import './styles.css';
import './dark.css';

createRoot(document.getElementById('root')!).render(<React.StrictMode><App /></React.StrictMode>);
if ('serviceWorker' in navigator && location.port !== '5173') navigator.serviceWorker.register('/sw.js').catch(() => {});
