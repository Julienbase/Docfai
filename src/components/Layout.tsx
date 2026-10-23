import React, { useState, useEffect } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import {
  Home,
  Video,
  Edit3,
  Download,
  Upload,
  Settings,
  Menu,
  X,
  Minimize2,
  Maximize2,
  Minus,
  Camera,
  HelpCircle
} from 'lucide-react';
import { useAppStore } from '../store/useAppStore';
import { cn } from '../lib/utils';
import logoImage from '../assets/logo.png';

interface LayoutProps {
  children: React.ReactNode;
}

const Layout: React.FC<LayoutProps> = ({ children }) => {
  const { t } = useTranslation('common');
  const [sidebarOpen, setSidebarOpen] = useState(true);
  const [navBlockedTarget, setNavBlockedTarget] = useState<string | null>(null);
  const navigate = useNavigate();
  const location = useLocation();
  const { isRecording, isCapturingScreenshots } = useAppStore();

  const navigation = [
    { name: t('nav.dashboard'), href: '/dashboard', icon: Home },
    { name: t('nav.import'), href: '/import', icon: Upload },
    { name: t('nav.help'), href: '/help', icon: HelpCircle },
    { name: t('nav.settings'), href: '/account', icon: Settings },
  ];

  const handleWindowControl = async (action: 'minimize' | 'maximize' | 'close') => {
    if (window.electronAPI) {
      switch (action) {
        case 'minimize':
          await window.electronAPI.minimizeWindow();
          break;
        case 'maximize':
          await window.electronAPI.maximizeWindow();
          break;
        case 'close':
          await window.electronAPI.closeWindow();
          break;
      }
    }
  };

  return (
    <div className="flex flex-col h-screen bg-slate-50 dark:bg-slate-900">
      {/* Custom title bar for Electron */}
      <div className="h-8 bg-gradient-to-r from-blue-500 to-blue-600 flex items-center justify-between px-2 drag-region">
        <span className="text-xs font-medium text-white">
          Docfai
        </span>
        <div className="flex items-center">
          <button
            onClick={() => handleWindowControl('minimize')}
            className="w-11 h-8 flex items-center justify-center hover:bg-blue-400 transition-colors"
          >
            <Minus className="w-3 h-3 text-white" />
          </button>
          <button
            onClick={() => handleWindowControl('maximize')}
            className="w-11 h-8 flex items-center justify-center hover:bg-blue-400 transition-colors"
          >
            <Maximize2 className="w-3 h-3 text-white" />
          </button>
          <button
            onClick={() => handleWindowControl('close')}
            className="w-11 h-8 flex items-center justify-center hover:bg-red-500 hover:text-white transition-colors"
          >
            <X className="w-3 h-3 text-white" />
          </button>
        </div>
      </div>
      
      {/* Main content area */}
      <div className="flex flex-1 overflow-hidden">
        {/* Sidebar */}
        <div className={cn(
          "bg-white dark:bg-gray-800 border-r border-gray-200 dark:border-gray-700 transition-all duration-300 flex flex-col self-stretch",
          sidebarOpen ? "w-64" : "w-20"
        )}>

        {/* Sidebar header */}
        <div className="p-4 pt-12 border-b border-gray-200 dark:border-gray-700">
          <div className="flex items-center justify-between">
            {sidebarOpen ? (
              <div className="flex items-center space-x-3">
                <div className="w-8 h-8 flex items-center justify-center">
                  <img 
                    src={logoImage} 
                    alt="Docfai Logo" 
                    className="w-8 h-8 object-contain"
                  />
                </div>
                <div>
                  <h1 className="text-lg font-semibold text-gray-900 dark:text-white">
                    Docfai
                  </h1>
                </div>
              </div>
            ) : (
              <div className="w-8 h-8 flex items-center justify-center mx-auto">
                <img 
                  src={logoImage} 
                  alt="Docfai Logo" 
                  className="w-6 h-6 object-contain"
                />
              </div>
            )}
            <button
              onClick={() => setSidebarOpen(!sidebarOpen)}
              className="p-1 rounded-md hover:bg-gray-100 dark:hover:bg-gray-700 transition-colors"
            >
              {sidebarOpen ? (
                <X className="w-5 h-5 text-gray-500" />
              ) : (
                <Menu className="w-5 h-5 text-gray-500" />
              )}
            </button>
          </div>
        </div>

        {/* Navigation */}
        <nav className={cn(
          "flex-1 min-h-0 space-y-2 overflow-y-auto scrollbar-thin scrollbar-thumb-gray-300 dark:scrollbar-thumb-gray-600 scrollbar-track-transparent hover:scrollbar-thumb-gray-400 dark:hover:scrollbar-thumb-gray-500",
          sidebarOpen ? "p-4" : "p-2"
        )}>
          {navigation.map((item) => {
            const isActive = location.pathname === item.href;
            return (
              <div key={item.name} className="relative">
                <button
                  onClick={() => {
                    if (isRecording || isCapturingScreenshots) {
                      setNavBlockedTarget(item.href);
                    } else {
                      navigate(item.href);
                    }
                  }}
                  className={cn(
                    "w-full flex items-center rounded-lg text-sm font-medium transition-colors relative",
                    sidebarOpen ? "px-3 py-2" : "px-2 py-3 justify-center",
                    isActive
                      ? "bg-blue-50 dark:bg-blue-900/20 text-blue-700 dark:text-blue-300"
                      : "text-gray-700 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-700"
                  )}
                  title={!sidebarOpen ? item.name : undefined}
                >
                  <item.icon className={cn(
                    "w-5 h-5",
                    sidebarOpen ? "mr-3" : ""
                  )} />
                  {sidebarOpen && (
                    <span>{item.name}</span>
                  )}
                </button>
              </div>
            );
          })}
          
        </nav>

        </div>

        {/* Main content */}
        <div className="flex-1 flex flex-col overflow-hidden">
          {/* Main content area */}
          <main className="app-page-background flex-1 overflow-auto pt-8 bg-slate-50 bg-cover bg-center bg-no-repeat dark:bg-slate-900 scrollbar-thin scrollbar-thumb-gray-300 dark:scrollbar-thumb-gray-600 scrollbar-track-transparent hover:scrollbar-thumb-gray-400 dark:hover:scrollbar-thumb-gray-500">
            {children}
          </main>
        </div>
      </div>

      {/* Navigation blocked dialog */}
      {navBlockedTarget && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50">
          <div className="bg-white dark:bg-gray-800 rounded-xl shadow-xl p-6 max-w-sm mx-4">
            <h3 className="text-lg font-semibold text-gray-900 dark:text-white mb-2">
              {isRecording ? t('navBlock.recordingTitle') : t('navBlock.captureTitle')}
            </h3>
            <p className="text-sm text-gray-600 dark:text-gray-400 mb-5">
              {isRecording ? t('navBlock.recordingBody') : t('navBlock.captureBody')}
            </p>
            <div className="flex justify-end">
              <button
                onClick={() => setNavBlockedTarget(null)}
                className="px-4 py-2 text-sm font-medium text-white bg-blue-600 hover:bg-blue-700 rounded-lg transition-colors"
              >
                {t('navBlock.goBack')}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default Layout;
