import { useState, useEffect, useRef, useCallback } from 'react';
import { useTranslation } from 'react-i18next';
import { useNavigate, useLocation } from 'react-router-dom';
import {
  Play,
  Pause,
  Square,
  Monitor,
  Maximize,
  Clock,
  Circle,
  Camera,
  ArrowLeft,
  Plus,
  Upload,
  X,
  Mic,
  MicOff,
  Settings,
  ChevronDown,
  HelpCircle
} from 'lucide-react';
import { toast } from 'sonner';
import { useAppStore, Project, Recording } from '../store/useAppStore';
import { cn } from '../lib/utils';
import { createLogger } from '../utils/logger';
import CoachMark from '../components/CoachMark';
import { useOnboardingHint, toggleAllOnboardingHints, useHintsSuppressed } from '../hooks/useOnboardingHint';

const logger = createLogger("RecordingPage");

interface RecordingSource {
  id: string;
  name: string;
  type: 'screen' | 'window';
  thumbnail?: string;
}

const RecordingPage: React.FC = () => {
  const { t } = useTranslation('recordingPage');
  const navigate = useNavigate();
  const location = useLocation();
  const {
    currentProject,
    setCurrentProject,
    projects,
    addProject,
    updateProject,
    isRecording,
    recordingStatus,
    currentRecording,
    startRecording,
    stopRecording,
    pauseRecording,
    resumeRecording,
    updateRecording,
    setCurrentRecording,
    settings
  } = useAppStore();

  // Get project info from navigation state
  const navigationState = location.state as { projectName?: string; projectId?: string } | null;
  const projectId = navigationState?.projectId || currentProject?.id;

  const [sources, setSources] = useState<RecordingSource[]>([]);
  const [selectedSource, setSelectedSource] = useState<RecordingSource | null>(null);
  const [recordingSettings, setRecordingSettings] = useState({
    quality: settings.recordingSettings.defaultQuality,
    fps: settings.recordingSettings.defaultFps,
    audioEnabled: settings.recordingSettings.includeMicrophone,
    audioDeviceId: 'default'
  });
  const [recordingTime, setRecordingTime] = useState(0);
  const [previewStream, setPreviewStream] = useState<MediaStream | null>(null);
  const [mediaRecorder, setMediaRecorder] = useState<MediaRecorder | null>(null);
  const [recordedChunks, setRecordedChunks] = useState<Blob[]>([]);
  const [showNewProjectModal, setShowNewProjectModal] = useState(false);
  const [newProjectName, setNewProjectName] = useState('');
  const [newProjectDescription, setNewProjectDescription] = useState('');
  const [isUploading, setIsUploading] = useState(false);
  const [uploadProgress, setUploadProgress] = useState(0);
  const [audioDevices, setAudioDevices] = useState<MediaDeviceInfo[]>([]);
  const [bookmarkCount, setBookmarkCount] = useState(0);
  const [showSettings, setShowSettings] = useState(false);
  const videoRef = useRef<HTMLVideoElement>(null);
  const intervalRef = useRef<NodeJS.Timeout | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Onboarding coach marks (one at a time, highest priority first)
  const hintsSuppressed = useHintsSuppressed();

  const sourceGridRef = useRef<HTMLElement | null>(null);
  const sourceHint = useOnboardingHint('recording.sourceSelector', { priority: 100, when: !isRecording });
  const [sourceHintAnchorReady, setSourceHintAnchorReady] = useState(false);
  const assignSourceGridRef = useCallback((el: HTMLDivElement | null) => {
    sourceGridRef.current = el;
    if (el) setSourceHintAnchorReady(true);
  }, []);

  const startButtonRef = useRef<HTMLButtonElement | null>(null);
  const startHint = useOnboardingHint('recording.startButton', { priority: 90, when: !isRecording });
  const [startHintAnchorReady, setStartHintAnchorReady] = useState(false);
  const assignStartButtonRef = useCallback((el: HTMLButtonElement | null) => {
    startButtonRef.current = el;
    if (el) setStartHintAnchorReady(true);
  }, []);

  const stopButtonRef = useRef<HTMLButtonElement | null>(null);
  const stopHint = useOnboardingHint('recording.stopButton', { priority: 80, when: isRecording });
  const [stopHintAnchorReady, setStopHintAnchorReady] = useState(false);
  const assignStopButtonRef = useCallback((el: HTMLButtonElement | null) => {
    stopButtonRef.current = el;
    if (el) setStopHintAnchorReady(true);
  }, []);

  const bookmarkHintBoxRef = useRef<HTMLElement | null>(null);
  const bookmarkHint = useOnboardingHint('recording.f10Bookmark', { priority: 70, when: !isRecording });
  const [bookmarkHintAnchorReady, setBookmarkHintAnchorReady] = useState(false);
  const assignBookmarkHintBoxRef = useCallback((el: HTMLDivElement | null) => {
    bookmarkHintBoxRef.current = el;
    if (el) setBookmarkHintAnchorReady(true);
  }, []);

  const settingsToggleRef = useRef<HTMLButtonElement | null>(null);
  const settingsHint = useOnboardingHint('recording.settings', { priority: 60, when: !isRecording });
  const [settingsHintAnchorReady, setSettingsHintAnchorReady] = useState(false);
  const assignSettingsToggleRef = useCallback((el: HTMLButtonElement | null) => {
    settingsToggleRef.current = el;
    if (el) setSettingsHintAnchorReady(true);
  }, []);

  // Bookmark event listener
  useEffect(() => {
    let cleanupBookmark: (() => void) | null = null;

    if (window.electronAPI?.onBookmarkCreated) {
      cleanupBookmark = window.electronAPI.onBookmarkCreated((event: any, data: any) => {
        setBookmarkCount(prev => prev + 1);
        toast.success(t('toast.bookmarkAdded', { time: data.title?.replace('Bookmark at ', '') || 'current time' }));
      });
    }

    return () => {
      if (cleanupBookmark) cleanupBookmark();
    };
  }, []);

  useEffect(() => {
    loadSources();
    loadAudioDevices();

    // Set up video recording event listeners
    let cleanupVideoStarted: (() => void) | null = null;
    let cleanupVideoStopped: (() => void) | null = null;
    let cleanupVideoError: (() => void) | null = null;

    if (window.electronAPI) {
      cleanupVideoStarted = window.electronAPI.onVideoRecordingStarted((event: any, data: any) => {
        logger.log('Video recording started event:', data);
        // Use setTimeout to defer toast call outside of render cycle
        setTimeout(() => {
          toast.success(t('toast.videoStarted', { source: data.sourceName }));
        }, 0);
      });

      cleanupVideoStopped = window.electronAPI.onVideoRecordingStopped(async (event: any, data: any) => {
        logger.log('Video recording stopped event:', data);

        // Use setTimeout to defer async operations outside of render cycle
        setTimeout(async () => {
          // Get current chunks from state
          const currentChunks = recordedChunks;

          // Save the recorded video if we have chunks
          if (currentChunks.length > 0) {
            try {
              const blob = new Blob(currentChunks, { type: 'video/webm' });
              const arrayBuffer = await blob.arrayBuffer();
              const uint8Array = new Uint8Array(arrayBuffer);

              const result = await window.electronAPI.saveRecording({
                filename: `recording_${Date.now()}.webm`,
                data: uint8Array,
                metadata: {
                  duration: 0,
                  resolution: '1920x1080',
                  fps: 30
                }
              });
              if (result.success) {
                toast.success(t('toast.videoSaved', { path: result.path }));
              } else {
                toast.error(t('toast.videoSaveFailed', { error: result.error }));
              }
            } catch (error) {
              logger.error('Error saving video:', error);
              toast.error(t('toast.videoSaveError'));
            }
          }
        }, 0);
      });

      // Note: No longer using event-based stream creation since we use getDisplayMedia directly

      cleanupVideoError = window.electronAPI.onVideoRecordingError((event: any, error: any) => {
        logger.error('Video recording error event:', error);
        // Use setTimeout to defer toast call outside of render cycle
        setTimeout(() => {
          toast.error(t('toast.videoError', { error: error.error }));
        }, 0);
      });
    }

    return () => {
      if (previewStream) {
        previewStream.getTracks().forEach(track => track.stop());
      }
      if (intervalRef.current) {
        clearInterval(intervalRef.current);
      }

      // Stop recording if still active when component unmounts
      if (isRecording && window.electronAPI) {
        logger.log('RecordingPage unmounting, stopping active recording...');
        window.electronAPI.stopGlobalRecording().catch((err) => logger.error(err));
      }

      // Cleanup video recording event listeners
      if (cleanupVideoStarted) cleanupVideoStarted();
      if (cleanupVideoStopped) cleanupVideoStopped();
      if (cleanupVideoError) cleanupVideoError();
    };
  }, []); // Remove recordedChunks dependency to prevent re-running during recording

  // Auto-open new project modal when arriving without a project
  useEffect(() => {
    if (!currentProject && !projectId) {
      setShowNewProjectModal(true);
    }
  }, []); // Only on mount

  // Auto-select current project when navigating from project page
  useEffect(() => {
    if (projectId && !currentProject) {
      // If we have a projectId from navigation but no current project selected, auto-select it
      const project = projects.find(p => p.id === projectId);
      if (project) {
        logger.log('Auto-selecting project from navigation:', project.name);
        setCurrentProject(project);
      }
    } else if (currentProject && projectId && currentProject.id !== projectId) {
      // If current project doesn't match navigation projectId, update it
      const project = projects.find(p => p.id === projectId);
      if (project) {
        logger.log('Updating to project from navigation:', project.name);
        setCurrentProject(project);
      }
    }
  }, [projectId, currentProject, projects, setCurrentProject]);

  useEffect(() => {
    if (isRecording && recordingStatus === 'recording') {
      intervalRef.current = setInterval(() => {
        setRecordingTime(prev => prev + 1);
      }, 1000);
    } else {
      if (intervalRef.current) {
        clearInterval(intervalRef.current);
        intervalRef.current = null;
      }
    }

    return () => {
      if (intervalRef.current) {
        clearInterval(intervalRef.current);
      }
    };
  }, [isRecording, recordingStatus]);


  // Helper function to format source names for better user experience
  const formatSourceName = (sourceName: string, sourceType: 'screen' | 'window'): string => {
    // Handle screen sources
    if (sourceType === 'screen') {
      if (sourceName.toLowerCase().includes('entire screen')) {
        return 'Entire Screen';
      }
      return sourceName.replace(/Screen \d+/, 'Screen').trim();
    }

    // Handle window sources - extract application names
    const name = sourceName.trim();
    
    // Common application patterns
    // Check Explorer BEFORE IDE names, since folder paths in Explorer titles can contain app names
    if (name.includes('File Explorer') || name.includes('Explorer.EXE')) {
      return 'File Explorer';
    }
    // Trae IDE: titles end with " - Trae" — don't match folder names containing "trae"
    if (name === 'Trae' || name.endsWith(' - Trae') || name.endsWith(' — Trae')) {
      return 'Trae';
    }
    // Docfai app window
    if (name === 'Docfai' || name.startsWith('Docfai ')) {
      return 'Docfai';
    }
    if (name.includes('Chrome') || name.includes('Google Chrome')) {
      return 'Chrome';
    }
    if (name.includes('Firefox') || name.includes('Mozilla Firefox')) {
      return 'Firefox';
    }
    if (name.includes('Edge') || name.includes('Microsoft Edge')) {
      return 'Edge';
    }
    if (name.includes('Visual Studio Code') || name.endsWith(' - Code') || name === 'Code') {
      return 'VS Code';
    }
    if (name.includes('Notepad')) {
      return 'Notepad';
    }
    if (name.includes('Word') || name.includes('Microsoft Word')) {
      return 'Word';
    }
    if (name.includes('Excel') || name.includes('Microsoft Excel')) {
      return 'Excel';
    }
    if (name.includes('PowerPoint') || name.includes('Microsoft PowerPoint')) {
      return 'PowerPoint';
    }
    if (name.includes('Outlook') || name.includes('Microsoft Outlook')) {
      return 'Outlook';
    }
    if (name.includes('Teams') || name.includes('Microsoft Teams')) {
      return 'Teams';
    }
    if (name.includes('Slack')) {
      return 'Slack';
    }
    if (name.includes('Discord')) {
      return 'Discord';
    }
    if (name.includes('Zoom')) {
      return 'Zoom';
    }
    if (name.includes('Calculator')) {
      return 'Calculator';
    }
    if (name.includes('Settings')) {
      return 'Settings';
    }
    if (name.includes('Control Panel')) {
      return 'Control Panel';
    }
    
    // Extract application name from common window title patterns
    // Pattern: "Document - Application" or "Application - Document"
    const dashSplit = name.split(' - ');
    if (dashSplit.length >= 2) {
      // Try to identify which part is the application name
      const lastPart = dashSplit[dashSplit.length - 1];
      const firstPart = dashSplit[0];
      
      // If last part looks like an app name (no file extensions), use it
      if (!lastPart.includes('.') && lastPart.length < 20) {
        return lastPart;
      }
      // Otherwise use first part if it's reasonable length
      if (firstPart.length < 20 && !firstPart.includes('.')) {
        return firstPart;
      }
    }
    
    // Remove common file extensions and paths
    let cleanName = name
      .replace(/\.[a-zA-Z0-9]+$/, '') // Remove file extensions
      .replace(/.*[\\\\/]/, '') // Remove file paths
      .replace(/\s*-\s*.*$/, '') // Remove everything after first dash
      .trim();
    
    // If name is still too long, truncate it
    if (cleanName.length > 15) {
      cleanName = cleanName.substring(0, 15) + '...';
    }
    
    return cleanName || 'Unknown Window';
  };

  const loadSources = async () => {
    try {
      if (window.electronAPI) {
        const electronSources = await window.electronAPI.getSources();

        // Filter out system overlays and unwanted sources
        const filteredSources = electronSources.filter(source => {
          const name = source.name.toLowerCase();

          // Exclude patterns for system overlays and GPU software
          const excludePatterns = [
            'nvidia',
            'geforce',
            'amd radeon',
            'radeon software',
            'shadowplay',
            'rtss',
            'rivatuner',
            'msi afterburner',
            'fraps',
            'discord overlay',
            'steam overlay',
            'xbox game bar',
            'nvidia share',
            'nvidia broadcast'
          ];

          return !excludePatterns.some(pattern => name.includes(pattern));
        });

        const formattedSources: RecordingSource[] = filteredSources.map(source => {
          const sourceType = source.id.startsWith('screen') ? 'screen' : 'window';
          return {
            id: source.id,
            name: formatSourceName(source.name, sourceType),
            type: sourceType,
            thumbnail: typeof source.thumbnail === 'string' ? source.thumbnail : source.thumbnail.toDataURL()
          };
        });
        setSources(formattedSources);

        // Auto-select primary screen
        const primaryScreen = formattedSources.find(s => s.type === 'screen');
        if (primaryScreen) {
          setSelectedSource(primaryScreen);
        }
      } else {
        setTimeout(() => {
          toast.error(t('toast.electronRequired'));
        }, 0);
      }
    } catch (error) {
      logger.error('Failed to load sources:', error);
      // Use setTimeout to defer toast call outside of render cycle
      setTimeout(() => {
        toast.error(t('toast.loadSourcesFailed'));
      }, 0);
    }
  };

  const loadAudioDevices = async () => {
    try {
      // Request microphone permission first
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      // Stop the stream immediately, we just needed permission
      stream.getTracks().forEach(track => track.stop());

      // Now enumerate devices
      const devices = await navigator.mediaDevices.enumerateDevices();
      const audioInputDevices = devices.filter(device => device.kind === 'audioinput');
      setAudioDevices(audioInputDevices);

      logger.log('Audio devices loaded:', audioInputDevices.length);
    } catch (error) {
      logger.error('Failed to load audio devices:', error);
      if (error instanceof Error && error.name === 'NotAllowedError') {
        setTimeout(() => {
          toast.warning(t('toast.micDenied'));
        }, 0);
      }
    }
  };

  const startPreview = async () => {
    if (!selectedSource) {
      setTimeout(() => {
        toast.error(t('toast.noSource'));
      }, 0);
      return;
    }

    // Stop existing preview first
    if (previewStream) {
      previewStream.getTracks().forEach(track => track.stop());
      setPreviewStream(null);
      if (videoRef.current) {
        videoRef.current.srcObject = null;
      }
    }

    try {
      if (window.electronAPI) {
        logger.log('Starting preview for source:', selectedSource.id);

        // Use direct getUserMedia with chromeMediaSource for Electron
        // Set max resolution to 2K to support all quality settings
        const videoConstraints = {
          audio: false,
          video: {
            mandatory: {
              chromeMediaSource: 'desktop',
              chromeMediaSourceId: selectedSource.id,
              maxWidth: 2560,
              maxHeight: 1440,
              maxFrameRate: recordingSettings.fps
            }
          }
        };

        const videoStream = await navigator.mediaDevices.getUserMedia(videoConstraints as any);
        logger.log('Video MediaStream created successfully:', videoStream);

        // If audio is enabled, get audio stream separately and combine
        let stream = videoStream;
        if (recordingSettings.audioEnabled) {
          try {
            const audioConstraints = {
              audio: {
                deviceId: recordingSettings.audioDeviceId !== 'default'
                  ? { exact: recordingSettings.audioDeviceId }
                  : undefined,
                echoCancellation: true,
                noiseSuppression: true,
                autoGainControl: true
              }
            };

            const audioStream = await navigator.mediaDevices.getUserMedia(audioConstraints);
            logger.log('Audio MediaStream created successfully:', audioStream);

            // Combine video and audio tracks into one stream
            const combinedStream = new MediaStream([
              ...videoStream.getVideoTracks(),
              ...audioStream.getAudioTracks()
            ]);
            stream = combinedStream;
            logger.log('Combined audio and video streams');
          } catch (audioError) {
            logger.error('Failed to get audio stream:', audioError);
            setTimeout(() => {
              toast.warning(t('toast.micFailed'));
            }, 0);
            // Continue with video only
            stream = videoStream;
          }
        }

        setPreviewStream(stream);

        // Wait for React to re-render (video element display depends on previewStream state)
        await new Promise(resolve => setTimeout(resolve, 50));

        if (videoRef.current) {
          logger.log('Setting video srcObject');
          videoRef.current.srcObject = stream;

          try {
            await videoRef.current.play();
            logger.log('Video preview started successfully');
          } catch (playError: any) {
            const errorMsg = playError?.message || playError?.name || String(playError);
            logger.error('Error playing video:', errorMsg);
            // Retry once after a short delay — stream may not be ready yet
            setTimeout(async () => {
              try {
                if (videoRef.current && videoRef.current.srcObject) {
                  await videoRef.current.play();
                  logger.log('Retry play successful');
                }
              } catch (retryError: any) {
                logger.error('Retry play failed:', retryError?.message || String(retryError));
                toast.error(t('toast.previewFailed'));
              }
            }, 300);
          }
        } else {
          logger.error('Video ref is null!');
        }
      } else {
        setTimeout(() => {
          toast.error(t('toast.electronRequired'));
        }, 0);
      }
    } catch (error) {
      logger.error('Failed to start preview:', error);
      if (error instanceof Error) {
        if (error.name === 'NotAllowedError') {
          setTimeout(() => {
            toast.error(t('toast.permissionDenied'));
          }, 0);
        } else if (error.name === 'NotFoundError') {
          setTimeout(() => {
            toast.error(t('toast.noCapture'));
          }, 0);
        } else if (error.name === 'NotSupportedError') {
          setTimeout(() => {
            toast.error(t('toast.notSupported'));
          }, 0);
        } else if (error.name === 'OverconstrainedError') {
          setTimeout(() => {
            toast.error(t('toast.overconstrained'));
          }, 0);
        } else {
          setTimeout(() => {
            toast.error(t('toast.previewFailedMessage', { message: error.message }));
          }, 0);
        }
      } else {
        setTimeout(() => {
          toast.error(t('toast.previewFailedGeneric'));
        }, 0);
      }
    }
  };

  const handleStartRecording = async () => {
    if (!currentProject) {
      setTimeout(() => {
        toast.error(t('toast.noProjectSelected'));
      }, 0);
      return;
    }

    if (!selectedSource) {
      setTimeout(() => {
        toast.error(t('toast.noSourceSelected'));
      }, 0);
      return;
    }

    try {
      // Clear previous chunks
      setRecordedChunks([]);
      
      let stream: MediaStream;
      
      // Use existing preview stream if available, otherwise create new one
      if (previewStream && previewStream.active) {
        logger.log('Using existing preview stream for recording');
        stream = previewStream;
        
        // Still need to start Electron recording even with existing stream
        if (window.electronAPI) {
          const electronSource = {
            id: selectedSource.id,
            name: selectedSource.name,
            thumbnail: selectedSource.thumbnail || ''
          };
          const recordingResult = await window.electronAPI.startGlobalRecording(electronSource);
          if (!recordingResult.success) {
            throw new Error(recordingResult.error || 'Failed to start video recording');
          }
        }
      } else {
        logger.log('Creating new stream for recording');
        
        if (window.electronAPI) {
          // Start Electron video recording first
          const electronSource = {
            id: selectedSource.id,
            name: selectedSource.name,
            thumbnail: selectedSource.thumbnail || ''
          };
          const recordingResult = await window.electronAPI.startGlobalRecording(electronSource);
          if (!recordingResult.success) {
            throw new Error(recordingResult.error || 'Failed to start video recording');
          }
          
          // Use direct screen capture for Windows standalone app
          // Determine resolution based on quality setting
          let width = 1920, height = 1080; // Default Full HD
          if (recordingSettings.quality === '2k') {
            width = 2560;
            height = 1440;
          }

          // Get video stream
          const videoStream = await navigator.mediaDevices.getUserMedia({
            audio: false,
            video: {
              mandatory: {
                chromeMediaSource: 'desktop',
                chromeMediaSourceId: selectedSource.id,
                maxWidth: width,
                maxHeight: height,
                maxFrameRate: recordingSettings.fps
              }
            }
          } as any);

          // If audio is enabled, get audio stream and combine
          if (recordingSettings.audioEnabled) {
            try {
              const audioConstraints = {
                audio: {
                  deviceId: recordingSettings.audioDeviceId !== 'default'
                    ? { exact: recordingSettings.audioDeviceId }
                    : undefined,
                  echoCancellation: true,
                  noiseSuppression: true,
                  autoGainControl: true
                }
              };

              const audioStream = await navigator.mediaDevices.getUserMedia(audioConstraints);
              logger.log('Audio stream added to recording');

              // Combine video and audio tracks
              stream = new MediaStream([
                ...videoStream.getVideoTracks(),
                ...audioStream.getAudioTracks()
              ]);
            } catch (audioError) {
              logger.error('Failed to get audio for recording:', audioError);
              setTimeout(() => {
                toast.warning(t('toast.micFailedRecording'));
              }, 0);
              stream = videoStream;
            }
          } else {
            stream = videoStream;
          }

          setPreviewStream(stream);

          if (videoRef.current) {
            videoRef.current.srcObject = stream;
          }
        } else {
          setTimeout(() => {
            toast.error(t('toast.electronRequired'));
          }, 0);
          return;
        }
      }

      // Set up MediaRecorder with WebM format (supported in Electron)
      let mimeType = '';
      const supportedTypes = [
        'video/webm;codecs=vp8',
        'video/webm',
        'video/mp4;codecs=h264',
        'video/mp4'
      ];
      
      // Debug: Check supported MIME types
      logger.log('=== MediaRecorder MIME Type Support Check ===');
      supportedTypes.forEach(type => {
        const isSupported = MediaRecorder.isTypeSupported(type);
        logger.log(`${type}: ${isSupported ? 'SUPPORTED' : 'NOT SUPPORTED'}`);
      });
      
      for (const type of supportedTypes) {
        if (MediaRecorder.isTypeSupported(type)) {
          mimeType = type;
          logger.log('✅ Selected MediaRecorder mimeType:', mimeType);
          break;
        }
      }
      
      if (!mimeType) {
        logger.log('⚠️ No supported mimeType found, using browser default');
      }

      // Calculate bitrate based on quality and FPS for sharp video
      let videoBitsPerSecond = 8000000; // 8 Mbps default (Full HD @ 30fps)

      if (recordingSettings.quality === '2k') {
        // For 2K resolution (2560x1440)
        videoBitsPerSecond = recordingSettings.fps === 60 ? 25000000 : 15000000; // 25 Mbps @ 60fps, 15 Mbps @ 30fps
        logger.log('🎥 Using 2K quality bitrate:', videoBitsPerSecond / 1000000, 'Mbps');
      } else {
        // For 1080p resolution
        videoBitsPerSecond = recordingSettings.fps === 60 ? 15000000 : 8000000; // 15 Mbps @ 60fps, 8 Mbps @ 30fps
        logger.log('🎥 Using 1080p quality bitrate:', videoBitsPerSecond / 1000000, 'Mbps');
      }

      const recorderOptions = mimeType ? {
        mimeType,
        videoBitsPerSecond,
        audioBitsPerSecond: 128000 // 128 kbps for audio
      } : {
        videoBitsPerSecond,
        audioBitsPerSecond: 128000
      };

      const recorder = new MediaRecorder(stream, recorderOptions);
      
      // Debug: Log the actual MIME type being used by MediaRecorder
      logger.log('🎥 MediaRecorder created with actual mimeType:', recorder.mimeType);
      logger.log('📝 Requested mimeType:', mimeType || 'browser default');
      if (recorder.mimeType !== mimeType && mimeType) {
        logger.log('⚠️ Browser overrode requested MIME type!');
      }
      
      const chunks: Blob[] = [];
      
      recorder.ondataavailable = (event) => {
        if (event.data.size > 0) {
          logger.log('MediaRecorder data available, chunk size:', event.data.size);
          chunks.push(event.data);
          // Also update the state immediately for real-time tracking
          setRecordedChunks(prev => [...prev, event.data]);
        }
      };
      
      recorder.onstop = () => {
         logger.log('MediaRecorder stopped, total chunks:', chunks.length);
         logger.log('Chunk sizes:', chunks.map(chunk => chunk.size));
         setRecordedChunks([...chunks]);
       };
       
       recorder.onerror = (event) => {
         logger.error('MediaRecorder error:', event);
         setTimeout(() => {
           toast.error(t('toast.videoRecordingError'));
         }, 0);
       };
      
      recorder.start(1000); // Collect data every second
      setMediaRecorder(recorder);
      
      // Only update preview stream and video element if we created a new stream
      if (!previewStream || !previewStream.active) {
        setPreviewStream(stream);
        if (videoRef.current) {
          videoRef.current.srcObject = stream;
        }
      }

      startRecording(currentProject.id, {
        name: `Recording ${new Date().toLocaleTimeString()}`,
        resolution: recordingSettings.quality === '2k' ? '2560x1440' : '1920x1080',
        fps: recordingSettings.fps,
        audioEnabled: recordingSettings.audioEnabled
      });

      setRecordingTime(0);
      
      // Inform user about the recording format
      setTimeout(() => {
        const format = mimeType.includes('mp4') ? 'MP4' : 'WebM';
        toast.success(t('toast.recordingStarted', { format }));
        logger.log(`🎥 Recording in ${format} format`);
      }, 0);
      
    } catch (error) {
      logger.error('Failed to start recording:', error);
      logger.error('Error details:', {
        name: error instanceof Error ? error.name : 'Unknown',
        message: error instanceof Error ? error.message : String(error),
        stack: error instanceof Error ? error.stack : undefined
      });
      
      if (error instanceof Error) {
        if (error.name === 'NotAllowedError') {
          setTimeout(() => {
            toast.error(t('toast.permissionDenied'));
          }, 0);
        } else if (error.name === 'NotFoundError') {
          setTimeout(() => {
            toast.error(t('toast.noCapture'));
          }, 0);
        } else if (error.name === 'NotSupportedError') {
          setTimeout(() => {
            toast.error(t('toast.notSupported'));
          }, 0);
        } else if (error.name === 'OverconstrainedError') {
          setTimeout(() => {
            toast.error(t('toast.overconstrained'));
          }, 0);
        } else {
          setTimeout(() => {
            toast.error(t('toast.previewFailedMessage', { message: error.message }));
          }, 0);
        }
      } else {
        setTimeout(() => {
          toast.error(t('toast.previewFailedGeneric'));
        }, 0);
      }
    }
  };

  const handleStopRecording = async () => {
    try {
      let finalChunks: Blob[] = [];
      
      // Stop MediaRecorder and wait for data
      if (mediaRecorder && mediaRecorder.state !== 'inactive') {
        // Wait for the MediaRecorder to finish processing and get the chunks
        finalChunks = await new Promise<Blob[]>((resolve) => {
          if (mediaRecorder.state === 'inactive') {
            resolve(recordedChunks);
            return;
          }
          
          const handleStop = () => {
            mediaRecorder.removeEventListener('stop', handleStop);
            // Wait a bit for the onstop event to update recordedChunks
            setTimeout(() => {
              resolve(recordedChunks);
            }, 100);
          };
          
          mediaRecorder.addEventListener('stop', handleStop);
          mediaRecorder.stop();
        });
      } else {
        finalChunks = recordedChunks;
      }
      
      // Stop the Electron global recording if available
      let recordingResult = null;
      if (window.electronAPI) {
        recordingResult = await window.electronAPI.stopGlobalRecording();
        logger.log('Stop recording result - bookmarks:', recordingResult?.bookmarks?.length || 0);
      }

      logger.log('Final chunks for saving:', finalChunks.length, 'chunks');
      logger.log('Chunks sizes:', finalChunks.map(chunk => chunk.size));

      // Save the recorded video if we have chunks
      let videoFilePath = '';
      if (finalChunks.length > 0) {
        try {
          // Use WebM format (supported by MediaRecorder in Electron)
          const recordingMimeType = mediaRecorder?.mimeType || 'video/webm';
          const fileExtension = recordingMimeType.includes('mp4') ? 'mp4' : 'webm';
          
          const blob = new Blob(finalChunks, { type: recordingMimeType });
          logger.log('Created blob size:', blob.size, 'bytes', 'type:', recordingMimeType);
          // Create filename based on project name instead of timestamp
          const sanitizedProjectName = currentProject?.name?.replace(/[^a-zA-Z0-9-_]/g, '_') || 'recording';
          const fileName = `${sanitizedProjectName}_${Date.now()}.${fileExtension}`;
          
          if (window.electronAPI && currentProject) {
            // Create project folder structure first
            await window.electronAPI.createProjectFolder(currentProject.name);
            
            // Save video file using project-based API
            const arrayBuffer = await blob.arrayBuffer();
            const uint8Array = new Uint8Array(arrayBuffer);
            const result = await window.electronAPI.saveProjectRecording(
              currentProject.name,
              fileName,
              uint8Array
            );
            if (result.filePath) {
              videoFilePath = result.relativePath || result.filePath;
              logger.log('Video saved to project folder:', result.filePath);
              logger.log('Relative path for serving:', videoFilePath);
            }
          } else if (!currentProject) {
            setTimeout(() => {
              toast.error(t('toast.noProjectForSave'));
            }, 0);
            return;
          } else {
            setTimeout(() => {
              toast.error(t('toast.electronRequired'));
            }, 0);
            return;
          }
        } catch (error) {
          logger.error('Failed to save video:', error);
          setTimeout(() => {
            toast.error(t('toast.videoFileSaveFailed'));
          }, 0);
        }
      } else {
        logger.log('No chunks available for saving');
        setTimeout(() => {
          toast.warning(t('toast.noVideoData'));
        }, 0);
      }

      // Update the current recording with video file path and duration
      if (currentRecording) {
        logger.log('Updating recording with video file path:', videoFilePath);
        logger.log('Recording duration:', recordingTime);
        logger.log('Bookmarks received:', recordingResult?.bookmarks?.length || 0);
        
        const updatedRecording = {
          ...currentRecording,
          filePath: videoFilePath,
          duration: recordingTime,
          bookmarks: recordingResult?.bookmarks || [],
          updatedAt: new Date().toISOString()
        };

        logger.log('Updated recording with', updatedRecording.bookmarks?.length || 0, 'bookmarks');

        // Update the recording in the store
        updateRecording(currentRecording.id, updatedRecording);

        // Set as current recording for editing
        setCurrentRecording(updatedRecording);
      }

      stopRecording();
      setRecordingTime(0);
      
      if (previewStream) {
        previewStream.getTracks().forEach(track => track.stop());
        setPreviewStream(null);
      }
      
      setMediaRecorder(null);
      setRecordedChunks([]);
      
      setTimeout(() => {
        toast.success(t('toast.recordingSaved'));
      }, 0);
      
      // Navigate to editing page with the video file path and bookmarks
      navigate('/editing', {
        state: {
          videoFilePath: videoFilePath,
          recordingId: currentRecording?.id,
          duration: recordingTime,
          bookmarks: recordingResult?.bookmarks || []
        } 
      });
    } catch (error) {
      logger.error('Failed to stop recording:', error);
      setTimeout(() => {
        toast.error(t('toast.stopFailed'));
      }, 0);
      
      // Still try to stop the local recording
      stopRecording();
      setRecordingTime(0);
      
      if (previewStream) {
        previewStream.getTracks().forEach(track => track.stop());
        setPreviewStream(null);
      }
      
      if (mediaRecorder && mediaRecorder.state !== 'inactive') {
        mediaRecorder.stop();
      }
      setMediaRecorder(null);
      setRecordedChunks([]);
      
      navigate('/editing');
    }
  };

  const handlePauseResume = () => {
    if (recordingStatus === 'recording') {
      if (mediaRecorder && mediaRecorder.state === 'recording') {
        mediaRecorder.pause();
      }
      pauseRecording();
      setTimeout(() => {
        toast.info(t('toast.recordingPaused'));
      }, 0);
    } else if (recordingStatus === 'paused') {
      if (mediaRecorder && mediaRecorder.state === 'paused') {
        mediaRecorder.resume();
      }
      resumeRecording();
      setTimeout(() => {
        toast.info(t('toast.recordingResumed'));
      }, 0);
    }
  };

  const handleCreateProject = async () => {
    if (!newProjectName.trim()) {
      setTimeout(() => {
        toast.error(t('toast.noProjectName'));
      }, 0);
      return;
    }

    try {
      // Create project folder structure if in Electron environment
      if (window.electronAPI) {
        await window.electronAPI.createProjectFolder(newProjectName.trim());
      }

      // Create the project object
      const newProject = {
        name: newProjectName.trim(),
        description: newProjectDescription.trim(),
        recordings: [],
        status: 'draft' as const,
        metadata: {
          totalDuration: 0,
          actionCount: 0,
          lastActivity: new Date().toISOString(),
        },
      };

      const createdProject = addProject(newProject);

      // Set as current project immediately
      setCurrentProject(createdProject);

      setNewProjectName('');
      setNewProjectDescription('');
      setShowNewProjectModal(false);
      setTimeout(() => {
        toast.success(t('toast.projectCreated'));
      }, 0);
    } catch (error) {
      logger.error('Failed to create project folder:', error);
      setTimeout(() => {
        toast.error(t('toast.projectFolderFailed'));
      }, 0);
    }
  };

  const handleUploadVideo = () => {
    if (fileInputRef.current) {
      fileInputRef.current.click();
    }
  };

  const handleFileSelect = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;

    // Validate file type
    const validTypes = ['video/webm', 'video/mp4'];
    if (!validTypes.includes(file.type)) {
      toast.error(t('toast.invalidFileType'));
      return;
    }

    // Note: No file size limit for local storage

    setIsUploading(true);
    setUploadProgress(0);

    try {
      // Create project name from file name if no project is selected
      const projectName = currentProject?.name || `Uploaded Video - ${file.name.replace(/\.[^/.]+$/, '')}`;
      
      let targetProject = currentProject;
      
      // Create new project if none selected
       if (!targetProject) {
         const newProject: Omit<Project, 'id' | 'createdAt' | 'updatedAt'> = {
           name: projectName,
           description: `Uploaded video project created from ${file.name}`,
           recordings: [],
           status: 'draft' as const,
           metadata: {
             totalDuration: 0,
             actionCount: 0,
             lastActivity: new Date().toISOString(),
           },
         };

        // Create project folder structure (includes uploads folder automatically)
        if (window.electronAPI) {
          await window.electronAPI.createProjectFolder(projectName);
        }

        addProject(newProject);
        
        // Wait for project to be created in store
        await new Promise(resolve => setTimeout(resolve, 100));
        const createdProject = projects.find(p => p.name === projectName);
         if (createdProject) {
           targetProject = createdProject;
         } else {
           // If project not found in store yet, we'll handle it after the project is created
           targetProject = { ...newProject, id: '', createdAt: '', updatedAt: '' } as Project;
         }
        setCurrentProject(targetProject);
      }

      // Simulate upload progress
      const progressInterval = setInterval(() => {
        setUploadProgress(prev => {
          if (prev >= 90) {
            clearInterval(progressInterval);
            return 90;
          }
          return prev + 10;
        });
      }, 200);

      // Save uploaded file to uploads folder
       const arrayBuffer = await file.arrayBuffer();
       const timestamp = Date.now();
       const fileName = `uploaded_${timestamp}_${file.name}`;
       
       let savedFilePath = '';
       if (window.electronAPI) {
         const result = await window.electronAPI.saveProjectUpload(
           targetProject.name,
           fileName,
           arrayBuffer
         );
         
         if (result.success) {
           savedFilePath = result.path || '';
         } else {
           throw new Error(result.error || 'Failed to save uploaded video');
         }
       }

      clearInterval(progressInterval);
      setUploadProgress(100);

      // Create recording entry for the uploaded video
       const newRecording: Recording = {
         id: `upload_${timestamp}`,
         projectId: targetProject.id || '',
         name: `Uploaded: ${file.name}`,
         filePath: savedFilePath,
         duration: 0, // Will be determined by video player
         resolution: '1920x1080',
         fps: 30,
         createdAt: new Date().toISOString(),
         actions: [],
         audioEnabled: false,
         keyboardTracking: false,
         mouseTracking: false,
         source: 'upload',
         documentationSteps: [],
         metadata: {
           projectTitle: targetProject.name,
           projectSource: 'upload'
         }
       };

      // Add recording to project
      if (targetProject.id) {
        const updatedProject = {
          ...targetProject,
          recordings: [...(targetProject.recordings || []), newRecording],
          metadata: {
            ...targetProject.metadata,
            lastActivity: new Date().toISOString()
          }
        };
        
        // Update project in store
        setTimeout(() => {
          const storeProject = projects.find(p => p.id === targetProject.id);
          if (storeProject) {
            // Use the store's update method
            updateProject(targetProject.id, updatedProject);
          }
        }, 100);
      }

      // Set current recording
      setCurrentRecording(newRecording);

      setTimeout(() => {
        toast.success(t('toast.uploadSuccess', { filename: file.name }));
        
        // Navigate to editing page after a short delay
        setTimeout(() => {
          navigate('/editing', {
            state: {
              videoFilePath: savedFilePath,
              recordingId: newRecording.id,
              fromUpload: true
            }
          });
        }, 1000);
      }, 0);

    } catch (error) {
      logger.error('Upload failed:', error);
      setTimeout(() => {
        toast.error(t('toast.uploadFailed', { error: error instanceof Error ? error.message : 'Unknown error' }));
      }, 0);
    } finally {
      setIsUploading(false);
      setUploadProgress(0);
      // Reset file input
      if (fileInputRef.current) {
        fileInputRef.current.value = '';
      }
    }
  };

  const handleSelectProject = (projectId: string) => {
    const project = projects.find(p => p.id === projectId);
    if (project) {
      setCurrentProject(project);
      setTimeout(() => {
        toast.success(t('toast.projectSelected', { name: project.name }));
      }, 0);
    }
  };

  const formatTime = (seconds: number) => {
    const mins = Math.floor(seconds / 60);
    const secs = seconds % 60;
    return `${mins.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`;
  };

  const getQualityLabel = (quality: string) => {
    switch (quality) {
      case 'fhd': return t('settings.quality.fhd');
      case '2k': return t('settings.quality.2k');
      default: return quality;
    }
  };

  return (
    <div className="flex h-full overflow-hidden">
      {/* LEFT SIDEBAR */}
      <div className="w-[480px] flex-shrink-0 flex flex-col bg-white dark:bg-gray-800 border-r border-gray-200 dark:border-gray-700 overflow-y-auto">

        {/* Header */}
        <div className="p-4 border-b border-gray-200 dark:border-gray-700">
          <div className="flex items-center justify-between">
            <div className="flex items-center space-x-3">
              <button
                onClick={() => navigate('/dashboard')}
                className="p-2 hover:bg-gray-100 dark:hover:bg-gray-700 rounded-lg transition-colors"
              >
                <ArrowLeft className="w-5 h-5 text-gray-600 dark:text-gray-400" />
              </button>
              <div>
                <h1 className="text-lg font-bold text-gray-900 dark:text-white">
                  {t('header.title')}
                </h1>
                <p className="text-sm text-gray-500 dark:text-gray-400">
                  {currentProject ? currentProject.name : t('header.noProject')}
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
              aria-label={hintsSuppressed ? t('hints.show') : t('hints.hide')}
              aria-pressed={!hintsSuppressed}
            >
              <HelpCircle className="w-4 h-4" />
            </button>
          </div>
        </div>

        {/* Create New Project prompt — shown when no project is selected */}
        {!currentProject && (
          <div className="p-3 border-b border-gray-200 dark:border-gray-700">
            <div className="p-3 rounded-lg bg-blue-50 dark:bg-blue-900/20 border border-blue-200 dark:border-blue-700">
              <p className="text-sm font-semibold text-blue-800 dark:text-blue-300 mb-1">
                {t('noProject.prompt')}
              </p>
              <p className="text-xs text-blue-600 dark:text-blue-400 mb-3">
                {t('noProject.description')}
              </p>
              <button
                onClick={() => setShowNewProjectModal(true)}
                className="w-full flex items-center justify-center gap-2 px-4 py-2 text-sm font-medium bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors"
              >
                <Plus className="w-4 h-4" />
                {t('noProject.createButton')}
              </button>
            </div>
          </div>
        )}

        {/* Source Selection */}
        <div className="p-3 border-b border-gray-200 dark:border-gray-700">
          <h3 className="text-sm font-semibold text-gray-900 dark:text-white mb-2">
            {t('source.heading')}
          </h3>
          <div ref={assignSourceGridRef} className="grid grid-cols-2 gap-2 max-h-[400px] overflow-y-auto">
            {sources.map((source) => (
              <button
                key={source.id}
                onClick={() => setSelectedSource(source)}
                disabled={isRecording}
                className={cn(
                  "p-2 border-2 rounded-lg transition-all duration-200 text-left disabled:opacity-60",
                  selectedSource?.id === source.id
                    ? "border-blue-500 bg-blue-50 dark:bg-blue-900/20"
                    : "border-gray-200 dark:border-gray-600 hover:border-gray-300 dark:hover:border-gray-500"
                )}
              >
                {source.thumbnail && (
                  <div className="bg-gray-900 rounded overflow-hidden mb-1.5">
                    <img
                      src={source.thumbnail}
                      alt={source.name}
                      className="w-full h-28 object-contain"
                    />
                  </div>
                )}
                <div className="flex items-center gap-1.5">
                  {source.type === 'screen' ? (
                    <Monitor className="w-3.5 h-3.5 text-blue-600 flex-shrink-0" />
                  ) : (
                    <Maximize className="w-3.5 h-3.5 text-green-600 flex-shrink-0" />
                  )}
                  <span className="text-xs font-medium text-gray-900 dark:text-white truncate">
                    {source.name}
                  </span>
                </div>
              </button>
            ))}
          </div>
        </div>

        {/* Settings (collapsible) */}
        <div className="border-b border-gray-200 dark:border-gray-700">
          <button
            ref={assignSettingsToggleRef}
            onClick={() => setShowSettings(!showSettings)}
            className="w-full p-3 flex items-center justify-between hover:bg-gray-50 dark:hover:bg-gray-700/50 transition-colors"
          >
            <div className="flex items-center gap-2">
              <Settings className="w-4 h-4 text-gray-500" />
              <span className="text-sm font-semibold text-gray-900 dark:text-white">{t('settings.heading')}</span>
            </div>
            <div className="flex items-center gap-2">
              {!showSettings && (
                <span className="text-xs text-gray-400 dark:text-gray-500">
                  {t('settings.summary', { quality: getQualityLabel(recordingSettings.quality), fps: recordingSettings.fps, micState: recordingSettings.audioEnabled ? t('settings.micOn') : t('settings.micOff') })}
                </span>
              )}
              <ChevronDown className={cn(
                "w-4 h-4 text-gray-400 transition-transform duration-200",
                showSettings && "rotate-180"
              )} />
            </div>
          </button>
          {showSettings && (
            <div className="px-3 pb-3 space-y-3">
              {/* Quality */}
              <div>
                <label className="block text-xs font-medium text-gray-600 dark:text-gray-400 mb-1">{t('settings.quality.label')}</label>
                <select
                  value={recordingSettings.quality}
                  onChange={(e) => setRecordingSettings(prev => ({ ...prev, quality: e.target.value as any }))}
                  disabled={isRecording}
                  className="w-full px-2.5 py-1.5 text-sm border border-gray-300 dark:border-gray-600 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 dark:bg-gray-700 dark:text-white disabled:opacity-50"
                >
                  <option value="fhd">{t('settings.quality.fhd')}</option>
                  <option value="2k">{t('settings.quality.2k')}</option>
                </select>
              </div>

              {/* Frame Rate */}
              <div>
                <label className="block text-xs font-medium text-gray-600 dark:text-gray-400 mb-1">{t('settings.frameRate.label')}</label>
                <select
                  value={recordingSettings.fps}
                  onChange={(e) => setRecordingSettings(prev => ({ ...prev, fps: parseInt(e.target.value) as any }))}
                  disabled={isRecording}
                  className="w-full px-2.5 py-1.5 text-sm border border-gray-300 dark:border-gray-600 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 dark:bg-gray-700 dark:text-white disabled:opacity-50"
                >
                  <option value={30}>30 FPS</option>
                  <option value={60}>60 FPS</option>
                </select>
              </div>

              {/* Microphone */}
              <div>
                <label className="block text-xs font-medium text-gray-600 dark:text-gray-400 mb-1">{t('settings.microphone.label')}</label>
                <button
                  onClick={() => setRecordingSettings(prev => ({ ...prev, audioEnabled: !prev.audioEnabled }))}
                  disabled={isRecording || audioDevices.length === 0}
                  className={cn(
                    "w-full px-2.5 py-1.5 text-sm border rounded-lg flex items-center justify-center gap-2 transition-colors",
                    recordingSettings.audioEnabled
                      ? "bg-green-50 border-green-500 text-green-700 dark:bg-green-900/20 dark:border-green-500 dark:text-green-300"
                      : "bg-gray-50 border-gray-300 text-gray-600 dark:bg-gray-700 dark:border-gray-600 dark:text-gray-400",
                    "disabled:opacity-50 disabled:cursor-not-allowed hover:opacity-80"
                  )}
                >
                  {recordingSettings.audioEnabled ? <Mic className="w-3.5 h-3.5" /> : <MicOff className="w-3.5 h-3.5" />}
                  <span>{recordingSettings.audioEnabled ? t('settings.microphone.on') : t('settings.microphone.off')}</span>
                </button>
                {audioDevices.length === 0 && (
                  <p className="text-xs text-gray-400 mt-1">{t('settings.microphone.noDevice')}</p>
                )}
              </div>

              {/* Audio Device Selection */}
              {recordingSettings.audioEnabled && audioDevices.length > 0 && (
                <div>
                  <label className="block text-xs font-medium text-gray-600 dark:text-gray-400 mb-1">{t('settings.microphone.deviceLabel')}</label>
                  <select
                    value={recordingSettings.audioDeviceId}
                    onChange={(e) => setRecordingSettings(prev => ({ ...prev, audioDeviceId: e.target.value }))}
                    disabled={isRecording}
                    className="w-full px-2.5 py-1.5 text-sm border border-gray-300 dark:border-gray-600 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 dark:bg-gray-700 dark:text-white disabled:opacity-50"
                  >
                    <option value="default">{t('settings.microphone.default')}</option>
                    {audioDevices.map((device) => (
                      <option key={device.deviceId} value={device.deviceId}>
                        {device.label || `Microphone ${device.deviceId.substring(0, 8)}`}
                      </option>
                    ))}
                  </select>
                </div>
              )}
            </div>
          )}
        </div>

        {/* Recording Controls */}
        <div className="p-3 border-b border-gray-200 dark:border-gray-700">
          {/* Recording Status */}
          {isRecording && (
            <div className="mb-3 p-2.5 rounded-lg bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <Circle className={cn(
                    "w-3 h-3 fill-current",
                    recordingStatus === 'recording' ? "text-red-500 animate-pulse" : "text-yellow-500"
                  )} />
                  <span className="text-sm font-medium text-red-700 dark:text-red-300">
                    {recordingStatus === 'recording' ? t('controls.recording') : t('controls.paused')}
                  </span>
                </div>
                <div className="flex items-center gap-1.5 text-red-700 dark:text-red-300">
                  <Clock className="w-3.5 h-3.5" />
                  <span className="font-mono text-sm">{formatTime(recordingTime)}</span>
                </div>
              </div>
              {bookmarkCount > 0 && (
                <div className="mt-1.5 text-xs text-red-600 dark:text-red-400">
                  {t('controls.stepsMarked', { count: bookmarkCount })}
                </div>
              )}
            </div>
          )}

          {/* Control Buttons */}
          <div className="space-y-2">
            {!isRecording ? (
              <>
                <button
                  onClick={startPreview}
                  disabled={!selectedSource || isRecording}
                  className="w-full flex items-center justify-center gap-2 px-4 py-2 text-sm border border-gray-300 dark:border-gray-600 text-gray-700 dark:text-gray-300 rounded-lg hover:bg-gray-50 dark:hover:bg-gray-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
                >
                  <Camera className="w-4 h-4" />
                  {t('controls.preview')}
                </button>
                <button
                  ref={assignStartButtonRef}
                  onClick={handleStartRecording}
                  disabled={!selectedSource || !currentProject}
                  className="w-full flex items-center justify-center gap-2 px-4 py-2.5 text-sm font-medium bg-red-600 text-white rounded-lg hover:bg-red-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
                >
                  <Play className="w-4 h-4" />
                  {t('controls.start')}
                </button>
              </>
            ) : (
              <div className="flex gap-2">
                <button
                  onClick={handlePauseResume}
                  className="flex-1 flex items-center justify-center gap-2 px-4 py-2 text-sm font-medium bg-yellow-600 text-white rounded-lg hover:bg-yellow-700 transition-colors"
                >
                  {recordingStatus === 'recording' ? (
                    <><Pause className="w-4 h-4" /> {t('controls.pause')}</>
                  ) : (
                    <><Play className="w-4 h-4" /> {t('controls.resume')}</>
                  )}
                </button>
                <button
                  ref={assignStopButtonRef}
                  onClick={handleStopRecording}
                  className="flex-1 flex items-center justify-center gap-2 px-4 py-2 text-sm font-medium bg-gray-600 text-white rounded-lg hover:bg-gray-700 transition-colors"
                >
                  <Square className="w-4 h-4" /> {t('controls.stop')}
                </button>
              </div>
            )}
          </div>
        </div>

        {/* F10 Bookmark Hint — prominent callout */}
        <div className="p-3 border-b border-gray-200 dark:border-gray-700">
          <div ref={assignBookmarkHintBoxRef} className="p-3 rounded-lg bg-amber-50 dark:bg-amber-900/20 border border-amber-200 dark:border-amber-700">
            <div className="flex items-center gap-2 mb-1.5">
              <div className="w-5 h-5 bg-amber-400 rounded-full border-2 border-amber-600 flex-shrink-0 flex items-center justify-center">
                <span className="text-[9px] font-bold text-amber-800">F10</span>
              </div>
              <p className="text-sm font-semibold text-amber-800 dark:text-amber-300">{t('bookmark.title')}</p>
            </div>
            <p className="text-xs text-amber-700 dark:text-amber-400 leading-relaxed ml-7">
              {t('bookmark.description')}
            </p>
          </div>
        </div>

        {/* Upload Video */}
        <div className="p-3">
          <button
            onClick={handleUploadVideo}
            disabled={isRecording || isUploading}
            className="w-full flex items-center justify-center gap-2 px-4 py-2 text-sm border border-gray-300 dark:border-gray-600 text-gray-600 dark:text-gray-400 rounded-lg hover:bg-gray-50 dark:hover:bg-gray-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
          >
            <Upload className="w-4 h-4" />
            {isUploading ? t('upload.uploading', { progress: uploadProgress }) : t('upload.button')}
          </button>
          <input
            ref={fileInputRef}
            type="file"
            accept=".webm,.mp4,video/webm,video/mp4"
            onChange={handleFileSelect}
            className="hidden"
          />
        </div>
      </div>

      {/* MAIN CONTENT — Video Preview */}
      <div className="flex-1 flex flex-col items-center justify-center min-w-0 p-6">
        <div className="w-full max-h-[70vh] aspect-video bg-gray-900 rounded-xl overflow-hidden relative">
          <video
            ref={videoRef}
            autoPlay
            muted
            playsInline
            controls={false}
            className={cn(
              "w-full h-full object-contain transition-opacity duration-300",
              previewStream ? "opacity-100" : "opacity-0"
            )}
            style={{ display: previewStream ? 'block' : 'none' }}
          />
          {!previewStream && (
            <div className="absolute inset-0 flex items-center justify-center">
              <div className="text-center">
                <Monitor className="w-16 h-16 text-gray-600 mx-auto mb-3" />
                <p className="text-gray-400 text-sm">
                  {selectedSource ? t('preview.clickPrompt') : t('preview.selectPrompt')}
                </p>
              </div>
            </div>
          )}

          {/* Recording overlay on preview */}
          {isRecording && previewStream && (
            <div className="absolute top-4 left-4 flex items-center gap-3 bg-black/60 backdrop-blur-sm px-4 py-2 rounded-lg">
              <div className="flex items-center gap-2">
                <Circle className={cn(
                  "w-3 h-3 fill-current",
                  recordingStatus === 'recording' ? "text-red-500 animate-pulse" : "text-yellow-500"
                )} />
                <span className="text-sm font-medium text-white">
                  {recordingStatus === 'recording' ? t('preview.rec') : t('preview.pausedOverlay')}
                </span>
              </div>
              <span className="font-mono text-sm text-white">{formatTime(recordingTime)}</span>
              {bookmarkCount > 0 && (
                <span className="px-2 py-0.5 bg-yellow-500/30 text-yellow-300 rounded-full text-xs font-medium">
                  {t('preview.steps', { count: bookmarkCount })}
                </span>
              )}
            </div>
          )}
        </div>
      </div>

      {/* New Project Modal */}
      {showNewProjectModal && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
          <div className="bg-white dark:bg-gray-800 rounded-lg p-6 w-full max-w-md mx-4">
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-lg font-semibold text-gray-900 dark:text-white">
                {t('modal.title')}
              </h3>
              <button
                onClick={() => setShowNewProjectModal(false)}
                className="p-1 hover:bg-gray-100 dark:hover:bg-gray-700 rounded transition-colors"
              >
                <X className="w-5 h-5 text-gray-500" />
              </button>
            </div>

            <div className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                  {t('modal.projectName')}
                </label>
                <input
                  type="text"
                  value={newProjectName}
                  onChange={(e) => setNewProjectName(e.target.value)}
                  placeholder={t('modal.projectNamePlaceholder')}
                  className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 dark:bg-gray-700 dark:text-white"
                  autoFocus
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                  {t('modal.description')}
                </label>
                <textarea
                  value={newProjectDescription}
                  onChange={(e) => setNewProjectDescription(e.target.value)}
                  placeholder={t('modal.descriptionPlaceholder')}
                  rows={3}
                  className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 dark:bg-gray-700 dark:text-white resize-none"
                />
              </div>
            </div>

            <div className="flex items-center justify-end space-x-3 mt-6">
              <button
                onClick={() => setShowNewProjectModal(false)}
                className="px-4 py-2 text-gray-700 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-700 rounded-lg transition-colors"
              >
                {t('modal.cancel')}
              </button>
              <button
                onClick={handleCreateProject}
                disabled={!newProjectName.trim()}
                className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
              >
                {t('modal.create')}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Onboarding coach marks — one shown at a time (highest priority first) */}
      {sourceHint.visible && sourceHintAnchorReady && sources.length > 0 && (
        <CoachMark
          anchorRef={sourceGridRef}
          title={t('coach.sourceTitle')}
          description={t('coach.sourceDesc')}
          placement="right"
          onDismiss={sourceHint.dismiss}
        />
      )}
      {startHint.visible && startHintAnchorReady && selectedSource && currentProject && (
        <CoachMark
          anchorRef={startButtonRef}
          title={t('coach.startTitle')}
          description={t('coach.startDesc')}
          placement="right"
          onDismiss={startHint.dismiss}
        />
      )}
      {stopHint.visible && stopHintAnchorReady && (
        <CoachMark
          anchorRef={stopButtonRef}
          title={t('coach.stopTitle')}
          description={t('coach.stopDesc')}
          placement="right"
          onDismiss={stopHint.dismiss}
        />
      )}
      {bookmarkHint.visible && bookmarkHintAnchorReady && (
        <CoachMark
          anchorRef={bookmarkHintBoxRef}
          title={t('coach.bookmarkTitle')}
          description={t('coach.bookmarkDesc')}
          placement="right"
          onDismiss={bookmarkHint.dismiss}
        />
      )}
      {settingsHint.visible && settingsHintAnchorReady && (
        <CoachMark
          anchorRef={settingsToggleRef}
          title={t('coach.settingsTitle')}
          description={t('coach.settingsDesc')}
          placement="right"
          onDismiss={settingsHint.dismiss}
        />
      )}
    </div>
  );
};

export default RecordingPage;
