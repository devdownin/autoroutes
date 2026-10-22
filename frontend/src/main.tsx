import 'maplibre-gl/dist/maplibre-gl.css';
import './styles.css';
import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { App } from './App';
import { useUiStore } from './state/uiStore';

const reducedMotionQuery = window.matchMedia('(prefers-reduced-motion: reduce)');
useUiStore.getState().setReducedMotion(reducedMotionQuery.matches);
reducedMotionQuery.addEventListener('change', (e) => { useUiStore.getState().setReducedMotion(e.matches); });

const root = document.getElementById('root');
if (root === null) {
  throw new Error('Élément #root absent');
}
createRoot(root).render(<StrictMode><App /></StrictMode>);
