import React, { useRef, useEffect, useState, useCallback, forwardRef, useImperativeHandle } from 'react';
import { Play, Pause, SkipBack, SkipForward, Volume2, VolumeX, AlertCircle, Maximize, Minimize, Camera, ChevronLeft, ChevronRight, ChevronsLeft, ChevronsRight } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { cn } from '../lib/utils';
import { useAppStore } from '../store/useAppStore';

interface VideoEditorProps {
  filePath: string;
  duration: number;
  currentTime: number;
  isPlaying: boolean;
  volume: number;
  isMuted: boolean;
  playbackSpeed: number;
  projectName?: string;
  fromUpload?: boolean;
  onTimeUpdate: (time: number) => void;
  onDurationChange: (duration: number) => void;
  onPlayStateChange: (isPlaying: boolean) => void;
  onVolumeChange: (volume: number) => void;
  onMuteToggle: () => void;
  onSpeedChange: (speed: number) => void;
  onSeek: (time: number) => void;
}

export interface VideoEditorHandle {
  extractCurrentFrame: () => Promise<string>;
}

export const VideoEditor = forwardRef<VideoEditorHandle, VideoEditorProps>(({
  filePath,
  duration,
  currentTime,
  isPlaying,
  volume,
  isMuted,
  playbackSpeed,
  projectName,
  fromUpload,
  onTimeUpdate,
  onDurationChange,
  onPlayStateChange,
  onVolumeChange,
  onMuteToggle,
  onSpeedChange,
  onSeek
}, ref) => {
  const { t } = useTranslation('editingPage');
  const videoRef = useRef<HTMLVideoElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const timelineRef = useRef<HTMLDivElement>(null);
  const [videoError, setVideoError] = useState<string | null>(null);
  const [videoLoaded, setVideoLoaded] = useState(false);
  const [videoSrc, setVideoSrc] = useState<string>('');
  const [isFullscreen, setIsFullscreen] = useState(false);
  const [isDragging, setIsDragging] = useState(false);
  const [showMarkButton, setShowMarkButton] = useState(false);

  useEffect(() => {
    if (!filePath || !videoRef.current) return;

    const video = videoRef.current;
    setVideoError(null);
    setVideoLoaded(false);

    // Prepare video source URL using secure methods
    const prepareVideoSource = async () => {
      let src = filePath;

      // Handle different environments
      const isDevelopment = window.location.href.includes('localhost') || window.location.href.includes('127.0.0.1');
      
      if (window.electronAPI && !isDevelopment) {
        // For production Electron, use secure IPC methods
        try {
          // Convert relative paths to absolute paths using secure IPC
          if (!src.match(/^[A-Za-z]:/)) {
            // Relative path - convert to absolute using secure path methods
            const projectsDir = await window.electronAPI.getProjectsDirectory();
            const normalizedProjectsDir = projectsDir.replace(/\\/g, '/');
            const normalizedVideoSrc = src.replace(/\\/g, '/');
            
            // Include project name in the path if available
            if (projectName) {
              src = `${normalizedProjectsDir}/${projectName}/${normalizedVideoSrc}`;
            } else {
              src = `${normalizedProjectsDir}/${normalizedVideoSrc}`;
            }
          }
          
          if (!src.startsWith('file://')) {
            // Convert Windows path to file:// URL
            src = `file:///${src.replace(/\\/g, '/').replace(/^[A-Z]:/, (match) => match.toLowerCase())}`;
          }
        } catch (error) {
          console.error('Failed to get secure video path:', error);
          // Fallback to original path construction
          if (!src.startsWith('file://')) {
            src = `file:///${src.replace(/\\/g, '/').replace(/^[A-Z]:/, (match) => match.toLowerCase())}`;
          }
        }
      } else {
        // For development environment
        // Extract just the filename from the full path
        const fileName = src.split('\\').pop() || src.split('/').pop();

        if (projectName && !src.startsWith('/project-files/') && !src.startsWith('./project-files/')) {
          // Use project-based serving with proper folder structure
          // Determine folder based on file path first, then fallback to fromUpload flag
          let folder = 'recordings'; // default
          if (filePath.includes('uploads') || filePath.includes('upload')) {
            folder = 'uploads';
          } else if (filePath.includes('recordings') || filePath.includes('recording')) {
            folder = 'recordings';
          } else {
            // Fallback to fromUpload flag
            folder = fromUpload ? 'uploads' : 'recordings';
          }
          // Serve from the project files middleware: ./project-files/:projectName/:folder/:fileName
          src = `./project-files/${encodeURIComponent(projectName)}/${folder}/${fileName}`;
        } else if (src.startsWith('/project-files/')) {
          // Path already formatted for project files middleware, just add ./ prefix if needed
          src = `.${src}`;
        } else {
          // Check if this is already a relative path for serving (starts with ./)
          if (src.startsWith('./')) {
            // Already a relative path, use as-is
          } else {
            // Check if the original path contains 'recordings' folder
            if (filePath.includes('recordings')) {
              // For recordings folder, use direct path serving
              const recordingsIndex = filePath.indexOf('recordings');
              const relativePath = filePath.substring(recordingsIndex);
              src = `./${relativePath.replace(/\\/g, '/')}`;
            } else {
              // Fallback to recordings directory
              src = `./recordings/${fileName}`;
            }
          }
        }
      }

      setVideoSrc(src);
      video.src = src;
    };

    prepareVideoSource();

    // Event handlers
    const handleLoadedMetadata = () => {
      setVideoLoaded(true);
      setVideoError(null); // Clear any previous error

      // Handle infinite duration by checking periodically
      if (isFinite(video.duration) && video.duration > 0) {
        onDurationChange(video.duration);
      } else {
        // Set up periodic check for duration
        const checkDuration = () => {
          if (isFinite(video.duration) && video.duration > 0) {
            onDurationChange(video.duration);
          } else {
            setTimeout(checkDuration, 500);
          }
        };
        checkDuration();
      }
    };

    const handleTimeUpdate = () => {
      onTimeUpdate(video.currentTime);
    };

    const handlePlay = () => {
      onPlayStateChange(true);
    };

    const handlePause = () => {
      onPlayStateChange(false);
    };

    const handleError = (e: Event) => {
      const error = video.error;
      let errorMessage = 'Unknown video error';
      
      if (error) {
        switch (error.code) {
          case error.MEDIA_ERR_ABORTED:
            errorMessage = 'Video loading was aborted';
            break;
          case error.MEDIA_ERR_NETWORK:
            errorMessage = 'Network error while loading video';
            break;
          case error.MEDIA_ERR_DECODE:
            errorMessage = 'Video decoding error';
            break;
          case error.MEDIA_ERR_SRC_NOT_SUPPORTED:
            errorMessage = 'Video format not supported or file not found';
            break;
        }
      }
      
      console.error('VideoEditor - Video error:', {
        error: error,
        errorCode: error?.code,
        errorMessage,
        networkState: video.networkState,
        readyState: video.readyState,
        src: video.src
      });
      
      setVideoError(errorMessage);
    };

    const handleCanPlay = () => {
      setVideoError(null); // Clear any previous error when video can play

      // Check duration again when video can play
      if (isFinite(video.duration) && video.duration > 0) {
        onDurationChange(video.duration);
      }
    };

    const handleDurationChange = () => {
      if (isFinite(video.duration) && video.duration > 0) {
        onDurationChange(video.duration);
      }
    };

    // Add event listeners
    video.addEventListener('loadedmetadata', handleLoadedMetadata);
    video.addEventListener('timeupdate', handleTimeUpdate);
    video.addEventListener('play', handlePlay);
    video.addEventListener('pause', handlePause);
    video.addEventListener('error', handleError);
    video.addEventListener('canplay', handleCanPlay);
    video.addEventListener('durationchange', handleDurationChange);

    // Set video properties
    video.volume = isMuted ? 0 : volume;
    video.playbackRate = playbackSpeed;

    // Cleanup
    return () => {
      video.removeEventListener('loadedmetadata', handleLoadedMetadata);
      video.removeEventListener('timeupdate', handleTimeUpdate);
      video.removeEventListener('play', handlePlay);
      video.removeEventListener('pause', handlePause);
      video.removeEventListener('error', handleError);
      video.removeEventListener('canplay', handleCanPlay);
      video.removeEventListener('durationchange', handleDurationChange);
    };
  }, [filePath, fromUpload, projectName]);

  // Update video properties when props change
  useEffect(() => {
    const video = videoRef.current;
    if (!video || !videoLoaded) return;

    video.volume = isMuted ? 0 : volume;
  }, [volume, isMuted, videoLoaded]);

  useEffect(() => {
    const video = videoRef.current;
    if (!video || !videoLoaded) return;

    video.playbackRate = playbackSpeed;
  }, [playbackSpeed, videoLoaded]);

  // Sync video time with currentTime prop
  useEffect(() => {
    const video = videoRef.current;
    if (!video || Math.abs(video.currentTime - currentTime) < 0.5) return;

    // Validate that currentTime is finite and duration is valid
    // Use video.duration if available and finite, otherwise fall back to duration prop
    const validDuration = isFinite(video.duration) && video.duration > 0 ? video.duration : 
                         (isFinite(duration) && duration > 0 ? duration : null);
    
    if (!isFinite(currentTime) || !validDuration) {
      console.warn('Cannot set currentTime: invalid values', { 
        currentTime, 
        videoDuration: video.duration, 
        propDuration: duration,
        validDuration 
      });
      return;
    }

    video.currentTime = currentTime;
  }, [currentTime]);

  // Sync play state
  useEffect(() => {
    const video = videoRef.current;
    if (!video) return;

    if (isPlaying && video.paused) {
      const playPromise = video.play();
      if (playPromise !== undefined) {
        playPromise.catch(error => {
          console.warn('Play interrupted:', error.message);
        });
      }
    } else if (!isPlaying && !video.paused) {
      video.pause();
    }
  }, [isPlaying]);

  const togglePlayPause = () => {
    const video = videoRef.current;
    if (!video) return;

    if (video.paused) {
      const playPromise = video.play();
      if (playPromise !== undefined) {
        playPromise.catch(error => {
          console.warn('Play interrupted:', error.message);
        });
      }
    } else {
      video.pause();
    }
  };

  const skipBackward = () => {
    onSeek(Math.max(0, currentTime - 10));
  };

  const skipForward = () => {
    // Only skip forward if duration is finite and valid
    if (!isFinite(duration) || duration === 0) {
      console.warn('Cannot skip forward: invalid duration', duration);
      return;
    }
    onSeek(Math.min(duration, currentTime + 10));
  };

  // Frame-by-frame navigation
  const seekFrameBackward = useCallback(() => {
    const video = videoRef.current;
    if (!video || !isFinite(duration) || duration === 0) return;

    // Assume 30 FPS, so 1 frame = 1/30 second = 0.033 seconds
    const frameTime = 1 / 30;
    const newTime = Math.max(0, currentTime - frameTime);
    onSeek(newTime);
  }, [currentTime, duration, onSeek]);

  const seekFrameForward = useCallback(() => {
    const video = videoRef.current;
    if (!video || !isFinite(duration) || duration === 0) return;

    // Assume 30 FPS, so 1 frame = 1/30 second = 0.033 seconds
    const frameTime = 1 / 30;
    const newTime = Math.min(duration, currentTime + frameTime);
    onSeek(newTime);
  }, [currentTime, duration, onSeek]);

  // Seek 1 second backward
  const seekSecondBackward = useCallback(() => {
    if (!isFinite(duration) || duration === 0) return;
    const newTime = Math.max(0, currentTime - 1);
    onSeek(newTime);
  }, [currentTime, duration, onSeek]);

  // Seek 1 second forward
  const seekSecondForward = useCallback(() => {
    if (!isFinite(duration) || duration === 0) return;
    const newTime = Math.min(duration, currentTime + 1);
    onSeek(newTime);
  }, [currentTime, duration, onSeek]);

  const formatTime = (seconds: number) => {
    // Handle infinite or invalid values
    if (!isFinite(seconds) || seconds < 0) {
      return '--:--';
    }
    const mins = Math.floor(seconds / 60);
    const secs = Math.floor(seconds % 60);
    return `${mins.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`;
  };

  const extractFrame = useCallback(async (timestamp: number): Promise<string> => {
    const video = videoRef.current;
    const canvas = canvasRef.current;

    if (!video) {
      console.error('Video element not found');
      return '';
    }
    if (!canvas) {
      console.error('Canvas element not found');
      return '';
    }

    const ctx = canvas.getContext('2d');
    if (!ctx) {
      console.error('Canvas context not available');
      return '';
    }

    // Set canvas dimensions to match video
    canvas.width = video.videoWidth || 640;
    canvas.height = video.videoHeight || 480;

    try {
      // Draw current video frame to canvas
      ctx.drawImage(video, 0, 0, canvas.width, canvas.height);

      // Convert to base64 image data
      const dataURL = canvas.toDataURL('image/jpeg', 0.9);
      return dataURL;
    } catch (error) {
      console.error('Error drawing video frame to canvas:', error);
      return '';
    }
  }, []);

  useImperativeHandle(ref, () => ({
    extractCurrentFrame: () => extractFrame(currentTime)
  }), [extractFrame, currentTime]);

  const handleMarkFrame = useCallback(async () => {
    if (!videoRef.current) {
      console.error('Video ref is null');
      return;
    }

    const imageData = await extractFrame(currentTime);

    if (imageData) {
      try {
        // Save screenshot to interactive screenshots folder
        const filename = `video-screenshot-${Date.now()}-${Math.random().toString(36).substring(2, 11)}.jpg`;

        // Get current project and recording from app store
        const { currentProject, currentRecording, updateRecording } = useAppStore.getState();
        const projectName = currentProject?.name || 'Step-by-Step Screenshots';

        if (window.electronAPI && window.electronAPI.saveProjectScreenshot) {
          const saveResult = await window.electronAPI.saveProjectScreenshot(
            projectName,
            filename,
            imageData
          );

          if (saveResult && saveResult.filePath) {
            // Create a new documentation step
            if (currentRecording) {
              const stepId = crypto.randomUUID();
              const newStep = {
                id: stepId,
                timestamp: currentTime,
                title: `Step ${(currentRecording.documentationSteps?.length || 0) + 1}`,
                description: `Screenshot taken at ${formatTime(currentTime)}`,
                screenshot: saveResult.relativePath,
                actionType: 'navigate' as const,
                element: 'Video frame',
                isGenerated: false
              };

              const updatedSteps = [...(currentRecording.documentationSteps || []), newStep];

              // Also create a corresponding bookmark for the timeline
              const newBookmark = {
                id: `bookmark_${Date.now()}_${Math.random().toString(36).substring(2, 9)}`,
                timestamp: currentTime * 1000, // Convert seconds to ms
                recordingTimestamp: Date.now(),
                title: `Bookmark at ${formatTime(currentTime)}`,
                description: ''
              };
              const updatedBookmarks = [...(currentRecording.bookmarks || []), newBookmark];

              updateRecording(currentRecording.id, {
                documentationSteps: updatedSteps,
                bookmarks: updatedBookmarks
              });

              // Also save screenshot to project metadata for Palette button functionality
              const { updateProject } = useAppStore.getState();
              if (currentProject && updateProject) {
                const newScreenshot = {
                  id: stepId, // Use same ID as the step
                  timestamp: Date.now(),
                  filePath: saveResult.filePath,
                  clickX: 0,
                  clickY: 0,
                  description: `Screenshot taken at ${formatTime(currentTime)}`
                };

                const existingScreenshots = currentProject.metadata?.screenshots || [];
                const updatedProjectScreenshots = [...existingScreenshots, newScreenshot];

                // Also update project metadata documentationSteps to stay in sync
                const existingDocSteps = currentProject.metadata?.documentationSteps || [];
                const updatedDocSteps = [...existingDocSteps, newStep];

                updateProject(currentProject.id, {
                  ...currentProject,
                  metadata: {
                    ...currentProject.metadata,
                    screenshots: updatedProjectScreenshots,
                    documentationSteps: updatedDocSteps
                  }
                });
              }
            } else {
              console.error('No current recording found - cannot create documentation step');
            }
          } else {
            console.error('Failed to save screenshot - no filePath in result:', saveResult);
            console.error('Full saveResult object:', saveResult);
          }
        } else {
          console.warn('Electron API not available');
        }
        
        setShowMarkButton(false);
      } catch (error) {
        console.error('Error saving screenshot:', error);
        console.error('Error details:', {
          message: error.message,
          stack: error.stack,
          name: error.name
        });
        setShowMarkButton(false);
      }
    } else {
      console.error('Failed to extract frame');
    }
  }, [currentTime, extractFrame]);

  const toggleFullscreen = useCallback(() => {
    setIsFullscreen(!isFullscreen);
  }, [isFullscreen]);

  const handleTimelineClick = useCallback((e: React.MouseEvent<HTMLDivElement>) => {
    if (!timelineRef.current) return;
    
    // Validate duration before timeline interaction
    if (!isFinite(duration) || duration === 0) {
      console.warn('Cannot seek: invalid duration', duration);
      return;
    }
    
    const rect = timelineRef.current.getBoundingClientRect();
    const clickX = e.clientX - rect.left;
    const percentage = clickX / rect.width;
    const newTime = percentage * duration;
    
    onSeek(Math.max(0, Math.min(duration, newTime)));
  }, [duration, onSeek]);

  const handleTimelineDrag = useCallback((e: React.MouseEvent<HTMLDivElement>) => {
    if (!isDragging || !timelineRef.current) return;
    
    // Validate duration before timeline interaction
    if (!isFinite(duration) || duration === 0) {
      console.warn('Cannot drag timeline: invalid duration', duration);
      return;
    }
    
    const rect = timelineRef.current.getBoundingClientRect();
    const clickX = e.clientX - rect.left;
    const percentage = Math.max(0, Math.min(1, clickX / rect.width));
    const newTime = percentage * duration;
    
    onSeek(newTime);
  }, [isDragging, duration, onSeek]);

  const handleMouseDown = useCallback(() => {
    setIsDragging(true);
  }, []);

  const handleMouseUp = useCallback(() => {
    setIsDragging(false);
  }, []);

  // Add global mouse up listener for timeline dragging
  useEffect(() => {
    if (isDragging) {
      document.addEventListener('mouseup', handleMouseUp);
      document.addEventListener('mousemove', handleTimelineDrag as any);
      return () => {
        document.removeEventListener('mouseup', handleMouseUp);
        document.removeEventListener('mousemove', handleTimelineDrag as any);
      };
    }
  }, [isDragging, handleMouseUp, handleTimelineDrag]);

  if (videoError) {
    return (
      <div className="w-full h-full flex items-center justify-center bg-gray-900 text-white">
        <div className="text-center max-w-md">
          <AlertCircle className="w-16 h-16 mx-auto mb-4 text-red-400" />
          <h3 className="text-lg font-semibold mb-2">Video Loading Error</h3>
          <p className="text-gray-400 mb-4">{videoError}</p>
          <div className="text-sm text-gray-500 space-y-1">
            <p><span className="font-medium">Original File:</span> {filePath}</p>
            <p><span className="font-medium">Video Source:</span> {videoSrc}</p>
            {videoError.includes('404') && (
              <div className="mt-4 p-3 bg-yellow-900/50 border border-yellow-600 rounded">
                <p className="text-yellow-300 text-xs">
                  <strong>Tip:</strong> The video file might not exist at the specified path. 
                  Check if the file exists in the recordings folder or try using a different recording.
                </p>
              </div>
            )}
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className={cn(
      "bg-black relative transition-all duration-300",
      isFullscreen ? "fixed inset-0 z-50" : "w-full h-full"
    )}>
      {/* Hidden canvas for frame extraction */}
      <canvas ref={canvasRef} className="hidden" />
      
      {/* Video Container */}
      <div 
        className="relative w-full h-full"
        onMouseEnter={() => setShowMarkButton(true)}
        onMouseLeave={() => setShowMarkButton(false)}
      >
        <video
          ref={videoRef}
          className="w-full h-full object-contain"
          preload="metadata"
        >
          Your browser does not support the video tag.
        </video>
        
        {!videoLoaded && (
          <div className="absolute inset-0 flex items-center justify-center bg-gray-900 bg-opacity-75">
            <div className="text-center text-white max-w-md">
              <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-white mx-auto mb-4"></div>
              <p className="mb-2">Loading video...</p>
              <div className="text-sm text-gray-400 space-y-1">
                <p><span className="font-medium">File:</span> {filePath}</p>
                <p><span className="font-medium">Source:</span> {videoSrc}</p>
                <p className="text-xs text-gray-500 mt-2">
                  If loading takes too long, the file might not exist or be accessible.
                </p>
              </div>
            </div>
          </div>
        )}
        
        {/* Take Screenshot Button */}
        {showMarkButton && videoLoaded && (
          <div className="absolute top-4 right-4 z-10">
            <button
              onClick={handleMarkFrame}
              className="bg-red-600 hover:bg-red-700 text-white p-3 rounded-lg shadow-lg transition-all duration-200 flex items-center space-x-2 backdrop-blur-sm"
              title="Take screenshot of current frame"
            >
              <Camera className="w-5 h-5" />
              <span>{t('videoEditor.takeScreenshot')}</span>
            </button>
          </div>
        )}
      </div>
      
      {/* Timeline and Controls */}
      <div className="absolute bottom-0 left-0 right-0 bg-gradient-to-t from-black via-black/80 to-transparent p-4">
        {/* Timeline */}
        <div className="mb-4">
          <div className="flex items-center justify-between text-white text-sm mb-2">
            <span>{formatTime(currentTime)}</span>
            <span>{formatTime(duration)}</span>
          </div>
          
          {/* Timeline Bar */}
          <div 
            ref={timelineRef}
            className="relative h-2 bg-gray-600 rounded-full cursor-pointer"
            onClick={handleTimelineClick}
            onMouseDown={handleMouseDown}
          >
            {/* Progress */}
            <div 
              className="absolute top-0 left-0 h-full bg-blue-500 rounded-full"
              style={{ width: `${isFinite(duration) && duration > 0 ? (currentTime / duration) * 100 : 0}%` }}
            />
            

            
            {/* Scrubber */}
            <div 
              className="absolute top-1/2 w-4 h-4 bg-white rounded-full transform -translate-y-1/2 -translate-x-2 shadow-lg"
              style={{ left: `${isFinite(duration) && duration > 0 ? (currentTime / duration) * 100 : 0}%` }}
            />
          </div>
        </div>
        
        {/* Controls */}
        <div className="flex items-center justify-between">
          {/* Playback Controls */}
          <div className="flex items-center space-x-2">
            {/* 10 seconds back */}
            <button
              onClick={skipBackward}
              className="p-2 hover:bg-gray-700 rounded-lg transition-colors text-white"
              title="Skip backward 10s"
            >
              <SkipBack className="w-5 h-5" />
            </button>

            {/* Frame-by-frame and precise controls */}
            <div className="flex items-center border-l border-r border-gray-600 px-2 space-x-1">
              {/* 1 second back */}
              <button
                onClick={seekSecondBackward}
                className="p-1.5 hover:bg-gray-700 rounded transition-colors text-white text-xs"
                title="Go back 1 second"
              >
                <ChevronsLeft className="w-4 h-4" />
              </button>

              {/* 1 frame back */}
              <button
                onClick={seekFrameBackward}
                className="p-1.5 hover:bg-gray-700 rounded transition-colors text-white text-xs"
                title="Previous frame (1/30s)"
              >
                <ChevronLeft className="w-4 h-4" />
              </button>

              {/* Play/Pause */}
              <button
                onClick={togglePlayPause}
                className="p-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors mx-1"
              >
                {isPlaying ? <Pause className="w-5 h-5" /> : <Play className="w-5 h-5" />}
              </button>

              {/* 1 frame forward */}
              <button
                onClick={seekFrameForward}
                className="p-1.5 hover:bg-gray-700 rounded transition-colors text-white text-xs"
                title="Next frame (1/30s)"
              >
                <ChevronRight className="w-4 h-4" />
              </button>

              {/* 1 second forward */}
              <button
                onClick={seekSecondForward}
                className="p-1.5 hover:bg-gray-700 rounded transition-colors text-white text-xs"
                title="Go forward 1 second"
              >
                <ChevronsRight className="w-4 h-4" />
              </button>
            </div>

            {/* 10 seconds forward */}
            <button
              onClick={skipForward}
              className="p-2 hover:bg-gray-700 rounded-lg transition-colors text-white"
              title="Skip forward 10s"
            >
              <SkipForward className="w-5 h-5" />
            </button>
          </div>

          {/* Center Controls */}
          <div className="flex items-center space-x-4">
            {/* Volume */}
            <div className="flex items-center space-x-2">
              <button onClick={onMuteToggle} className="text-white">
                {isMuted || volume === 0 ? (
                  <VolumeX className="w-5 h-5" />
                ) : (
                  <Volume2 className="w-5 h-5" />
                )}
              </button>
              <input
                type="range"
                min="0"
                max="1"
                step="0.1"
                value={isMuted ? 0 : volume}
                onChange={(e) => onVolumeChange(parseFloat(e.target.value))}
                className="w-20"
              />
            </div>

            {/* Speed */}
            <select
              value={playbackSpeed}
              onChange={(e) => onSpeedChange(parseFloat(e.target.value))}
              className="px-2 py-1 border border-gray-600 rounded bg-gray-700 text-white text-sm"
            >
              <option value={0.5}>0.5x</option>
              <option value={0.75}>0.75x</option>
              <option value={1}>1x</option>
              <option value={1.25}>1.25x</option>
              <option value={1.5}>1.5x</option>
              <option value={2}>2x</option>
            </select>
          </div>
          
          {/* Right Controls */}
          <div className="flex items-center space-x-2">
            <button
              onClick={toggleFullscreen}
              className="p-2 hover:bg-gray-700 rounded-lg transition-colors text-white"
              title={isFullscreen ? "Exit fullscreen" : "Enter fullscreen"}
            >
              {isFullscreen ? <Minimize className="w-5 h-5" /> : <Maximize className="w-5 h-5" />}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
});

VideoEditor.displayName = 'VideoEditor';

export default VideoEditor;