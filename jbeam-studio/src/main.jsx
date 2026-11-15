import React from 'react';
import ReactDOM from 'react-dom/client';
import App from './App.jsx';
import './styles/app.css';

// Suppress harmless Collada missing texture warnings (ghost 3D overlays use custom transparent shader materials)
const _origWarn = console.warn;
console.warn = (...args) => {
  if (typeof args[0] === 'string' && (
    args[0].includes('THREE.ColladaLoader: Couldn\'t find image') ||
    args[0].includes('THREE.ColladaLoader: Couldn\'t create texture') ||
    args[0].includes('THREE.ColladaLoader: Z-UP')
  )) {
    return;
  }
  _origWarn.apply(console, args);
};

// Suppress benign browser ResizeObserver notification errors (common with Monaco Editor & Canvas layout)
window.addEventListener('error', (e) => {
  if (
    typeof e?.message === 'string' &&
    (e.message.includes('ResizeObserver loop completed with undelivered notifications') ||
     e.message.includes('ResizeObserver loop limit exceeded'))
  ) {
    e.stopImmediatePropagation();
    e.preventDefault();
  }
});

ReactDOM.createRoot(document.getElementById('root')).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>
);

