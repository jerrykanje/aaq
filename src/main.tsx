import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import App from './App.tsx';
import './index.css';
import { ErrorBoundary } from './components/ErrorBoundary';
import { LocationProvider } from './contexts/LocationContext';
import { LocationGate } from './components/LocationGate';
import { ThemeProvider } from './contexts/ThemeContext';

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <ErrorBoundary>
      <ThemeProvider>
        <LocationProvider>
          <LocationGate>
            <App />
          </LocationGate>
        </LocationProvider>
      </ThemeProvider>
    </ErrorBoundary>
  </StrictMode>
);
