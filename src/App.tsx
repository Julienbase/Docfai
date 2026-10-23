import { useEffect, type CSSProperties, type ReactNode } from 'react';
import { HashRouter as Router, Routes, Route, Navigate } from 'react-router-dom';
import { Toaster } from 'sonner';
import { useAppStore } from './store/useAppStore';
import { createLogger } from './utils/logger';
import { flushElectronStorage } from './utils/electronStorage';
import { errorLogService } from './services/ErrorLogService';
import backgroundImage from './assets/Background.png';
import darkBackgroundImage from './assets/BackgroundDark.png';

// Pages
import Dashboard from './pages/Dashboard';
import RecordingPage from './pages/RecordingPage';
import EditingPage from './pages/EditingPage';
import ExportPage from './pages/ExportPage';
import ImportPage from './pages/ImportPage';
import VideoExportPage from './pages/VideoExportPage';
import AccountPage from './pages/AccountPage';
import InteractiveScreenshots from './pages/InteractiveScreenshots';
import HelpPage from './pages/HelpPage';

// Components
import Layout from './components/Layout';
import { UpdateNotification } from './components/UpdateNotification';

const logger = createLogger('App');

const page = (content: ReactNode) => <Layout>{content}</Layout>;

function App() {
  const { settings, initializeAuth } = useAppStore();

  useEffect(() => {
    // Apply theme to document
    document.documentElement.classList.toggle('dark', settings.theme === 'dark');
  }, [settings.theme]);

  // Initialize error log service
  useEffect(() => {
    errorLogService.init();
  }, []);

  // No accounts: set up the local user on startup
  useEffect(() => {
    initializeAuth().catch((error) => {
      logger.error('Error initializing local user:', error);
    });
  }, []); // Zustand store functions are stable

  // Add beforeunload handler to flush storage before app closes
  useEffect(() => {
    const handleBeforeUnload = async () => {
      try {
        // Flush all pending storage writes to disk
        await flushElectronStorage();
        logger.log('✅ Storage flushed before app close');
      } catch (error) {
        logger.error('❌ Failed to flush storage before close:', error);
      }
    };

    window.addEventListener('beforeunload', handleBeforeUnload);

    return () => {
      window.removeEventListener('beforeunload', handleBeforeUnload);
    };
  }, []);

  return (
    <div
      className="app-page-background min-h-screen bg-slate-50 bg-cover bg-center bg-no-repeat dark:bg-slate-900 transition-colors duration-200"
      style={{
        '--app-page-background-light': `url(${backgroundImage})`,
        '--app-page-background-dark': `url(${darkBackgroundImage})`,
      } as CSSProperties}
    >
      <Router>
        <Routes>
          <Route path="/dashboard" element={page(<Dashboard />)} />
          <Route path="/recording" element={page(<RecordingPage />)} />
          <Route path="/interactive-screenshots" element={page(<InteractiveScreenshots />)} />
          <Route path="/editing" element={page(<EditingPage />)} />
          <Route path="/export" element={page(<ExportPage />)} />
          <Route path="/import" element={page(<ImportPage />)} />
          <Route path="/video-export" element={page(<VideoExportPage />)} />
          <Route path="/account" element={page(<AccountPage />)} />
          <Route path="/help" element={page(<HelpPage />)} />

          {/* Default and catch-all redirect */}
          <Route path="*" element={<Navigate to="/dashboard" replace />} />
        </Routes>
      </Router>

      {/* Auto-update notifications */}
      <UpdateNotification />

      {/* Global toast notifications */}
      <Toaster
        position="top-right"
        theme={settings.theme}
        richColors
        closeButton
        duration={1500}
      />
    </div>
  );
}

export default App;
