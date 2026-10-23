import { useState, useEffect, useRef, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import {
  Download,
  Video,
  Settings,
  Check,
  X,
  Loader2,
  Play,
  Pause,
  Volume2,
  VolumeX,
  Monitor,
  Smartphone,
  Tablet,
  Film,
  Globe,
  FileVideo,
  ArrowLeft,
  ChevronDown,
  ChevronUp,
  HelpCircle
} from 'lucide-react';
import { toast } from 'sonner';
import { useAppStore } from '../store/useAppStore';
import { cn } from '../lib/utils';
import VideoEditor from '../components/VideoEditor';
import type { VideoExportData } from '../types/electron';
import { createLogger } from '../utils/logger';
import CoachMark from '../components/CoachMark';
import { useOnboardingHint, toggleAllOnboardingHints, useHintsSuppressed } from '../hooks/useOnboardingHint';

const logger = createLogger("VideoExportPage");

interface VideoExportFormat {
  id: string;
  name: string;
  description: string;
  icon: React.ReactNode;
  extension: string;
  features: string[];
  premium?: boolean;
}

interface VideoExportOptions {
  format: 'mp4' | 'webm' | 'avi' | 'mov';
  quality: '720p' | '1080p' | '2k';
  compression: 'low' | 'medium' | 'high';
  includeAudio: boolean;
  trimStart: number;
  trimEnd: number;
  addWatermark: boolean;
  frameRate: 30 | 60;
}

const VideoExportPage: React.FC = () => {
  const { t } = useTranslation('videoExportPage');
  const navigate = useNavigate();
  const {
    currentProject,
    currentRecording,
    settings,
    user
  } = useAppStore();

  const [selectedFormat, setSelectedFormat] = useState<string>('mp4');
  const [exportOptions, setExportOptions] = useState<VideoExportOptions>({
    format: 'mp4',
    includeAudio: true,
    trimStart: 0,
    trimEnd: 0,
    addWatermark: false,
    quality: '1080p',
    compression: 'medium',
    frameRate: 30
  });
  const [isExporting, setIsExporting] = useState(false);
  const [exportProgress, setExportProgress] = useState(0);
  const [exportedFiles, setExportedFiles] = useState<string[]>([]);
  const [previewMode, setPreviewMode] = useState(false);
  const [currentTime, setCurrentTime] = useState(0);
  const [duration, setDuration] = useState(0);
  const [isPlaying, setIsPlaying] = useState(false);
  const [volume, setVolume] = useState(1);
  const [isMuted, setIsMuted] = useState(false);
  
  // Collapsible section states
  const [isFormatExpanded, setIsFormatExpanded] = useState(true);
  const [isQualityExpanded, setIsQualityExpanded] = useState(true);

  const videoExportFormats: VideoExportFormat[] = [
    {
      id: 'mp4',
      name: 'MP4 Video',
      description: 'Universal format compatible with all devices and platforms',
      icon: <Video className="w-6 h-6" />,
      extension: '.mp4',
      features: ['Universal compatibility', 'Small file size', 'High quality', 'Streaming ready']
    },
    {
      id: 'webm',
      name: 'WebM Video',
      description: 'Web-optimized format with excellent compression',
      icon: <FileVideo className="w-6 h-6" />,
      extension: '.webm',
      features: ['Web optimized', 'Excellent compression', 'Open source', 'HTML5 ready']
    },
    {
      id: 'avi',
      name: 'AVI Video',
      description: 'High-quality format for professional editing',
      icon: <Film className="w-6 h-6" />,
      extension: '.avi',
      features: ['High quality', 'Professional editing', 'Lossless compression', 'Wide support'],
      premium: true
    },
    {
      id: 'mov',
      name: 'QuickTime MOV',
      description: 'Apple\'s format optimized for Mac and iOS devices',
      icon: <Monitor className="w-6 h-6" />,
      extension: '.mov',
      features: ['Apple optimized', 'High quality', 'Professional grade', 'Final Cut Pro ready'],
      premium: true
    }
  ];

  useEffect(() => {
    if (currentRecording) {
      setDuration(currentRecording.duration || 0);

      // Auto-detect quality from recording resolution
      let detectedQuality: '720p' | '1080p' | '2k' = '1080p';
      const resolution = currentRecording.resolution;

      if (resolution) {
        if (resolution.includes('2560') || resolution.includes('1440') || resolution.includes('2k')) {
          detectedQuality = '2k';
        } else if (resolution.includes('1920') || resolution.includes('1080')) {
          detectedQuality = '1080p';
        } else if (resolution.includes('1280') || resolution.includes('720')) {
          detectedQuality = '720p';
        }
      }

      // Auto-detect frame rate
      const fps = currentRecording.fps || 30;
      const detectedFps: 30 | 60 = fps >= 60 ? 60 : 30;

      setExportOptions(prev => ({
        ...prev,
        trimEnd: currentRecording.duration || 0,
        quality: detectedQuality,
        frameRate: detectedFps
      }));
    }
  }, [currentRecording]);

  const handleExport = async () => {
    if (!currentRecording) {
      toast.error(t('toast.noRecording'));
      return;
    }

    setIsExporting(true);
    setExportProgress(0);

    try {
      const fileName = `${currentProject?.name || 'video'}.${exportOptions.format}`;

      // First, export the video file locally to get the content
      if (window.electronAPI?.exportVideo) {
        // Simulate export progress
        const steps = [
          'Preparing video file...',
          'Processing video format...',
          'Applying quality settings...',
          'Compressing video...',
          'Finalizing export...'
        ];

        for (let i = 0; i < steps.length - 1; i++) {
          await new Promise(resolve => setTimeout(resolve, 1000));
          setExportProgress((i + 1) * 20);
          toast.info(steps[i]);
        }

        // Prepare export data - construct absolute path to the video file
        let absoluteFilePath: string;
        
        try {
          // Get the base projects directory from Electron
          const projectsDir = await window.electronAPI.getProjectsDirectory();
          
          // Construct the full absolute path
          // currentRecording.filePath is relative like "recordings/dasss_1755439165757.webm"
          // We need to combine it with the project directory
          const projectName = currentProject?.name || 'default';
          absoluteFilePath = `${projectsDir}\\${projectName}\\${currentRecording.filePath}`;
          
          logger.log('Constructed absolute file path:', absoluteFilePath);
        } catch (error) {
          logger.error('Error constructing file path:', error);
          throw new Error(`Failed to locate video file. Original path: ${currentRecording.filePath}`);
        }
        
        const exportData = {
          filePath: absoluteFilePath,
          format: selectedFormat as 'mp4' | 'webm' | 'avi' | 'mov',
          options: exportOptions,
          outputPath: fileName,
          projectName: currentProject?.name || 'video'
        };

        const result = await window.electronAPI.exportVideo(exportData);
        
        if (result.canceled) {
          toast.info(t('toast.exportCanceled'));
          return;
        }
        
        if (!result.success) {
          throw new Error(`Export failed using file path: ${absoluteFilePath}. Error: ${result.error || 'Unknown error'}`);
        }

        toast.success(t('toast.exportSuccess', { path: result.outputPath }));
        setExportedFiles(prev => [...prev, result.outputPath]);
        setExportProgress(100);
      } else {
        // Fallback for web environment
        toast.success(t('toast.exportDemo'));
        setExportedFiles(prev => [...prev, fileName]);
        setExportProgress(100);
        return;
      }

    } catch (error) {
      logger.error('Export error:', error);
      toast.error(t('toast.exportFailed', { error: error instanceof Error ? error.message : 'Unknown error' }));
    } finally {
      setIsExporting(false);
      setExportProgress(0);
    }
  };

  const toggleOption = (key: keyof VideoExportOptions) => {
    setExportOptions(prev => ({
      ...prev,
      [key]: !prev[key]
    }));
  };

  const updateOption = (key: keyof VideoExportOptions, value: any) => {
    setExportOptions(prev => ({
      ...prev,
      [key]: value
    }));
  };

  const formatTime = (seconds: number): string => {
    const mins = Math.floor(seconds / 60);
    const secs = Math.floor(seconds % 60);
    return `${mins.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`;
  };



  // Onboarding hints — declared before any early return to satisfy rules of hooks
  const hintsSuppressed = useHintsSuppressed();
  const trimRef = useRef<HTMLDivElement | null>(null);
  const formatSectionRef = useRef<HTMLDivElement | null>(null);
  const exportBtnRef = useRef<HTMLButtonElement | null>(null);
  const [trimReady, setTrimReady] = useState(false);
  const [formatReady, setFormatReady] = useState(false);
  const [exportBtnReady, setExportBtnReady] = useState(false);

  const assignTrimRef = useCallback((node: HTMLDivElement | null) => {
    trimRef.current = node;
    setTrimReady(!!node);
  }, []);
  const assignFormatRef = useCallback((node: HTMLDivElement | null) => {
    formatSectionRef.current = node;
    setFormatReady(!!node);
  }, []);
  const assignExportBtnRef = useCallback((node: HTMLButtonElement | null) => {
    exportBtnRef.current = node;
    setExportBtnReady(!!node);
  }, []);

  const trimHint = useOnboardingHint('videoExport.trim', { priority: 100, when: !!currentRecording });
  const formatHint = useOnboardingHint('videoExport.format', { priority: 90, when: !!currentRecording });
  const exportHint = useOnboardingHint('videoExport.run', { priority: 80, when: !!currentRecording && !isExporting });

  if (!currentRecording) {
    return (
      <div className="p-6 max-w-7xl mx-auto">
        <div className="text-center py-12">
          <Video className="w-16 h-16 text-gray-400 mx-auto mb-4" />
          <h2 className="text-xl font-semibold text-gray-900 dark:text-white mb-2">
            {t('noRecording.title')}
          </h2>
          <p className="text-gray-600 dark:text-gray-400 mb-6">
            {t('noRecording.description')}
          </p>
          <button
            onClick={() => navigate('/dashboard')}
            className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors"
          >
            {t('noRecording.button')}
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-full">
      <div className="p-6 max-w-7xl mx-auto">
      {/* Header */}
      <div className="flex items-center justify-between mb-6">
        <div className="flex items-center space-x-4">
          <button
            onClick={() => navigate('/editing')}
            className="p-2 hover:bg-gray-100 dark:hover:bg-gray-700 rounded-lg transition-colors"
          >
            <ArrowLeft className="w-5 h-5 text-gray-600 dark:text-gray-400" />
          </button>
          <div>
            <h1 className="text-2xl font-bold text-gray-900 dark:text-white">
              {t('header.title')}
            </h1>
            <p className="text-gray-600 dark:text-gray-400">
              {currentRecording.name} • {formatTime(duration)}
            </p>
          </div>
        </div>

        <button
          onClick={toggleAllOnboardingHints}
          className={cn(
            "p-1.5 rounded-md transition-colors",
            hintsSuppressed
              ? "text-gray-400 hover:text-gray-600 dark:text-gray-500 dark:hover:text-gray-300"
              : "bg-blue-600 text-white hover:bg-blue-700"
          )}
          title={hintsSuppressed ? t('hints.show') : t('hints.hide')}
          aria-pressed={!hintsSuppressed}
        >
          <HelpCircle className="w-4 h-4" />
        </button>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-5 gap-6">
        {/* Left Column - Video Preview and Trim Controls */}
        <div className="lg:col-span-3 space-y-6">
          {/* Video Player */}
          <div className="bg-black rounded-lg overflow-hidden aspect-video">
            <VideoEditor
              filePath={currentRecording.filePath}
              projectName={currentRecording.metadata?.projectTitle || currentProject?.name}
              duration={duration}
              currentTime={currentTime}
              isPlaying={isPlaying}
              volume={volume}
              isMuted={isMuted}
              playbackSpeed={1}
              onTimeUpdate={setCurrentTime}
              onDurationChange={setDuration}
              onPlayStateChange={setIsPlaying}
              onVolumeChange={setVolume}
              onMuteToggle={() => setIsMuted(!isMuted)}
              onSpeedChange={() => {}}
              onSeek={setCurrentTime}
            />
          </div>

          {/* Trim Controls */}
          <div ref={assignTrimRef} className="bg-white dark:bg-gray-800 rounded-lg border border-gray-200 dark:border-gray-700 p-6">
            <h3 className="text-lg font-semibold text-gray-900 dark:text-white mb-4">
              {t('trim.heading')}
            </h3>
            
            <div className="space-y-4">
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                    {t('trim.startTime')}
                  </label>
                  <input
                    type="number"
                    min="0"
                    max={duration}
                    step="0.1"
                    value={exportOptions.trimStart}
                    onChange={(e) => updateOption('trimStart', parseFloat(e.target.value))}
                    className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 dark:bg-gray-700 dark:text-white"
                  />
                  <p className="text-xs text-gray-500 mt-1">{formatTime(exportOptions.trimStart)}</p>
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                    {t('trim.endTime')}
                  </label>
                  <input
                    type="number"
                    min={exportOptions.trimStart}
                    max={duration}
                    step="0.1"
                    value={exportOptions.trimEnd}
                    onChange={(e) => updateOption('trimEnd', parseFloat(e.target.value))}
                    className="w-full px-2 py-1.5 text-sm border border-gray-300 dark:border-gray-600 rounded focus:outline-none focus:ring-1 focus:ring-blue-500 dark:bg-gray-700 dark:text-white"
                  />
                  <p className="text-xs text-gray-500 mt-0.5">{formatTime(exportOptions.trimEnd)}</p>
                </div>
              </div>
              
              <div className="flex items-center justify-between pt-2 border-t border-gray-200 dark:border-gray-600">
                <span className="text-xs text-gray-600 dark:text-gray-400">
                  {t('trim.duration')} {formatTime(exportOptions.trimEnd - exportOptions.trimStart)}
                </span>
                <button
                  onClick={() => {
                    updateOption('trimStart', 0);
                    updateOption('trimEnd', duration);
                  }}
                  className="text-xs text-blue-600 dark:text-blue-400 hover:underline"
                >
                  {t('trim.reset')}
                </button>
              </div>
            </div>
          </div>

          {/* Export Button */}
          <button
            ref={assignExportBtnRef}
            onClick={handleExport}
            disabled={isExporting}
            className={cn(
              "w-full py-3 px-4 rounded-lg font-semibold text-base transition-colors shadow-lg",
              isExporting
                ? "bg-gray-400 cursor-not-allowed"
                : "bg-green-600 hover:bg-green-700 text-white hover:shadow-xl"
            )}
          >
            {isExporting ? (
              <div className="flex items-center justify-center">
                <Loader2 className="w-5 h-5 mr-2 animate-spin" />
                {t('export.exporting', { progress: Math.round(exportProgress) })}
              </div>
            ) : (
              <div className="flex items-center justify-center">
                <Download className="w-5 h-5 mr-2" />
                {t('export.button')}
              </div>
            )}
          </button>

          {/* Recent Exports - Moved here for better UX */}
          {exportedFiles.length > 0 && (
            <div className="bg-white dark:bg-gray-800 rounded-lg border border-gray-200 dark:border-gray-700 p-4">
              <h3 className="text-sm font-semibold text-gray-900 dark:text-white mb-3">
                {t('recentExports.heading')}
              </h3>
              <div className="space-y-2">
                {exportedFiles.slice(-3).map((file, index) => (
                  <div key={index} className="flex items-center text-sm text-gray-600 dark:text-gray-400">
                    <Check className="w-4 h-4 text-green-500 mr-2 flex-shrink-0" />
                    <span className="truncate">{file}</span>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>

        {/* Right Column - Export Settings */}
        <div className="lg:col-span-2 space-y-6">
            {/* Export Format - Collapsible */}
            <div ref={assignFormatRef} className="bg-white dark:bg-gray-800 rounded-lg border border-gray-200 dark:border-gray-700 p-4">
              <button
                onClick={() => setIsFormatExpanded(!isFormatExpanded)}
                className="w-full flex items-center justify-between text-left mb-3"
              >
                <h3 className="text-base font-semibold text-gray-900 dark:text-white">
                  {t('format.heading')}
                </h3>
                {isFormatExpanded ? (
                  <ChevronUp className="w-5 h-5 text-gray-500" />
                ) : (
                  <ChevronDown className="w-5 h-5 text-gray-500" />
                )}
              </button>

              {isFormatExpanded && (
              <div className="grid grid-cols-1 gap-2">
              {videoExportFormats.map((format) => (
                <button
                  key={format.id}
                  onClick={() => {
                    setSelectedFormat(format.id);
                    updateOption('format', format.id);
                  }}
                  disabled={format.premium && !user?.isPremium}
                  className={cn(
                    "p-3 rounded-lg border-2 transition-all text-left",
                    selectedFormat === format.id
                      ? "border-blue-500 bg-blue-50 dark:bg-blue-900/20"
                      : "border-gray-200 dark:border-gray-600 hover:border-gray-300 dark:hover:border-gray-500",
                    format.premium && !user?.isPremium && "opacity-50 cursor-not-allowed"
                  )}
                >
                  {format.premium && !user?.isPremium && (
                    <div className="absolute top-2 right-2">
                      <span className="px-2 py-1 bg-yellow-100 text-yellow-800 text-xs rounded font-medium">
                        {t('format.premium')}
                      </span>
                    </div>
                  )}
                  <div className="flex items-center space-x-2">
                    <div className="text-blue-600 dark:text-blue-400 flex-shrink-0">
                      {format.icon}
                    </div>
                    <div className="flex-1 min-w-0">
                      <h4 className="font-medium text-gray-900 dark:text-white text-sm">
                        {format.name}
                      </h4>
                      <p className="text-xs text-gray-600 dark:text-gray-400 truncate">
                        {format.description}
                      </p>
                      <div className="flex flex-wrap gap-1 mt-2">
                        {format.features.slice(0, 2).map((feature, index) => (
                          <span
                            key={index}
                            className="px-2 py-1 bg-gray-100 dark:bg-gray-700 text-xs text-gray-600 dark:text-gray-400 rounded"
                          >
                            {feature}
                          </span>
                        ))}
                      </div>
                    </div>
                  </div>
                </button>
              ))}
            </div>
              )}
          </div>

            {/* Video Quality Settings - Collapsible */}
            <div className="bg-white dark:bg-gray-800 rounded-lg border border-gray-200 dark:border-gray-700 p-4">
              <button
                onClick={() => setIsQualityExpanded(!isQualityExpanded)}
                className="w-full flex items-center justify-between text-left mb-3"
              >
                <h3 className="text-base font-semibold text-gray-900 dark:text-white">
                  {t('quality.heading')}
                </h3>
                {isQualityExpanded ? (
                  <ChevronUp className="w-5 h-5 text-gray-500" />
                ) : (
                  <ChevronDown className="w-5 h-5 text-gray-500" />
                )}
              </button>

              {isQualityExpanded && (
              <div className="space-y-3">
                {/* Quality Selector */}
                <div>
                  <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                    {t('quality.resolution')}
                  </label>
                  <select
                    value={exportOptions.quality}
                    onChange={(e) => updateOption('quality', e.target.value as '720p' | '1080p' | '2k')}
                    className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 dark:bg-gray-700 dark:text-white text-sm"
                  >
                    <option value="720p">{t('quality.resolutions.720p')}</option>
                    <option value="1080p">{t('quality.resolutions.1080p')}</option>
                    <option value="2k">{t('quality.resolutions.2k')}</option>
                  </select>
                  <p className="text-xs text-gray-500 dark:text-gray-400 mt-1">
                    {t('quality.note')}
                  </p>
                </div>

                {/* Compression Selector */}
                <div>
                  <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                    {t('quality.compression')}
                  </label>
                  <select
                    value={exportOptions.compression}
                    onChange={(e) => updateOption('compression', e.target.value as 'low' | 'medium' | 'high')}
                    className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 dark:bg-gray-700 dark:text-white text-sm"
                  >
                    <option value="low">{t('quality.compressionLow')}</option>
                    <option value="medium">{t('quality.compressionMedium')}</option>
                    <option value="high">{t('quality.compressionHigh')}</option>
                  </select>
                  <p className="text-xs text-gray-500 dark:text-gray-400 mt-1">
                    {exportOptions.compression === 'low' && t('quality.compressionNotes.low')}
                    {exportOptions.compression === 'medium' && t('quality.compressionNotes.medium')}
                    {exportOptions.compression === 'high' && t('quality.compressionNotes.high')}
                  </p>
                </div>

                {/* Frame Rate Selector */}
                <div>
                  <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                    {t('quality.frameRate')}
                  </label>
                  <select
                    value={exportOptions.frameRate}
                    onChange={(e) => updateOption('frameRate', parseInt(e.target.value) as 30 | 60)}
                    className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 dark:bg-gray-700 dark:text-white text-sm"
                  >
                    <option value="30">{t('quality.fps30')}</option>
                    <option value="60">{t('quality.fps60')}</option>
                  </select>
                </div>
              </div>
              )}
            </div>

        </div>
      </div>

      <div className="space-y-4">

        {/* Export Progress */}
        {isExporting && (
          <div className="bg-white dark:bg-gray-800 rounded-lg border border-gray-200 dark:border-gray-700 p-6">
            <div className="flex items-center justify-between mb-2">
              <h3 className="font-semibold text-gray-900 dark:text-white">
                {t('progress.heading')}
              </h3>
              <span className="text-sm text-gray-500">{Math.round(exportProgress)}%</span>
            </div>
            <div className="w-full bg-gray-200 dark:bg-gray-700 rounded-full h-2 mb-4">
              <div 
                className="bg-green-600 h-2 rounded-full transition-all duration-300"
                style={{ width: `${exportProgress}%` }}
              />
            </div>
            <div className="flex items-center text-sm text-gray-600 dark:text-gray-400">
              <Loader2 className="w-4 h-4 mr-2 animate-spin" />
              Processing your video...
            </div>
          </div>
        )}
      </div>
      </div>

      {/* Onboarding coach marks */}
      {trimHint.visible && trimReady && (
        <CoachMark
          anchorRef={trimRef}
          title={t('coach.trimTitle')}
          description={t('coach.trimDesc')}
          placement="right"
          onDismiss={trimHint.dismiss}
        />
      )}
      {formatHint.visible && formatReady && (
        <CoachMark
          anchorRef={formatSectionRef}
          title={t('coach.formatTitle')}
          description={t('coach.formatDesc')}
          placement="left"
          onDismiss={formatHint.dismiss}
        />
      )}
      {exportHint.visible && exportBtnReady && (
        <CoachMark
          anchorRef={exportBtnRef}
          title={t('coach.exportTitle')}
          description={t('coach.exportDesc')}
          placement="top"
          onDismiss={exportHint.dismiss}
        />
      )}
    </div>
  );
};

export default VideoExportPage;
