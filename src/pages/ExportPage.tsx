import { useState, useEffect, useMemo, useCallback, useRef } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import {
  Download,
  FileText,
  Presentation,
  Globe,
  Check,
  ArrowLeft,
  Loader2,
  Hash,
  HardDrive,
  FolderOpen,
  ExternalLink,
  HelpCircle
} from 'lucide-react';
import { toast } from 'sonner';
import { useTranslation } from 'react-i18next';
import { useAppStore } from '../store/useAppStore';
import { cn } from '../lib/utils';
import { docxExporter } from '../utils/docxExport';
import { templateDocxExporter } from '../utils/templateDocxExport';
import { templateHtmlExporter } from '../utils/templateHtmlExport';
import { getProjectFileAsDataUrl } from '../lib/utils';
import { TranslationService } from '../services/TranslationService';
import { TranslationModuleDownload } from '../components/TranslationModuleDownload';
import { createLogger } from '../utils/logger';
import { TemplatePanel } from '../components/templates';
import { DocumentTemplate, TemplateCustomization } from '../templates/types';
import { getDefaultCustomization, getTemplate, saveTemplateSettings, loadTemplateSettings, getTemplateCustomization } from '../templates/registry';
import { createPdfTemplateConfig } from '../utils/templatePdfConfig';
import PreviewPanel from '../components/PreviewPanel';
import { applyCustomization } from '../templates/registry';
import CoachMark from '../components/CoachMark';
import { useOnboardingHint, toggleAllOnboardingHints, useHintsSuppressed } from '../hooks/useOnboardingHint';

const logger = createLogger("ExportPage");

interface ExportFormat {
  id: string;
  name: string;
  description: string;
  icon: React.ReactNode;
  extension: string;
  features: string[];
  premium?: boolean;
}

interface ExportOptions {
  includeScreenshots: boolean;
  includeTimestamps: boolean;
  includeActions: boolean;
  theme: 'light' | 'dark' | 'auto';
  template: 'minimal' | 'detailed' | 'presentation';
  watermark: boolean;
  companyLogo: string | null;
  translateTo: 'none' | 'EN' | 'DE';
}



const ExportPage: React.FC = () => {
  const { t } = useTranslation('exportPage');
  const navigate = useNavigate();
  const location = useLocation();
  const {
    currentProject,
    currentRecording,
    settings
  } = useAppStore();

  // Get data from navigation state for interactive screenshots
  const locationState = location.state as {
    projectTitle?: string;
    projectSource?: string;
    screenshots?: any[];
    currentProject?: any;
    exportType?: string;
    unifiedSteps?: any[];
  } | null;

  const [selectedFormat, setSelectedFormat] = useState<string>('pdf');
  const [exportOptions, setExportOptions] = useState<ExportOptions>({
    includeScreenshots: true,
    includeTimestamps: true,
    includeActions: true,
    theme: 'light',
    template: 'detailed',
    watermark: false,
    companyLogo: null,
    translateTo: 'none'
  });
  const [isExporting, setIsExporting] = useState(false);
  const [exportProgress, setExportProgress] = useState(0);
  const [exportedFiles, setExportedFiles] = useState<Array<{ name: string; filePath: string | null }>>([]);

  // Translation module state
  const [showTranslationModuleDownload, setShowTranslationModuleDownload] = useState(false);
  const [translationModuleInstalled, setTranslationModuleInstalled] = useState<boolean | null>(null);
  const [pendingTranslationExport, setPendingTranslationExport] = useState(false);

  // The open-source build only exports to local files
  const selectedDestination: string = 'local';

  // Post-export success state
  const [lastExportResult, setLastExportResult] = useState<{ name: string; filePath: string | null } | null>(null);

  // Template state
  const [selectedTemplate, setSelectedTemplate] = useState<DocumentTemplate | null>(null);
  const [templateCustomization, setTemplateCustomization] = useState<TemplateCustomization>(() => getDefaultCustomization());
  const [templateSettingsLoaded, setTemplateSettingsLoaded] = useState(false);

  // Check translation module status on mount
  useEffect(() => {
    if (window.electronAPI?.translationModuleStatus) {
      window.electronAPI.translationModuleStatus().then((status) => {
        setTranslationModuleInstalled(status.installed);
      }).catch(() => {
        setTranslationModuleInstalled(null);
      });
    }
  }, []);

  // Load saved template settings on mount
  useEffect(() => {
    const loadSettings = async () => {
      try {
        const savedSettings = await loadTemplateSettings();
        if (savedSettings) {
          // Restore selected template
          if (savedSettings.selectedTemplateId) {
            const template = getTemplate(savedSettings.selectedTemplateId);
            if (template) {
              setSelectedTemplate(template);

              // Load customization for this specific template
              const templateCustom = savedSettings.templateCustomizations?.[savedSettings.selectedTemplateId];
              if (templateCustom) {
                setTemplateCustomization(templateCustom);
              }
            }
          } else {
            // No selected template, use default SOP
            const defaultTemplate = getTemplate('sop');
            if (defaultTemplate) {
              setSelectedTemplate(defaultTemplate);
              // Check if there's saved customization for SOP
              const sopCustom = savedSettings.templateCustomizations?.['sop'];
              if (sopCustom) {
                setTemplateCustomization(sopCustom);
              }
            }
          }
        } else {
          // No saved settings, use default SOP template
          const defaultTemplate = getTemplate('sop');
          if (defaultTemplate) {
            setSelectedTemplate(defaultTemplate);
          }
        }
      } catch (error) {
        console.error('Failed to load template settings:', error);
        // Fallback to default
        const defaultTemplate = getTemplate('sop');
        if (defaultTemplate) {
          setSelectedTemplate(defaultTemplate);
        }
      } finally {
        setTemplateSettingsLoaded(true);
      }
    };
    loadSettings();
  }, []);

  // Save template settings when they change (after initial load)
  useEffect(() => {
    if (templateSettingsLoaded) {
      saveTemplateSettings(
        selectedTemplate?.id || null,
        templateCustomization
      );
    }
  }, [selectedTemplate, templateCustomization, templateSettingsLoaded]);

  // Sync company logo between export options and template customization
  useEffect(() => {
    if (exportOptions.companyLogo !== templateCustomization.companyLogo) {
      setTemplateCustomization(prev => ({
        ...prev,
        companyLogo: exportOptions.companyLogo
      }));
    }
  }, [exportOptions.companyLogo]);

  // Manual save handler for template settings
  const handleSaveTemplateSettings = useCallback(async () => {
    await saveTemplateSettings(
      selectedTemplate?.id || null,
      templateCustomization
    );
  }, [selectedTemplate, templateCustomization]);

  const exportFormats: ExportFormat[] = [
    {
      id: 'pdf',
      name: t('formats.pdf.name'),
      description: t('formats.pdf.name'),
      icon: <FileText className="w-6 h-6" />,
      extension: '.pdf',
      features: ['Screenshots', 'Step descriptions', 'Timestamps', 'Professional layout']
    },
    {
      id: 'docx',
      name: t('formats.docx.name'),
      description: t('formats.docx.name'),
      icon: <FileText className="w-6 h-6" />,
      extension: '.docx',
      features: ['Embedded screenshots', 'Formatted text', 'Step-by-step guide', 'Editable document']
    },
    {
      id: 'html',
      name: t('formats.html.name'),
      description: t('formats.html.name'),
      icon: <Globe className="w-6 h-6" />,
      extension: '.html',
      features: ['Embedded video', 'Interactive timeline', 'Responsive design', 'Search functionality']
    },
    {
      id: 'pptx',
      name: t('formats.pptx.name'),
      description: t('formats.pptx.name'),
      icon: <Presentation className="w-6 h-6" />,
      extension: '.pptx',
      features: ['Slide-based format', 'Speaker notes', 'Animations', 'Template themes'],
      premium: true
    },
    {
      id: 'markdown',
      name: t('formats.markdown.name'),
      description: t('formats.markdown.name'),
      icon: <Hash className="w-6 h-6" />,
      extension: '.md',
      features: ['Plain text format', 'Version control friendly', 'Cross-platform', 'GitHub compatible'],
      premium: true
    }
  ];



  useEffect(() => {
    // Load user preferences for export options
    if (settings.exportSettings) {
      setExportOptions(prev => ({
        ...prev,
        ...settings.exportSettings
      }));
    }
  }, [settings]);

  const handleExport = async () => {
    // Enhanced debug logging that works in both dev and packaged app
    const debugLog = async (message: string) => {
      logger.log(message);
      // Also send to main process log file in packaged app
      if (window.electronAPI && window.electronAPI.logDebug) {
        try {
          await window.electronAPI.logDebug(message);
        } catch (error) {
          logger.error('Failed to send debug log to main process:', error);
        }
      }
    };
    
    // Debug logging at the start of handleExport
    await debugLog('[ExportPage Debug] 🚀 handleExport called with:');
    await debugLog(`[ExportPage Debug] selectedDestination: ${selectedDestination}`);
    await debugLog(`[ExportPage Debug] selectedFormat: ${selectedFormat}`);
    await debugLog(`[ExportPage Debug] window.electronAPI available: ${!!window.electronAPI}`);
    await debugLog(`[ExportPage Debug] hasExportData: ${hasExportData}`);
    
    if (!hasExportData) {
      await debugLog('[ExportPage Debug] ❌ No export data available');
      toast.error(t('toast.noData'));
      return;
    }

    await debugLog('[ExportPage Debug] ✅ Export data validation passed');
    setIsExporting(true);
    setExportProgress(0);
    await debugLog('[ExportPage Debug] 🔄 Export state initialized, starting export process...');

    let exportSucceeded = false;
    try {
      const fileName = `${exportData.name.replace(/[^a-z0-9]/gi, '_').toLowerCase()}.${selectedFormat}`;
      await debugLog(`[ExportPage Debug] 📁 Generated fileName: ${fileName}`);
      
      // First, generate the file content
      await debugLog('[ExportPage Debug] 🔧 Starting file content generation...');
      let fileContent: ArrayBuffer | Blob;
      let contentType: string;
      let processedHtmlExportData: any = null; // Capture processed HTML data for Confluence
      
      if (selectedFormat === 'docx') {
        await debugLog('[ExportPage Debug] 📄 Processing DOCX format export...');
        // DOCX Export using our custom exporter
        const progressInterval = setInterval(() => {
          setExportProgress(prev => Math.min(prev + 10, selectedDestination === 'local' ? 90 : 50));
        }, 200);

        try {
          await debugLog('[ExportPage Debug] 🔧 Calling docxExporter.exportToDocx...');
          
          // Process exportData for DOCX export - handle unifiedSteps structure
          let processedExportData = exportData;
          
          if (exportData.isInteractiveScreenshots && exportData.screenshots?.length > 0) {
            await debugLog('[ExportPage Debug] 📊 Processing unifiedSteps for DOCX export...');
            
            // Convert unifiedSteps structure to flat ScreenshotData[] format for docxExporter
            const processedScreenshots = await Promise.all(exportData.screenshots.map(async (item: any, index: number) => {
              if (item.type === 'docStep' && item.docStep?.diagramImagePath) {
                // Handle diagram steps - properly process diagramImagePath
                let imageData: string = '';
                const diagramImagePath = item.docStep.diagramImagePath;
                
                await debugLog(`[ExportPage Debug] 🎨 DOCX Processing diagram ${index + 1}: "${diagramImagePath}"`);
                
                if (diagramImagePath.startsWith('data:image/')) {
                  // Already a data URL
                  imageData = diagramImagePath;
                  await debugLog(`[ExportPage Debug] 🎨 Using existing data URL`);
                } else {
                  // Check if it's a file path
                  const isFilePath = diagramImagePath.includes('/') || 
                                   diagramImagePath.includes('\\') || 
                                   diagramImagePath.includes('.png') || 
                                   diagramImagePath.includes('.jpg') || 
                                   diagramImagePath.includes('.jpeg');
                  
                  if (isFilePath && currentProject?.name) {
                    // It's a file path, read the actual file
                    try {
                      const fileName = diagramImagePath.split(/[\/\\]/).pop();
                      await debugLog(`[ExportPage Debug] 🎨 Reading diagram file: "${fileName}"`);
                      if (fileName) {
                        const dataUrl = await getProjectFileAsDataUrl(currentProject.name, 'diagrams', fileName);
                        if (dataUrl) {
                          imageData = dataUrl;
                          await debugLog(`[ExportPage Debug] 🎨 Successfully loaded diagram file`);
                        } else {
                          await debugLog(`[ExportPage Debug] 🎨 ❌ Failed to load diagram file`);
                        }
                      }
                    } catch (error) {
                      await debugLog(`[ExportPage Debug] 🎨 ❌ Error loading diagram: ${error}`);
                    }
                  } else if (!isFilePath && !diagramImagePath.includes('/') && !diagramImagePath.includes('\\')) {
                    // Treat as base64 data
                    imageData = `data:image/png;base64,${diagramImagePath}`;
                    await debugLog(`[ExportPage Debug] 🎨 Treating as base64 data`);
                  } else {
                    await debugLog(`[ExportPage Debug] 🎨 ❌ Invalid diagram path format`);
                  }
                }
                
                await debugLog(`[ExportPage Debug] 🎨 Final diagram imageData: ${imageData ? 'HAS_DATA' : 'NO_DATA'}`);
                
                return {
                  id: item.docStep.id || `step-${index + 1}`,
                  imageData,
                  description: item.docStep.description,
                  title: item.docStep.title,
                  timestamp: item.docStep.timestamp,
                  actionType: 'diagram',
                  mediaType: item.docStep.mediaType,
                  videoClipPath: item.docStep.videoClipPath,
                  videoClipMimeType: item.docStep.videoClipMimeType,
                };
              } else if ((item.screenshot?.mediaType === 'video' || item.docStep?.mediaType === 'video' || item.docStep?.actionType === 'video') && (item.screenshot?.videoClipPath || item.docStep?.videoClipPath) && currentProject?.name) {
                // Video step — generate high-quality thumbnail from video file
                // IMPORTANT: Must be checked BEFORE item.screenshot because video steps also have screenshot data
                const videoClipPath = item.screenshot?.videoClipPath || item.docStep?.videoClipPath;
                const screenshotId = item.screenshot?.stepId || item.screenshot?.id || item.docStep?.id;
                const projectStep = currentProject?.metadata?.documentationSteps?.find((s: any) => s.id === screenshotId);
                const videoStepTitle = item.docStep?.title || item.screenshot?.title || projectStep?.title || `Video Step ${index + 1}`;
                await debugLog(`[ExportPage Debug] 🎬 DOCX Processing video step (unifiedSteps) - generating thumbnail for: ${videoClipPath}`);
                try {
                  const thumbnail = await window.electronAPI.generateVideoThumbnail(
                    currentProject.name, videoClipPath
                  );
                  return {
                    id: screenshotId || `step-${index + 1}`,
                    imageData: thumbnail,
                    description: item.docStep?.description || item.screenshot?.description || '',
                    title: `▶ ${videoStepTitle}`,
                    timestamp: item.screenshot?.timestamp || item.docStep?.timestamp,
                    actionType: 'video',
                    mediaType: 'video' as const,
                    videoClipPath,
                    videoClipMimeType: item.screenshot?.videoClipMimeType || item.docStep?.videoClipMimeType || projectStep?.videoClipMimeType,
                  };
                } catch (err) {
                  await debugLog(`[ExportPage Debug] 🎬 DOCX ❌ Failed to generate video thumbnail: ${err}`);
                  return {
                    id: screenshotId || `step-${index + 1}`,
                    imageData: item.screenshot?.imageData || '',
                    description: item.docStep?.description || item.screenshot?.description || '',
                    title: `▶ ${videoStepTitle}`,
                    timestamp: item.screenshot?.timestamp || item.docStep?.timestamp,
                    actionType: 'video',
                  };
                }
              } else if (item.screenshot) {
                // Handle regular screenshot steps
                // Get title from project metadata if not in screenshot
                const screenshotId = item.screenshot.stepId || item.screenshot.id;
                const projectStep = currentProject?.metadata?.documentationSteps?.find((s: any) => s.id === screenshotId);
                const stepTitle = item.screenshot.title || projectStep?.title;

                return {
                  id: screenshotId || `step-${index + 1}`,
                  imageData: item.screenshot.imageData || item.screenshot.dataUrl || item.screenshot.base64,
                  filePath: item.screenshot.filePath,
                  description: item.screenshot.description,
                  title: stepTitle,
                  timestamp: item.screenshot.timestamp,
                  actionType: item.screenshot.actionType || 'click',
                  mediaType: projectStep?.mediaType || item.screenshot.mediaType,
                  videoClipPath: projectStep?.videoClipPath || item.screenshot.videoClipPath,
                  videoClipMimeType: projectStep?.videoClipMimeType || item.screenshot.videoClipMimeType,
                };
              } else {
                // Fallback for other formats
                // Get title from project metadata if not in item
                const projectStep = currentProject?.metadata?.documentationSteps?.find(s => s.id === item.id);
                const stepTitle = item.title || projectStep?.title;

                return {
                  id: item.id || `step-${index + 1}`,
                  imageData: item.imageData,
                  filePath: item.filePath,
                  description: item.description,
                  title: stepTitle,
                  timestamp: item.timestamp,
                  actionType: item.actionType || 'click',
                  mediaType: projectStep?.mediaType || item.mediaType,
                  videoClipPath: projectStep?.videoClipPath || item.videoClipPath,
                  videoClipMimeType: projectStep?.videoClipMimeType || item.videoClipMimeType,
                };
              }
            }));
            
            processedExportData = {
              ...exportData,
              screenshots: processedScreenshots
            };
            
            await debugLog(`[ExportPage Debug] 📊 Processed ${processedScreenshots.length} screenshots for DOCX export`);
            await debugLog(`[ExportPage Debug] 📊 Sample processed screenshot: ${JSON.stringify({
              hasImageData: !!processedScreenshots[0]?.imageData,
              imageDataPreview: processedScreenshots[0]?.imageData?.substring(0, 50) + '...',
              description: processedScreenshots[0]?.description
            }, null, 2)}`);
          } else {
            await debugLog('[ExportPage Debug] 📊 Processing regular recording for DOCX export...');

            // Handle regular recording export for DOCX - process documentationSteps
            const baseScreenshots = currentProject?.metadata?.screenshots || [];

            // Use currentRecording steps, or fall back to project metadata documentationSteps
            // (when navigating from ProjectPageModal, currentRecording is null)
            const recordingSteps = currentRecording?.documentationSteps || currentProject?.metadata?.documentationSteps || [];
            const diagramStepsFromProject = currentProject?.metadata?.documentationSteps?.filter(
              step => step.type === 'diagram' || step.actionType === 'diagram'
            ) || [];

            const mergedSteps = [...recordingSteps];
            for (const diagramStep of diagramStepsFromProject) {
              if (!mergedSteps.find(step => step.id === diagramStep.id)) {
                await debugLog(`[ExportPage Debug] 📝 DOCX Adding diagram step from project metadata: ${diagramStep.id}`);
                mergedSteps.push(diagramStep);
              }
            }

            // Fallback: if no documentationSteps exist but project has plain screenshots, convert them
            if (mergedSteps.length === 0 && baseScreenshots.length > 0) {
              await debugLog(`[ExportPage Debug] 📊 DOCX No documentationSteps found, using ${baseScreenshots.length} plain screenshots`);
              baseScreenshots.forEach((s: any, index: number) => {
                mergedSteps.push({
                  id: s.id || `screenshot-${index + 1}`,
                  timestamp: s.timestamp || 0,
                  title: s.title || `Step ${index + 1}`,
                  description: s.description || '',
                  screenshot: s.filePath || s.imageData || '',
                  actionType: 'click' as const,
                  isGenerated: false,
                  mediaType: s.mediaType,
                  videoClipPath: s.videoClipPath,
                  videoClipMimeType: s.videoClipMimeType,
                });
              });
            }

            // For persisted steps where screenshot was stripped, recover filePath from metadata.screenshots
            for (const step of mergedSteps) {
              if (!step.screenshot && step.actionType !== 'diagram' && step.actionType !== 'video') {
                const matchingScreenshot = baseScreenshots.find((s: any) => s.id === step.id);
                if (matchingScreenshot?.filePath) {
                  step.screenshot = matchingScreenshot.filePath;
                  await debugLog(`[ExportPage Debug] 📸 DOCX Recovered filePath for step ${step.id} from metadata.screenshots`);
                }
              }
            }

            await debugLog(`[ExportPage Debug] 📊 DOCX Total documentationSteps to process: ${mergedSteps.length} (${recordingSteps.length} from recording/project + ${diagramStepsFromProject.length} diagrams from project)`);

            // Process ALL documentationSteps (both screenshots and diagrams) for DOCX
            const allStepScreenshots = await Promise.all(
              mergedSteps?.map(async (step, index) => {
                if ((step.type === 'diagram' || step.actionType === 'diagram') && step.diagramImagePath) {
                  // Handle diagram steps
                  let imageData = '';
                  const diagramImagePath = step.diagramImagePath;
                  
                  if (diagramImagePath.startsWith('data:image/')) {
                    // Already a data URL
                    imageData = diagramImagePath;
                    await debugLog(`[ExportPage Debug] 🎨 DOCX Using existing data URL for diagram`);
                  } else {
                    // Check if it's a file path
                    const isFilePath = diagramImagePath.includes('/') || 
                                     diagramImagePath.includes('\\') || 
                                     diagramImagePath.includes('.png') || 
                                     diagramImagePath.includes('.jpg') || 
                                     diagramImagePath.includes('.jpeg');
                    
                    if (isFilePath && currentProject?.name) {
                      // It's a file path, read the actual file
                      try {
                        const fileName = diagramImagePath.split(/[\/\\]/).pop();
                        await debugLog(`[ExportPage Debug] 🎨 DOCX Reading diagram file: "${fileName}"`);
                        if (fileName) {
                          const dataUrl = await getProjectFileAsDataUrl(currentProject.name, 'diagrams', fileName);
                          if (dataUrl) {
                            imageData = dataUrl;
                            await debugLog(`[ExportPage Debug] 🎨 DOCX Successfully loaded diagram file`);
                          } else {
                            await debugLog(`[ExportPage Debug] 🎨 DOCX ❌ Failed to load diagram file`);
                          }
                        }
                      } catch (error) {
                        await debugLog(`[ExportPage Debug] 🎨 DOCX ❌ Error loading diagram: ${error}`);
                      }
                    } else if (!isFilePath && !diagramImagePath.includes('/') && !diagramImagePath.includes('\\')) {
                      // Treat as base64 data
                      imageData = `data:image/png;base64,${diagramImagePath}`;
                      await debugLog(`[ExportPage Debug] 🎨 DOCX Treating as base64 data`);
                    } else {
                      await debugLog(`[ExportPage Debug] 🎨 DOCX ❌ Invalid diagram path format: "${diagramImagePath}"`);
                    }
                  }
                  
                  await debugLog(`[ExportPage Debug] 🎨 DOCX Final diagram imageData: ${imageData ? 'HAS_DATA' : 'NO_DATA'}`);

                  // Get title from project metadata if not in step
                  const projectStep = currentProject?.metadata?.documentationSteps?.find(s => s.id === step.id);
                  const stepTitle = step.title || projectStep?.title;

                  return {
                    id: step.id || `step-${index + 1}`,
                    imageData,
                    description: step.description,
                    title: stepTitle,
                    timestamp: step.timestamp,
                    actionType: 'diagram'
                  };
                } else if ((step.mediaType === 'video' || step.actionType === 'video') && step.videoClipPath && currentProject?.name) {
                  // Video step — generate high-quality thumbnail from video file
                  // IMPORTANT: This must be checked BEFORE step.screenshot because video steps
                  // also have a small thumbnail in step.screenshot from upload time
                  await debugLog(`[ExportPage Debug] 🎬 DOCX Processing video step - generating thumbnail`);
                  try {
                    const thumbnail = await window.electronAPI.generateVideoThumbnail(
                      currentProject.name, step.videoClipPath
                    );
                    const projectStep = currentProject?.metadata?.documentationSteps?.find(s => s.id === step.id);
                    const videoStepTitle = step.title || projectStep?.title || `Video Step ${index + 1}`;
                    return {
                      id: step.id || `step-${index + 1}`,
                      imageData: thumbnail,
                      description: step.description,
                      title: `▶ ${videoStepTitle}`,
                      timestamp: step.timestamp,
                      actionType: step.actionType || 'video',
                      mediaType: 'video' as const,
                      videoClipPath: step.videoClipPath,
                      videoClipMimeType: step.videoClipMimeType,
                    };
                  } catch (err) {
                    await debugLog(`[ExportPage Debug] 🎬 DOCX ❌ Failed to generate video thumbnail: ${err}`);
                    return null;
                  }
                } else if (step.screenshot) {
                  // Handle screenshot steps (regular image steps)
                  await debugLog(`[ExportPage Debug] 📸 DOCX Processing screenshot step - type: ${step.type}, actionType: ${step.actionType}, screenshot: ${step.screenshot}`);
                  let imageData = '';
                  const screenshotPath = step.screenshot;

                  if (screenshotPath.startsWith('data:image/')) {
                    // Already a data URL
                    imageData = screenshotPath;
                    await debugLog(`[ExportPage Debug] 📸 DOCX Using existing data URL for screenshot`);
                  } else {
                    // Check if it's a file path
                    const isFilePath = screenshotPath.includes('/') ||
                                     screenshotPath.includes('\\') ||
                                     screenshotPath.includes('.png') ||
                                     screenshotPath.includes('.jpg') ||
                                     screenshotPath.includes('.jpeg');

                    if (isFilePath && currentProject?.name) {
                      // It's a file path, read the actual file
                      try {
                        const pathParts = screenshotPath.split(/[\/\\]/);
                        const fileName = pathParts.pop() || screenshotPath;

                        await debugLog(`[ExportPage Debug] 📸 DOCX Reading screenshot file: "${fileName}" from project: "${currentProject.name}"`);
                        await debugLog(`[ExportPage Debug] 📸 DOCX Full screenshot path: "${screenshotPath}"`);
                        if (fileName) {
                          await debugLog(`[ExportPage Debug] 📸 DOCX Calling getProjectFileAsDataUrl("${currentProject.name}", "step_by_step_screenshots", "${fileName}")`);
                          const dataUrl = await getProjectFileAsDataUrl(currentProject.name, 'step_by_step_screenshots', fileName);
                          await debugLog(`[ExportPage Debug] 📸 DOCX getProjectFileAsDataUrl result: ${dataUrl ? 'SUCCESS' : 'NULL/FAILED'}`);
                          if (dataUrl && dataUrl.startsWith('data:image/')) {
                            imageData = dataUrl;
                            await debugLog(`[ExportPage Debug] 📸 DOCX ✅ Successfully loaded screenshot file - data URL length: ${dataUrl.length}`);
                          } else {
                            imageData = '';
                            await debugLog(`[ExportPage Debug] 📸 DOCX ❌ Failed to load screenshot file - getProjectFileAsDataUrl returned: ${dataUrl || 'null'}`);
                          }
                        } else {
                          await debugLog(`[ExportPage Debug] 📸 DOCX ❌ Could not extract fileName from path: "${screenshotPath}"`);
                        }
                      } catch (error) {
                        await debugLog(`[ExportPage Debug] 📸 DOCX ❌ Error loading screenshot: ${error}`);
                      }
                    } else if (!isFilePath && !screenshotPath.includes('/') && !screenshotPath.includes('\\')) {
                      // Treat as base64 data — detect JPEG vs PNG from magic bytes
                      const screenshotMime = screenshotPath.startsWith('/9j/') ? 'image/jpeg' : 'image/png';
                      imageData = `data:${screenshotMime};base64,${screenshotPath}`;
                      await debugLog(`[ExportPage Debug] 📸 DOCX Treating as base64 data`);
                    } else {
                      await debugLog(`[ExportPage Debug] 📸 DOCX ❌ Invalid screenshot path format: "${screenshotPath}"`);
                    }
                  }

                  // Get title from project metadata if not in step
                  const projectStep = currentProject?.metadata?.documentationSteps?.find(s => s.id === step.id);
                  const stepTitle = step.title || projectStep?.title;

                  return {
                    id: step.id || `step-${index + 1}`,
                    imageData,
                    description: step.description,
                    title: stepTitle,
                    timestamp: step.timestamp,
                    actionType: step.actionType || 'click'
                  };
                } else {
                  await debugLog(`[ExportPage Debug] ⚠️ DOCX Skipping step with type: ${step.type} (no valid image path)`);
                  return null;
                }
              }) || []
            );
            
            // Filter out null values
            const validStepScreenshots = allStepScreenshots.filter(screenshot => screenshot !== null);

            processedExportData = {
              ...exportData,
              name: currentProject?.metadata?.projectTitle || currentRecording?.name || currentProject?.name || 'Documentation',
              source: currentProject?.metadata?.projectSource || currentRecording?.metadata?.projectSource || '',
              // For video recordings, use only the processed steps (don't combine with baseScreenshots to avoid duplicates)
              screenshots: validStepScreenshots
            };
            
            await debugLog(`[ExportPage Debug] 📊 DOCX Processed ${validStepScreenshots.length} screenshots from regular recording`);
            await debugLog(`[ExportPage Debug] 📊 DOCX Sample processed screenshot: ${JSON.stringify({
              hasImageData: !!validStepScreenshots[0]?.imageData,
              imageDataPreview: validStepScreenshots[0]?.imageData?.substring(0, 50) + '...',
              description: validStepScreenshots[0]?.description
            }, null, 2)}`);
          }

          // Apply translation if requested
          if (exportOptions.translateTo !== 'none') {
            // Check if translation module is installed
            if (window.electronAPI?.translationModuleStatus) {
              const moduleStatus = await window.electronAPI.translationModuleStatus();
              if (!moduleStatus.installed) {
                await debugLog(`[ExportPage Debug] Translation module not installed, prompting download`);
                setPendingTranslationExport(true);
                setShowTranslationModuleDownload(true);
                setIsExporting(false);
                setExportProgress(0);
                return; // Export will be re-triggered after module download
              }
            }

            await debugLog(`[ExportPage Debug] 🌐 Translating content to ${exportOptions.translateTo}...`);
            try {
              const translatedData = await TranslationService.translateExportContent(
                {
                  projectTitle: processedExportData.name,
                  projectSource: processedExportData.source,
                  steps: processedExportData.screenshots || []
                },
                exportOptions.translateTo as 'EN' | 'DE'
              );

              // Update name and source with translated values
              processedExportData.name = translatedData.projectTitle || processedExportData.name;
              if (translatedData.projectSource) {
                processedExportData.source = translatedData.projectSource;
              }

              // Update screenshots with translated steps
              if (translatedData.steps && processedExportData.screenshots) {
                processedExportData.screenshots = processedExportData.screenshots.map((screenshot, index) => ({
                  ...screenshot,
                  title: translatedData.steps[index]?.title || screenshot.title,
                  description: translatedData.steps[index]?.description || screenshot.description
                }));
              }

              await debugLog(`[ExportPage Debug] ✅ Translation completed successfully`);
            } catch (error) {
              await debugLog(`[ExportPage Debug] ❌ Translation failed: ${error}`);
              toast.error(t('toast.translationFailed'));
            }
          }

          // Use template-based export when a template is selected
          if (selectedTemplate) {
            await debugLog(`[ExportPage Debug] 📄 Using template: ${selectedTemplate.name}`);
            fileContent = await templateDocxExporter.exportToDocx(processedExportData, {
              includeScreenshots: exportOptions.includeScreenshots,
              includeTimestamps: exportOptions.includeTimestamps,
              includeActions: exportOptions.includeActions,
              translateTo: exportOptions.translateTo,
              template: selectedTemplate,
              customization: templateCustomization
            });
          } else {
            fileContent = await docxExporter.exportToDocx(processedExportData, exportOptions);
          }
          contentType = 'application/vnd.openxmlformats-officedocument.wordprocessingml.document';
          await debugLog('[ExportPage Debug] ✅ DOCX export completed successfully');
          clearInterval(progressInterval);
          setExportProgress(selectedDestination === 'local' ? 100 : 60);
        } catch (error) {
          await debugLog(`[ExportPage Debug] ❌ DOCX export failed: ${error}`);
          clearInterval(progressInterval);
          throw error;
        }
      } else if (selectedFormat === 'html' && selectedTemplate) {
        // HTML Export with template - use our custom HTML exporter
        await debugLog('[ExportPage Debug] 📄 Processing HTML format export with template...');
        const progressInterval = setInterval(() => {
          setExportProgress(prev => Math.min(prev + 10, selectedDestination === 'local' ? 90 : 50));
        }, 200);

        try {
          await debugLog(`[ExportPage Debug] 📄 Using HTML template: ${selectedTemplate.name}`);

          // Process screenshots/video data before passing to HTML template
          // (same processing as DOCX path to flatten unifiedSteps into ScreenshotData)
          let processedHtmlScreenshots: any[] = [];
          const projectName = currentProject?.name || exportData.projectName || 'Project';

          if (exportData.isInteractiveScreenshots && exportData.screenshots?.length > 0) {
            processedHtmlScreenshots = await Promise.all(exportData.screenshots.map(async (item: any, index: number) => {
              if (item.type === 'docStep' && item.docStep?.diagramImagePath) {
                // Diagram step — load image from file
                let imageData = '';
                if (item.docStep.diagramImagePath.startsWith('data:image/')) {
                  imageData = item.docStep.diagramImagePath;
                } else {
                  try {
                    const fileName = item.docStep.diagramImagePath.split(/[\/\\]/).pop();
                    if (fileName && currentProject?.name) {
                      const dataUrl = await getProjectFileAsDataUrl(currentProject.name, 'diagrams', fileName);
                      imageData = dataUrl || '';
                    }
                  } catch (error) {
                    logger.error('[ExportPage] Failed to load diagram for HTML export:', error);
                  }
                }
                return {
                  id: item.docStep.id || `step-${index + 1}`,
                  imageData,
                  title: item.docStep.title || `Step ${index + 1}`,
                  description: item.docStep.description || '',
                  actionType: item.docStep.actionType,
                  timestamp: item.docStep.timestamp,
                  mediaType: item.docStep.mediaType,
                  videoClipPath: item.docStep.videoClipPath,
                  videoClipMimeType: item.docStep.videoClipMimeType,
                };
              } else if (item.type === 'docStep' && (item.docStep?.mediaType === 'video' || item.docStep?.actionType === 'video') && item.docStep?.videoClipPath) {
                // Video docStep (not a diagram) — pass through video metadata for the HTML template to load
                return {
                  id: item.docStep.id || `step-${index + 1}`,
                  imageData: item.docStep.imageData || '',
                  title: item.docStep.title || `Video Step ${index + 1}`,
                  description: item.docStep.description || '',
                  actionType: item.docStep.actionType || 'video',
                  timestamp: item.docStep.timestamp,
                  mediaType: 'video' as const,
                  videoClipPath: item.docStep.videoClipPath,
                  videoClipMimeType: item.docStep.videoClipMimeType,
                };
              } else if (item.screenshot) {
                // Screenshot step — load image from data or file
                let screenshotImageData: string | null = null;
                if (item.screenshot.imageData || item.screenshot.dataUrl || item.screenshot.base64) {
                  screenshotImageData = item.screenshot.imageData || item.screenshot.dataUrl || item.screenshot.base64;
                } else if (item.screenshot.filePath) {
                  if (item.screenshot.filePath.startsWith('data:image/')) {
                    screenshotImageData = item.screenshot.filePath;
                  } else {
                    try {
                      const fileName = item.screenshot.filePath.split(/[\/\\]/).pop();
                      if (fileName && currentProject?.name) {
                        screenshotImageData = await getProjectFileAsDataUrl(currentProject.name, 'step_by_step_screenshots', fileName);
                      }
                    } catch (error) {
                      logger.error('[ExportPage] Failed to load screenshot for HTML export:', error);
                    }
                  }
                }
                const screenshotId = item.screenshot.stepId || item.screenshot.id;
                const projStep = currentProject?.metadata?.documentationSteps?.find((s: any) => s.id === screenshotId);
                return {
                  id: screenshotId || `step-${index + 1}`,
                  imageData: screenshotImageData,
                  title: item.docStep?.title || item.title || `Step ${index + 1}`,
                  description: item.docStep?.description || item.screenshot.description || '',
                  actionType: item.docStep?.actionType || item.screenshot.actionType,
                  timestamp: item.screenshot.timestamp,
                  mediaType: projStep?.mediaType || item.screenshot.mediaType || item.docStep?.mediaType,
                  videoClipPath: projStep?.videoClipPath || item.screenshot.videoClipPath || item.docStep?.videoClipPath,
                  videoClipMimeType: projStep?.videoClipMimeType || item.screenshot.videoClipMimeType || item.docStep?.videoClipMimeType,
                };
              } else {
                return item;
              }
            }));
          } else {
            processedHtmlScreenshots = exportData.screenshots || [];
          }

          // Merge recording documentationSteps with diagram steps from project metadata
          // Use currentRecording steps, or fall back to project metadata documentationSteps
          // (when navigating from ProjectPageModal, currentRecording is null)
          const htmlRecordingSteps = currentRecording?.documentationSteps || currentProject?.metadata?.documentationSteps || [];
          const htmlDiagramStepsFromProject = currentProject?.metadata?.documentationSteps?.filter(
            (step: any) => step.type === 'diagram' || step.actionType === 'diagram'
          ) || [];
          const htmlMergedSteps = [...htmlRecordingSteps];
          for (const diagramStep of htmlDiagramStepsFromProject) {
            if (!htmlMergedSteps.find(step => step.id === diagramStep.id)) {
              htmlMergedSteps.push(diagramStep);
            }
          }

          // Fallback: if no documentationSteps but project has plain screenshots
          const htmlBaseScreenshots = currentProject?.metadata?.screenshots || [];
          if (htmlMergedSteps.length === 0 && htmlBaseScreenshots.length > 0) {
            htmlBaseScreenshots.forEach((s: any, index: number) => {
              htmlMergedSteps.push({
                id: s.id || `screenshot-${index + 1}`,
                timestamp: s.timestamp || 0,
                title: s.title || `Step ${index + 1}`,
                description: s.description || '',
                screenshot: s.filePath || s.imageData || '',
                actionType: 'click',
                isGenerated: false,
                mediaType: s.mediaType,
                videoClipPath: s.videoClipPath,
                videoClipMimeType: s.videoClipMimeType,
              });
            });
          }

          // Recover file paths for persisted steps where screenshot was stripped
          for (const step of htmlMergedSteps) {
            if (!step.screenshot && step.actionType !== 'diagram' && step.actionType !== 'video') {
              const matchingScreenshot = htmlBaseScreenshots.find((s: any) => s.id === step.id);
              if (matchingScreenshot?.filePath) {
                step.screenshot = matchingScreenshot.filePath;
              }
            }
          }

          htmlMergedSteps.sort((a: any, b: any) => (a.timestamp || 0) - (b.timestamp || 0));

          const htmlExportData = {
            name: exportData.name || currentProject?.metadata?.projectTitle || 'Documentation',
            projectName,
            screenshots: processedHtmlScreenshots,
            isInteractiveScreenshots: exportData.isInteractiveScreenshots,
            documentationSteps: htmlMergedSteps
          };

          // Apply translation if requested
          if (exportOptions.translateTo !== 'none') {
            if (window.electronAPI?.translationModuleStatus) {
              const moduleStatus = await window.electronAPI.translationModuleStatus();
              if (!moduleStatus.installed) {
                await debugLog(`[ExportPage Debug] Translation module not installed for HTML export, prompting download`);
                setPendingTranslationExport(true);
                setShowTranslationModuleDownload(true);
                setIsExporting(false);
                setExportProgress(0);
                clearInterval(progressInterval);
                return;
              }
            }

            await debugLog(`[ExportPage Debug] 🌐 Translating HTML content to ${exportOptions.translateTo}...`);
            try {
              const translatedData = await TranslationService.translateExportContent(
                {
                  projectTitle: htmlExportData.name,
                  projectSource: undefined,
                  steps: htmlExportData.screenshots?.length > 0
                    ? htmlExportData.screenshots
                    : (htmlExportData.documentationSteps || [])
                },
                exportOptions.translateTo as 'EN' | 'DE'
              );

              // Update name with translated value
              htmlExportData.name = translatedData.projectTitle || htmlExportData.name;

              // Update steps with translated content
              if (translatedData.steps) {
                if (htmlExportData.screenshots?.length > 0) {
                  htmlExportData.screenshots = htmlExportData.screenshots.map((screenshot: any, index: number) => ({
                    ...screenshot,
                    title: translatedData.steps[index]?.title || screenshot.title,
                    description: translatedData.steps[index]?.description || screenshot.description
                  }));
                } else if (htmlExportData.documentationSteps?.length > 0) {
                  htmlExportData.documentationSteps = htmlExportData.documentationSteps.map((step: any, index: number) => ({
                    ...step,
                    title: translatedData.steps[index]?.title || step.title,
                    description: translatedData.steps[index]?.description || step.description
                  }));
                }
              }

              await debugLog(`[ExportPage Debug] ✅ HTML Translation completed successfully`);
            } catch (error) {
              await debugLog(`[ExportPage Debug] ❌ HTML Translation failed: ${error}`);
              toast.error(t('toast.translationFailed'));
            }
          }

          const htmlContent = await templateHtmlExporter.exportToHtml(htmlExportData, {
            includeScreenshots: exportOptions.includeScreenshots,
            includeTimestamps: exportOptions.includeTimestamps,
            includeActions: exportOptions.includeActions,
            translateTo: exportOptions.translateTo,
            template: selectedTemplate,
            customization: templateCustomization
          });

          // Capture for Confluence export AFTER template processing has loaded all media
          // The template exporter modifies htmlExportData.screenshots in-place, loading videoBase64 and imageData
          processedHtmlExportData = htmlExportData;

          // Convert HTML string to Blob
          fileContent = new Blob([htmlContent], { type: 'text/html;charset=utf-8' });
          contentType = 'text/html';

          await debugLog('[ExportPage Debug] ✅ HTML export with template completed successfully');
          clearInterval(progressInterval);
          setExportProgress(selectedDestination === 'local' ? 100 : 60);
        } catch (error) {
          await debugLog(`[ExportPage Debug] ❌ HTML export failed: ${error}`);
          clearInterval(progressInterval);
          throw error;
        }
      } else {
        await debugLog(`[ExportPage Debug] 📄 Processing ${selectedFormat.toUpperCase()} format export...`);
        // Other formats - use existing export logic to get file content
        const progressInterval = setInterval(() => {
          setExportProgress(prev => Math.min(prev + 15, selectedDestination === 'local' ? 90 : 50));
        }, 300);

        await debugLog('[ExportPage Debug] 🔍 Checking window.electronAPI availability...');
        if (window.electronAPI) {
          await debugLog('[ExportPage Debug] ✅ window.electronAPI is available, proceeding with desktop export...');
          
          // Debug logging for conditional logic
          logger.log(`[ExportPage Debug] 🔍 Conditional check values:`);
          logger.log(`[ExportPage Debug] exportData.isInteractiveScreenshots:`, exportData.isInteractiveScreenshots);
          logger.log(`[ExportPage Debug] exportData.screenshots?.length:`, exportData.screenshots?.length);
          logger.log(`[ExportPage Debug] exportData structure:`, JSON.stringify({
            isInteractiveScreenshots: exportData.isInteractiveScreenshots,
            hasScreenshots: !!exportData.screenshots,
            screenshotsLength: exportData.screenshots?.length || 0,
            screenshotsKeys: exportData.screenshots ? Object.keys(exportData.screenshots[0] || {}) : [],
            name: exportData.name
          }, null, 2));
          
          let contentWithScreenshots;
          
          // Updated conditional to check both isInteractiveScreenshots AND screenshots length
          if (exportData.isInteractiveScreenshots && exportData.screenshots?.length > 0) {
            logger.log(`[ExportPage Debug] ✅ Taking INTERACTIVE SCREENSHOTS export path`);
            // Debug logging for interactive screenshots
            logger.log(`[ExportPage Debug] 📊 exportData.screenshots array length: ${exportData.screenshots?.length || 0}`);
            logger.log(`[ExportPage Debug] 📊 exportData.screenshots structure:`, JSON.stringify(exportData.screenshots, null, 2));
            
            // Handle interactive screenshots export
            const mappedActions = exportData.screenshots.map((item: any, index: number) => {
              logger.log(`[ExportPage Debug] 🔍 Processing item ${index + 1} for actions mapping:`, JSON.stringify(item, null, 2));
              
              // Extract title and description based on item type
              let title: string | undefined;
              let description: string | undefined;
              if (item.type === 'docStep') {
                title = item.docStep?.title || `Step ${index + 1}`;
                description = item.docStep?.description ?? '';
                logger.log(`[ExportPage Debug] 🔍 DocStep mapping - title: "${title}", description: "${description}"`);
              } else {
                // screenshot or combined step: prefer docStep metadata when available, otherwise the item's own fields
                title = item.docStep?.title ?? item.title ?? `Step ${index + 1}`;
                description = item.docStep?.description ?? item.description ?? '';
                logger.log(`[ExportPage Debug] 🔍 Screenshot mapping - title: "${title}", description: "${description}"`);
              }
              
              const mappedAction = {
                id: `step-${index + 1}`,
                type: item.type === 'docStep' ? 'diagram' : 'click',
                timestamp: item.type === 'docStep'
                  ? (item.docStep?.timestamp || 0)
                  : (item.timestamp || 0),
                title: title,
                description: description,
                target: description || title,
                data: {
                  description: description
                }
              };
              
              logger.log(`[ExportPage Debug] 🔍 Final mapped action ${index + 1}:`, {
                id: mappedAction.id,
                title: mappedAction.title,
                description: mappedAction.description,
                hasTitle: !!mappedAction.title,
                hasDescription: mappedAction.description !== undefined,
                titleLength: mappedAction.title?.length || 0,
                descriptionLength: mappedAction.description?.length || 0
              });
              
              return mappedAction;
            });
            
            const mappedScreenshots = await Promise.all(exportData.screenshots.map(async (item: any, index: number) => {
              logger.log(`[ExportPage Debug] 🖼️ Processing screenshot ${index + 1}:`, JSON.stringify({
                type: item.type,
                hasDocStep: !!item.docStep,
                hasDiagramImagePath: !!(item.docStep?.diagramImagePath),
                hasScreenshot: !!item.screenshot,
                diagramImagePathLength: item.docStep?.diagramImagePath?.length || 0
              }, null, 2));
              
              // Handle both screenshot objects and docStep objects (diagrams)
              if (item.type === 'docStep' && item.docStep?.diagramImagePath) {
                logger.log(`[ExportPage Debug] 🎨 DIAGRAM PROCESSING for DOCX:`);
                logger.log(`[ExportPage Debug] 🎨 Original diagramImagePath: "${item.docStep.diagramImagePath}"`);
                logger.log(`[ExportPage Debug] 🎨 Current project name: "${currentProject?.name}"`);
                
                // Check if diagramImagePath is a file path or base64 data
                let imageData: string;
                if (item.docStep.diagramImagePath.startsWith('data:image/')) {
                  logger.log(`[ExportPage Debug] 🎨 Detected as data URL (already formatted)`);
                  imageData = item.docStep.diagramImagePath;
                } else {
                  // Check if it looks like a file path (contains path separators or file extensions)
                  const isFilePath = item.docStep.diagramImagePath.includes('/') || 
                                   item.docStep.diagramImagePath.includes('\\') || 
                                   item.docStep.diagramImagePath.includes('.png') || 
                                   item.docStep.diagramImagePath.includes('.jpg') || 
                                   item.docStep.diagramImagePath.includes('.jpeg');
                  
                  if (isFilePath) {
                    logger.log(`[ExportPage Debug] 🎨 Detected as file path, attempting to read file...`);
                    // It's a file path, need to read the actual file
                    try {
                      const fileName = item.docStep.diagramImagePath.split(/[\/\\]/).pop();
                      logger.log(`[ExportPage Debug] 🎨 Extracted fileName: "${fileName}"`);
                      if (fileName && currentProject?.name) {
                        logger.log(`[ExportPage Debug] 🎨 Calling getProjectFileAsDataUrl("${currentProject.name}", "diagrams", "${fileName}")`);
                        const dataUrl = await getProjectFileAsDataUrl(currentProject.name, 'diagrams', fileName);
                        logger.log(`[ExportPage Debug] 🎨 getProjectFileAsDataUrl result: ${dataUrl ? 'SUCCESS' : 'FAILED'}`);
                        if (dataUrl) {
                          logger.log(`[ExportPage Debug] 🎨 Data URL preview: "${dataUrl.substring(0, 50)}..."`);
                          imageData = dataUrl;
                        } else {
                          logger.error(`[ExportPage Debug] 🎨 ❌ Failed to read file, no valid imageData available`);
                          imageData = ''; // No valid data available
                        }
                      } else {
                        logger.log(`[ExportPage Debug] 🎨 Missing fileName or project name, no valid imageData`);
                        imageData = ''; // No valid data available
                      }
                    } catch (error) {
                      logger.error('[ExportPage Debug] 🎨 ❌ Failed to load diagram file:', error);
                      imageData = ''; // No valid data available
                    }
                  } else {
                    logger.log(`[ExportPage Debug] 🎨 Not detected as file path, checking if it's valid base64 data`);
                    // Only treat as base64 if it looks like valid base64 (no path separators)
                    if (!item.docStep.diagramImagePath.includes('/') && !item.docStep.diagramImagePath.includes('\\')) {
                      logger.log(`[ExportPage Debug] 🎨 Treating as base64 data, formatting as data URL`);
                      imageData = `data:image/png;base64,${item.docStep.diagramImagePath}`;
                    } else {
                      logger.error(`[ExportPage Debug] 🎨 ❌ Invalid path format, cannot process: "${item.docStep.diagramImagePath}"`);
                      imageData = ''; // Invalid format, set to empty
                    }
                  }
                }
                
                logger.log(`[ExportPage Debug] 🎨 Final imageData for diagram: ${imageData ? 'HAS_DATA' : 'NO_DATA'}`);
                if (imageData) {
                  logger.log(`[ExportPage Debug] 🎨 Final imageData preview: "${imageData.substring(0, 50)}..."`);
                }
                
                const diagramResult = {
                  imageData,
                  timestamp: item.docStep.timestamp,
                  description: item.docStep.description,
                  stepId: item.docStep.id,
                  type: 'diagram',
                  mediaType: item.docStep.mediaType,
                  videoClipPath: item.docStep.videoClipPath,
                  videoClipMimeType: item.docStep.videoClipMimeType,
                };
                
                logger.log(`[ExportPage Debug] 🎨 Returning diagram object:`, {
                  hasImageData: !!diagramResult.imageData,
                  description: diagramResult.description,
                  stepId: diagramResult.stepId,
                  type: diagramResult.type
                });
                
                return diagramResult;
              } else if (item.type === 'docStep' && (item.docStep?.mediaType === 'video' || item.docStep?.actionType === 'video') && item.docStep?.videoClipPath) {
                // Video docStep (not a diagram) — flatten for PPTX video embedding
                logger.log(`[ExportPage Debug] 🎬 PPTX Processing video docStep: ${item.docStep.videoClipPath}`);
                return {
                  imageData: item.docStep.imageData || '',
                  timestamp: item.docStep.timestamp,
                  description: item.docStep.description || '',
                  title: item.docStep.title || `Video Step`,
                  stepId: item.docStep.id || `step-${index + 1}`,
                  type: 'screenshot',
                  mediaType: 'video' as const,
                  videoClipPath: item.docStep.videoClipPath,
                  videoClipMimeType: item.docStep.videoClipMimeType,
                };
              } else if (item.screenshot) {
                // Regular screenshot object from unifiedSteps
                logger.log(`[ExportPage Debug] 🔍 Raw item.screenshot object:`, item.screenshot);
                logger.log(`[ExportPage Debug] 🔍 item.screenshot properties:`, JSON.stringify({
                  hasImageData: !!item.screenshot.imageData,
                  hasFilePath: !!item.screenshot.filePath,
                  hasBase64: !!item.screenshot.base64,
                  hasDataUrl: !!item.screenshot.dataUrl,
                  keys: Object.keys(item.screenshot),
                  timestamp: item.screenshot.timestamp,
                  description: item.screenshot.description
                }, null, 2));
                
                // Log actual values (first 50 chars)
                logger.log(`[ExportPage Debug] 🔍 Actual values:`, {
                  imageData: item.screenshot.imageData ? item.screenshot.imageData.substring(0, 50) + '...' : 'null',
                  dataUrl: item.screenshot.dataUrl ? item.screenshot.dataUrl.substring(0, 50) + '...' : 'null',
                  base64: item.screenshot.base64 ? item.screenshot.base64.substring(0, 50) + '...' : 'null',
                  filePath: item.screenshot.filePath ? item.screenshot.filePath.substring(0, 50) + '...' : 'null'
                });
                
                // Map screenshot object to proper export format
                let screenshotImageData = null;
                if (item.screenshot.imageData || item.screenshot.dataUrl || item.screenshot.base64) {
                  screenshotImageData = item.screenshot.imageData || item.screenshot.dataUrl || item.screenshot.base64;
                } else if (item.screenshot.filePath) {
                  // Check if filePath is already a data URL
                  if (item.screenshot.filePath.startsWith('data:image/')) {
                    screenshotImageData = item.screenshot.filePath;
                  } else if (item.screenshot.filePath.includes('/') || item.screenshot.filePath.includes('\\')) {
                    // It's a file path, try to read it
                    try {
                      const pathParts = item.screenshot.filePath.split(/[\/\\]/);
                      const fileName = pathParts.pop() || item.screenshot.filePath;

                      const projectName = currentProject?.name;
                      if (fileName && projectName) {
                        screenshotImageData = await getProjectFileAsDataUrl(projectName, 'step_by_step_screenshots', fileName);
                        logger.log(`[ExportPage Debug] ✅ Successfully read screenshot file: ${item.screenshot.filePath}`);
                      } else {
                        logger.error(`[ExportPage Debug] ❌ Missing fileName or projectName for screenshot: ${item.screenshot.filePath}`);
                        screenshotImageData = null;
                      }
                    } catch (error) {
                      logger.error(`[ExportPage Debug] ❌ Failed to read screenshot file: ${item.screenshot.filePath}`, error);
                      screenshotImageData = null;
                    }
                  } else {
                    // Treat as base64 only if it doesn't contain path separators
                    const screenshotMime = item.screenshot.filePath.startsWith('/9j/') ? 'image/jpeg' : 'image/png';
                    screenshotImageData = `data:${screenshotMime};base64,${item.screenshot.filePath}`;
                  }
                }
                
                const screenshotId = item.screenshot.stepId || item.screenshot.id;
                const projStep = currentProject?.metadata?.documentationSteps?.find(s => s.id === screenshotId);
                const mappedObject = {
                  imageData: screenshotImageData,
                  timestamp: item.screenshot.timestamp,
                  description: item.screenshot.description,
                  stepId: screenshotId,
                  type: 'screenshot',
                  mediaType: projStep?.mediaType || item.screenshot.mediaType,
                  videoClipPath: projStep?.videoClipPath || item.screenshot.videoClipPath,
                  videoClipMimeType: projStep?.videoClipMimeType || item.screenshot.videoClipMimeType,
                };
                
                logger.log(`[ExportPage Debug] 🔍 Final mapped object:`, {
                  hasImageData: !!mappedObject.imageData,
                  imageDataPreview: mappedObject.imageData ? mappedObject.imageData.substring(0, 50) + '...' : 'null',
                  timestamp: mappedObject.timestamp,
                  description: mappedObject.description,
                  stepId: mappedObject.stepId,
                  type: mappedObject.type
                });
                
                return mappedObject;
              } else {
                // Fallback for direct screenshot objects
                return item;
              }
            }));
            
            contentWithScreenshots = {
              name: exportData.name,
              projectName: currentProject?.name || exportData.projectName,
              source: locationState?.projectSource || 'Step-by-Step Screenshots',
              actions: mappedActions,
              screenshots: mappedScreenshots
            };
            
            logger.log(`[ExportPage Debug] 📋 contentWithScreenshots.actions length: ${contentWithScreenshots.actions?.length || 0}`);
            logger.log(`[ExportPage Debug] 📋 contentWithScreenshots.screenshots length: ${contentWithScreenshots.screenshots?.length || 0}`);
            logger.log(`[ExportPage Debug] 📋 Final contentWithScreenshots:`, JSON.stringify({
              name: contentWithScreenshots.name,
              source: contentWithScreenshots.source,
              actionsCount: contentWithScreenshots.actions?.length || 0,
              screenshotsCount: contentWithScreenshots.screenshots?.length || 0,
              hasScreenshots: contentWithScreenshots.screenshots?.length > 0,
              screenshotTypes: contentWithScreenshots.screenshots?.map(s => s.type || 'unknown')
            }, null, 2));
          } else {
            logger.log(`[ExportPage Debug] ❌ Taking REGULAR RECORDING export path`);
            logger.log(`[ExportPage Debug] Reason: isInteractiveScreenshots=${exportData.isInteractiveScreenshots}, screenshots.length=${exportData.screenshots?.length || 0}`);
            
            // Handle regular recording export
            const baseScreenshots = currentProject?.metadata?.screenshots || [];

            // Use currentRecording steps, or fall back to project metadata documentationSteps
            // (when navigating from ProjectPageModal, currentRecording is null)
            const recordingSteps = currentRecording?.documentationSteps || currentProject?.metadata?.documentationSteps || [];
            const diagramStepsFromProject = currentProject?.metadata?.documentationSteps?.filter(step => step.type === 'diagram' || step.actionType === 'diagram') || [];

            // Merge, avoiding duplicates
            const mergedSteps = [...recordingSteps];
            for (const diagramStep of diagramStepsFromProject) {
              if (!mergedSteps.find(step => step.id === diagramStep.id)) {
                await debugLog(`[ExportPage Debug] 📝 Adding diagram step from project metadata: ${diagramStep.id}`);
                mergedSteps.push(diagramStep);
              }
            }

            // Fallback: if no documentationSteps but project has plain screenshots
            if (mergedSteps.length === 0 && baseScreenshots.length > 0) {
              await debugLog(`[ExportPage Debug] 📊 No documentationSteps found, using ${baseScreenshots.length} plain screenshots`);
              baseScreenshots.forEach((s: any, index: number) => {
                mergedSteps.push({
                  id: s.id || `screenshot-${index + 1}`,
                  timestamp: s.timestamp || 0,
                  title: s.title || `Step ${index + 1}`,
                  description: s.description || '',
                  screenshot: s.filePath || s.imageData || '',
                  actionType: 'click' as const,
                  isGenerated: false,
                  mediaType: s.mediaType,
                  videoClipPath: s.videoClipPath,
                  videoClipMimeType: s.videoClipMimeType,
                });
              });
            }

            // Recover file paths for persisted steps where screenshot was stripped
            for (const step of mergedSteps) {
              if (!step.screenshot && step.actionType !== 'diagram' && step.actionType !== 'video') {
                const matchingScreenshot = baseScreenshots.find((s: any) => s.id === step.id);
                if (matchingScreenshot?.filePath) {
                  step.screenshot = matchingScreenshot.filePath;
                  await debugLog(`[ExportPage Debug] 📸 Recovered filePath for step ${step.id} from metadata.screenshots`);
                }
              }
            }

            // Sort by timestamp
            mergedSteps.sort((a, b) => (a.timestamp || 0) - (b.timestamp || 0));

            await debugLog(`[ExportPage Debug] 📊 Total documentationSteps to process: ${mergedSteps.length} (${recordingSteps.length} from recording/project + ${diagramStepsFromProject.length} diagrams from project)`);

            // Process ALL documentationSteps (both screenshots and diagrams) like interactive screenshots path
            const allStepScreenshots = await Promise.all(
              mergedSteps.map(async step => {
                await debugLog(`[ExportPage Debug] 📸 Processing step: ${step.type} - ${step.title || step.description}`);
                await debugLog(`[ExportPage Debug] 🔍 Step properties - type: ${step.type}, actionType: ${step.actionType}, diagramImagePath: ${step.diagramImagePath}, screenshot: ${step.screenshot}`);
                
                // Check for diagram first (diagrams have higher priority)
                if ((step.type === 'diagram' || step.actionType === 'diagram') && step.diagramImagePath) {
                  // Handle diagram steps
                  let imageData = '';
                  const diagramImagePath = step.diagramImagePath;

                  if (diagramImagePath.startsWith('data:image/')) {
                    // Already a data URL
                    imageData = diagramImagePath;
                    await debugLog(`[ExportPage Debug] 🎨 Using existing data URL for diagram`);
                  } else {
                    // Check if it's a file path
                    const isFilePath = diagramImagePath.includes('/') ||
                                     diagramImagePath.includes('\\') ||
                                     diagramImagePath.includes('.png') ||
                                     diagramImagePath.includes('.jpg') ||
                                     diagramImagePath.includes('.jpeg');

                    if (isFilePath && currentProject?.name) {
                      // It's a file path, read the actual file
                      try {
                        const fileName = diagramImagePath.split(/[\/\\]/).pop();
                        await debugLog(`[ExportPage Debug] 🎨 Reading diagram file: "${fileName}"`);
                        if (fileName) {
                          const dataUrl = await getProjectFileAsDataUrl(currentProject.name, 'diagrams', fileName);
                          if (dataUrl) {
                            imageData = dataUrl;
                            await debugLog(`[ExportPage Debug] 🎨 Successfully loaded diagram file`);
                          } else {
                            await debugLog(`[ExportPage Debug] 🎨 ❌ Failed to load diagram file`);
                          }
                        }
                      } catch (error) {
                        await debugLog(`[ExportPage Debug] 🎨 ❌ Error loading diagram: ${error}`);
                      }
                    } else if (!isFilePath && !diagramImagePath.includes('/') && !diagramImagePath.includes('\\')) {
                      // Treat as base64 data
                      imageData = `data:image/png;base64,${diagramImagePath}`;
                      await debugLog(`[ExportPage Debug] 🎨 Treating as base64 data`);
                    } else {
                      await debugLog(`[ExportPage Debug] 🎨 ❌ Invalid diagram path format: "${diagramImagePath}"`);
                    }
                  }

                  await debugLog(`[ExportPage Debug] 🎨 Final diagram imageData: ${imageData ? 'HAS_DATA' : 'NO_DATA'}`);

                  return {
                    imageData,
                    timestamp: step.timestamp,
                    title: step.title || '',
                    description: step.description || 'Diagram',
                    stepId: step.id,
                    type: 'diagram'
                  };
                }
                // Handle video steps — must be checked BEFORE screenshot because video steps also have step.screenshot
                else if ((step.mediaType === 'video' || step.actionType === 'video') && step.videoClipPath && currentProject?.name) {
                  await debugLog(`[ExportPage Debug] 🎬 Processing video step for PPTX/PDF - generating thumbnail for: ${step.videoClipPath}`);
                  try {
                    const thumbnail = await window.electronAPI.generateVideoThumbnail(
                      currentProject.name, step.videoClipPath
                    );
                    const videoStepTitle = step.title || `Video Step`;
                    return {
                      imageData: thumbnail,
                      timestamp: step.timestamp,
                      description: step.description || '',
                      title: `▶ ${videoStepTitle}`,
                      stepId: step.id,
                      type: 'screenshot',
                      mediaType: 'video' as const,
                      videoClipPath: step.videoClipPath,
                      videoClipMimeType: step.videoClipMimeType,
                    };
                  } catch (err) {
                    await debugLog(`[ExportPage Debug] 🎬 ❌ Failed to generate video thumbnail: ${err}`);
                    return null;
                  }
                }
                // Handle screenshot steps (check for screenshot property but NOT if it's already a diagram)
                else if (step.screenshot && step.type !== 'diagram' && step.actionType !== 'diagram') {
                  // Handle screenshot steps (video recording steps have type: undefined but screenshot property)
                  let imageData = '';
                  const screenshotPath = step.screenshot;
                  
                  if (screenshotPath.startsWith('data:image/')) {
                    // Already a data URL
                    imageData = screenshotPath;
                    await debugLog(`[ExportPage Debug] 📸 Using existing data URL for screenshot`);
                  } else {
                    // Check if it's a file path
                    const isFilePath = screenshotPath.includes('/') || 
                                     screenshotPath.includes('\\') || 
                                     screenshotPath.includes('.png') || 
                                     screenshotPath.includes('.jpg') || 
                                     screenshotPath.includes('.jpeg');
                    
                    if (isFilePath && currentProject?.name) {
                      // It's a file path, read the actual file
                      try {
                        const pathParts = screenshotPath.split(/[\/\\]/);
                        const fileName = pathParts.pop() || screenshotPath;

                        await debugLog(`[ExportPage Debug] 📸 Reading screenshot file: "${fileName}"`);
                        if (fileName) {
                          const dataUrl = await getProjectFileAsDataUrl(currentProject.name, 'step_by_step_screenshots', fileName);
                          if (dataUrl) {
                            imageData = dataUrl;
                            await debugLog(`[ExportPage Debug] 📸 Successfully loaded screenshot file`);
                          } else {
                            await debugLog(`[ExportPage Debug] 📸 ❌ Failed to load screenshot file`);
                          }
                        }
                      } catch (error) {
                        await debugLog(`[ExportPage Debug] 📸 ❌ Error loading screenshot: ${error}`);
                      }
                    } else if (!isFilePath && !screenshotPath.includes('/') && !screenshotPath.includes('\\')) {
                      // Treat as base64 data — detect JPEG vs PNG from magic bytes
                      const screenshotMime = screenshotPath.startsWith('/9j/') ? 'image/jpeg' : 'image/png';
                      imageData = `data:${screenshotMime};base64,${screenshotPath}`;
                      await debugLog(`[ExportPage Debug] 📸 Treating as base64 data`);
                    } else {
                      await debugLog(`[ExportPage Debug] 📸 ❌ Invalid screenshot path format: "${screenshotPath}"`);
                    }
                  }
                  
                  await debugLog(`[ExportPage Debug] 📸 Final screenshot imageData: ${imageData ? 'HAS_DATA' : 'NO_DATA'}`);
                  
                  return {
                    imageData,
                    timestamp: step.timestamp,
                    title: step.title || '',
                    description: step.description || 'Screenshot',
                    stepId: step.id,
                    type: 'screenshot'
                  };
                } else {
                  await debugLog(`[ExportPage Debug] ⚠️ Skipping step with type: ${step.type} (no valid image path)`);
                  return null;
                }
              }) || []
            );

            await debugLog(`[ExportPage Debug] 🔍 allStepScreenshots.length BEFORE filter: ${allStepScreenshots.length}`);

            // Filter out null values
            const validStepScreenshots = allStepScreenshots.filter(screenshot => screenshot !== null);

            await debugLog(`[ExportPage Debug] 🔍 validStepScreenshots.length AFTER filter: ${validStepScreenshots.length}`);
            await debugLog(`[ExportPage Debug] 📊 Processed ${validStepScreenshots.length} valid screenshots for PDF/PPTX`);
            await debugLog(`[ExportPage Debug] 📊 validStepScreenshots sample: ${JSON.stringify(validStepScreenshots[0], null, 2)}`);

            // Build a clean, IPC-serializable object for PDF/PPTX export.
            // Do NOT spread ...currentRecording because documentationSteps may contain
            // React Flow internal node objects (with measured/internals properties)
            // that cannot be cloned for Electron IPC transfer.
            contentWithScreenshots = {
              id: currentRecording?.id,
              projectId: currentRecording?.projectId,
              name: currentProject?.metadata?.projectTitle || currentRecording?.name || currentProject?.name || 'Documentation',
              projectName: currentProject?.name || exportData.projectName,
              filePath: currentRecording?.filePath,
              duration: currentRecording?.duration,
              resolution: currentRecording?.resolution,
              fps: currentRecording?.fps,
              createdAt: currentRecording?.createdAt,
              audioEnabled: currentRecording?.audioEnabled,
              keyboardTracking: currentRecording?.keyboardTracking,
              mouseTracking: currentRecording?.mouseTracking,
              source: currentProject?.metadata?.projectSource || 'Application',
              projectPath: currentRecording?.projectPath,
              metadata: currentRecording?.metadata ? {
                projectTitle: currentRecording.metadata.projectTitle,
                projectSource: currentRecording.metadata.projectSource
              } : undefined,
              bookmarks: currentRecording?.bookmarks,
              // Convert documentationSteps to actions format for PDF generation (use mergedSteps to include diagrams)
              actions: mergedSteps?.map(step => ({
                id: step.id,
                type: step.actionType || 'click',
                timestamp: step.timestamp,
                title: step.title,
                description: step.description,
                target: step.description,
                data: {
                  description: step.description
                }
              })) || currentRecording?.actions || [],
              // For video recordings, use only the processed steps (don't combine with baseScreenshots to avoid duplicates)
              screenshots: validStepScreenshots
            };

            await debugLog(`[ExportPage Debug] 📊 contentWithScreenshots.screenshots.length: ${contentWithScreenshots.screenshots?.length || 0}`);
          }

          // Apply translation if requested (for PDF/PPTX/etc)
          if (exportOptions.translateTo !== 'none' && contentWithScreenshots) {
            // Check if translation module is installed
            if (window.electronAPI?.translationModuleStatus) {
              const moduleStatus = await window.electronAPI.translationModuleStatus();
              if (!moduleStatus.installed) {
                await debugLog(`[ExportPage Debug] Translation module not installed, prompting download`);
                setPendingTranslationExport(true);
                setShowTranslationModuleDownload(true);
                setIsExporting(false);
                setExportProgress(0);
                return;
              }
            }

            await debugLog(`[ExportPage Debug] 🌐 Translating PDF/PPTX content to ${exportOptions.translateTo}...`);
            try {
              const translatedData = await TranslationService.translateExportContent(
                {
                  projectTitle: contentWithScreenshots.name,
                  projectSource: contentWithScreenshots.source,
                  steps: [
                    ...(contentWithScreenshots.actions || []),
                    ...(contentWithScreenshots.screenshots || [])
                  ]
                },
                exportOptions.translateTo as 'EN' | 'DE'
              );

              // Update contentWithScreenshots with translated values
              contentWithScreenshots.name = translatedData.projectTitle || contentWithScreenshots.name;
              if (translatedData.projectSource) {
                contentWithScreenshots.source = translatedData.projectSource;
              }

              // Update actions with translated content
              if (contentWithScreenshots.actions && translatedData.steps) {
                contentWithScreenshots.actions = contentWithScreenshots.actions.map((action, index) => ({
                  ...action,
                  title: translatedData.steps[index]?.title || action.title,
                  description: translatedData.steps[index]?.description || action.description,
                  target: translatedData.steps[index]?.description || action.target,
                  data: {
                    ...action.data,
                    description: translatedData.steps[index]?.description || action.data?.description
                  }
                }));
              }

              // Update screenshots with translated content
              if (contentWithScreenshots.screenshots && translatedData.steps) {
                const actionsCount = contentWithScreenshots.actions?.length || 0;
                contentWithScreenshots.screenshots = contentWithScreenshots.screenshots.map((screenshot, index) => ({
                  ...screenshot,
                  title: translatedData.steps[actionsCount + index]?.title || screenshot.title,
                  description: translatedData.steps[actionsCount + index]?.description || screenshot.description
                }));
              }

              await debugLog(`[ExportPage Debug] ✅ PDF/PPTX Translation completed successfully`);
            } catch (error) {
              await debugLog(`[ExportPage Debug] ❌ PDF/PPTX Translation failed: ${error}`);
              toast.error(t('toast.translationFailed'));
            }
          }

          // Pre-generate video thumbnails for formats that need them (PPTX, PDF)
          if ((selectedFormat === 'pptx' || selectedFormat === 'pdf') && currentProject?.name) {
            const steps = contentWithScreenshots.screenshots || [];
            for (const step of steps) {
              if ((step as any).mediaType === 'video' && (step as any).videoClipPath && !(step as any).imageData) {
                try {
                  await debugLog(`[ExportPage Debug] 🎬 Pre-generating video thumbnail for ${selectedFormat.toUpperCase()}`);
                  (step as any).imageData = await window.electronAPI.generateVideoThumbnail(
                    currentProject.name, (step as any).videoClipPath
                  );
                  // Mark title with video indicator
                  if ((step as any).title && !(step as any).title.startsWith('▶')) {
                    (step as any).title = `▶ ${(step as any).title}`;
                  }
                } catch (err) {
                  await debugLog(`[ExportPage Debug] 🎬 ❌ Failed to pre-generate video thumbnail: ${err}`);
                }
              }
            }
          }

          // Check if this is for local destination or non-local (SharePoint/Confluence)
          if (selectedDestination === 'local') {
            await debugLog('[ExportPage Debug] 🚀 Local destination: Calling window.electronAPI.exportFile with save dialog...');
            await debugLog(`[ExportPage Debug] Export parameters: ${JSON.stringify({
              format: selectedFormat,
              outputPath: fileName,
              theme: exportOptions.theme === 'auto' ? 'light' : exportOptions.theme,
              template: exportOptions.template === 'presentation' ? 'corporate' : exportOptions.template === 'detailed' ? 'technical' : 'minimal'
            })}`);
            
            // Create template config for PDF/PPTX if a template is selected
            const pdfTemplateConfig = selectedTemplate && selectedFormat === 'pdf'
              ? createPdfTemplateConfig(selectedTemplate, templateCustomization)
              : null;

            const result = await window.electronAPI.exportFile({
              format: selectedFormat as 'pdf' | 'markdown' | 'pptx' | 'video',
              content: contentWithScreenshots,
              outputPath: fileName,
              options: {
                theme: exportOptions.theme === 'auto' ? 'light' : exportOptions.theme,
                template: exportOptions.template === 'presentation' ? 'corporate' : exportOptions.template === 'detailed' ? 'technical' : 'minimal',
                customization: {
                  fontFamily: pdfTemplateConfig?.bodyFont || 'Inter',
                  primaryColor: pdfTemplateConfig?.colors?.primary ? `#${pdfTemplateConfig.colors.primary}` : '#2563eb',
                  logo: exportOptions.companyLogo
                },
                // Pass full template configuration for PDF generation
                templateConfig: pdfTemplateConfig,
                // Pass translation language for template strings (Step, Approvals, etc.)
                translateTo: exportOptions.translateTo
              }
            });
            
            await debugLog(`[ExportPage Debug] 📋 Export result received: ${JSON.stringify({ success: result.success, canceled: result.canceled, hasFileData: !!result.fileData, error: result.error })}`);
            clearInterval(progressInterval);
            
            if (result.canceled) {
              await debugLog('[ExportPage Debug] ⚠️ Export was canceled by user');
              toast.info(t('toast.exportCanceled'));
              return;
            }
            
            if (!result.success) {
              await debugLog(`[ExportPage Debug] ❌ Export failed: ${result.error}`);
              throw new Error(result.error || 'Export failed');
            }
            
            await debugLog('[ExportPage Debug] ✅ Export completed successfully, processing file data...');

            // Convert base64 fileData back to ArrayBuffer
            if (result.fileData) {
              await debugLog('[ExportPage Debug] 🔄 Converting base64 file data to ArrayBuffer...');
              const binaryString = atob(result.fileData);
              const bytes = new Uint8Array(binaryString.length);
              for (let i = 0; i < binaryString.length; i++) {
                bytes[i] = binaryString.charCodeAt(i);
              }
              fileContent = bytes.buffer;
              await debugLog(`[ExportPage Debug] ✅ File data converted successfully, size: ${bytes.buffer.byteLength} bytes`);
            } else {
              await debugLog('[ExportPage Debug] ❌ No file data returned from export');
              throw new Error('No file data returned from export');
            }
          } else {
            // Non-local destination (SharePoint/Confluence) - generate content without save dialog
            await debugLog('[ExportPage Debug] 🚀 Non-local destination: Calling window.electronAPI.generateFileContent without save dialog...');
            await debugLog(`[ExportPage Debug] Generate content parameters: ${JSON.stringify({
              format: selectedFormat,
              theme: exportOptions.theme === 'auto' ? 'light' : exportOptions.theme,
              template: exportOptions.template === 'presentation' ? 'corporate' : exportOptions.template === 'detailed' ? 'technical' : 'minimal'
            })}`);

            // Create template config for PDF if a template is selected
            const pdfTemplateConfigNonLocal = selectedTemplate && selectedFormat === 'pdf'
              ? createPdfTemplateConfig(selectedTemplate, templateCustomization)
              : null;

            const result = await window.electronAPI.generateFileContent({
              format: selectedFormat,
              content: contentWithScreenshots,
              options: {
                theme: exportOptions.theme === 'auto' ? 'light' : exportOptions.theme,
                template: exportOptions.template === 'presentation' ? 'corporate' : exportOptions.template === 'detailed' ? 'technical' : 'minimal',
                customization: {
                  fontFamily: pdfTemplateConfigNonLocal?.bodyFont || 'Inter',
                  primaryColor: pdfTemplateConfigNonLocal?.colors?.primary ? `#${pdfTemplateConfigNonLocal.colors.primary}` : '#2563eb',
                  logo: exportOptions.companyLogo
                },
                // Pass full template configuration for PDF generation
                templateConfig: pdfTemplateConfigNonLocal,
                // Pass translation language for template strings (Step, Approvals, etc.)
                translateTo: exportOptions.translateTo
              }
            });
            
            await debugLog(`[ExportPage Debug] 📋 Generate content result received: ${JSON.stringify({ success: result.success, hasFileData: !!result.fileData, size: result.size, error: result.error })}`);
            clearInterval(progressInterval);
            
            if (!result.success) {
              await debugLog(`[ExportPage Debug] ❌ Generate content failed: ${result.error}`);
              throw new Error(result.error || 'File content generation failed');
            }
            
            await debugLog('[ExportPage Debug] ✅ Content generation completed successfully, processing file data...');

            // Convert base64 fileData back to ArrayBuffer
            if (result.fileData) {
              await debugLog('[ExportPage Debug] 🔄 Converting base64 file data to ArrayBuffer...');
              const binaryString = atob(result.fileData);
              const bytes = new Uint8Array(binaryString.length);
              for (let i = 0; i < binaryString.length; i++) {
                bytes[i] = binaryString.charCodeAt(i);
              }
              fileContent = bytes.buffer;
              await debugLog(`[ExportPage Debug] ✅ File data converted successfully, size: ${bytes.buffer.byteLength} bytes`);
            } else {
              await debugLog('[ExportPage Debug] ❌ No file data returned from content generation');
              throw new Error('No file data returned from content generation');
            }
          }
          
          contentType = getContentType(selectedFormat);
          await debugLog(`[ExportPage Debug] 📋 Content type set to: ${contentType}`);
          setExportProgress(selectedDestination === 'local' ? 100 : 60);
          await debugLog(`[ExportPage Debug] 📊 Progress updated to: ${selectedDestination === 'local' ? 100 : 60}%`);
        } else {
          await debugLog('[ExportPage Debug] ❌ window.electronAPI not available (web version)');
          clearInterval(progressInterval);
          // For web version with local destination, show error
          if (selectedDestination === 'local') {
            await debugLog('[ExportPage Debug] ❌ Web version cannot export to local destination');
            throw new Error('Export not supported in web version for local destinations');
          }
          // For non-local destinations (SharePoint, Confluence), we can't generate the file content
          // in web version for non-DOCX formats, so show appropriate error
          await debugLog(`[ExportPage Debug] ❌ Web version cannot export ${selectedFormat.toUpperCase()} to ${selectedDestination}`);
          throw new Error(`${selectedFormat.toUpperCase()} export to ${selectedDestination} is only supported in desktop version. Please use DOCX format or run the desktop application.`);
        }
      }
      
      await debugLog('[ExportPage Debug] ✅ File content generation completed successfully');

      // Handle different destinations
      await debugLog('[ExportPage Debug] 🔀 Checking destination logic...');
      await debugLog('[ExportPage Debug] About to check if selectedDestination === "local"');
      if (selectedDestination === 'local') {
        await debugLog('[ExportPage Debug] ✅ Entering LOCAL export path');
        // Local file export
        if (window.electronAPI) {
          // Save locally and to project folder
          if (selectedFormat === 'docx') {
            // Create download link for user
            const url = URL.createObjectURL(fileContent as Blob);
            const a = document.createElement('a');
            a.href = url;
            a.download = fileName;
            document.body.appendChild(a);
            a.click();
            document.body.removeChild(a);
            URL.revokeObjectURL(url);

            // Save copy to project exports folder in background
            let savedFilePath: string | null = null;
            if (exportData.projectName) {
              try {
                const arrayBuffer = await (fileContent as Blob).arrayBuffer();
                const result = await window.electronAPI.saveProjectExport(
                  exportData.projectName,
                  fileName,
                  arrayBuffer,
                  'buffer'
                );
                savedFilePath = result?.filePath || null;
              } catch (error) {
                logger.error('Failed to save export to project folder:', error);
              }
            }

            setExportedFiles(prev => [...prev, { name: fileName, filePath: savedFilePath }]);
            setLastExportResult({ name: fileName, filePath: savedFilePath });
            toast.success(t('toast.exportedDocx'));
          } else if (selectedFormat === 'html' && selectedTemplate && fileContent instanceof Blob) {
            // HTML with template - download as file
            const url = URL.createObjectURL(fileContent);
            const a = document.createElement('a');
            a.href = url;
            a.download = fileName;
            document.body.appendChild(a);
            a.click();
            document.body.removeChild(a);
            URL.revokeObjectURL(url);

            // Save copy to project exports folder in background
            let savedHtmlFilePath: string | null = null;
            if (exportData.projectName) {
              try {
                const arrayBuffer = await fileContent.arrayBuffer();
                const result = await window.electronAPI.saveProjectExport(
                  exportData.projectName,
                  fileName,
                  arrayBuffer,
                  'buffer'
                );
                savedHtmlFilePath = result?.filePath || null;
              } catch (error) {
                logger.error('Failed to save HTML export to project folder:', error);
              }
            }

            setExportedFiles(prev => [...prev, { name: fileName, filePath: savedHtmlFilePath }]);
            setLastExportResult({ name: fileName, filePath: savedHtmlFilePath });
            toast.success(t('toast.exportedHtml', { template: selectedTemplate.name }));
          } else {
            // Other formats - save to project folder
            let savedOtherFilePath: string | null = null;
            if (exportData.projectName && fileContent) {
              try {
                // Convert to ArrayBuffer if it's not already
                let bufferData: ArrayBuffer | Uint8Array;
                if (fileContent instanceof ArrayBuffer) {
                  bufferData = fileContent;
                } else if (fileContent instanceof Blob) {
                  bufferData = await fileContent.arrayBuffer();
                } else {
                  // Assume it's already a Uint8Array or similar
                  bufferData = fileContent as Uint8Array;
                }
                const result = await window.electronAPI.saveProjectExport(
                  exportData.projectName,
                  fileName,
                  bufferData,
                  'buffer'
                );
                savedOtherFilePath = result?.filePath || null;
              } catch (error) {
                logger.error('Failed to save export to project folder:', error);
              }
            }

            setExportedFiles(prev => [...prev, { name: fileName, filePath: savedOtherFilePath }]);
            setLastExportResult({ name: fileName, filePath: savedOtherFilePath });
            toast.success(t('toast.exportedFile', { filename: fileName }));
          }
        } else {
          // Web version - trigger download
          const url = URL.createObjectURL(fileContent as Blob);
          const a = document.createElement('a');
          a.href = url;
          a.download = fileName;
          document.body.appendChild(a);
          a.click();
          document.body.removeChild(a);
          URL.revokeObjectURL(url);

          setExportedFiles(prev => [...prev, { name: fileName, filePath: null }]);
          setLastExportResult({ name: fileName, filePath: null });
          toast.success(t('toast.exportedFile', { filename: fileName }));
        }
        
        // Set progress to 100% for local export and return
        setExportProgress(100);
        exportSucceeded = true;
        return;
      }
      
      await debugLog('[ExportPage Debug] 🎉 Export process completed successfully!');
      setExportProgress(100);
      exportSucceeded = true;
    } catch (error) {
      await debugLog(`[ExportPage Debug] ❌ Export process failed with error: ${error}`);
      await debugLog(`[ExportPage Debug] Error details: ${error instanceof Error ? error.stack : 'Unknown error'}`);
      logger.error('Export failed:', error);
      toast.error(error instanceof Error ? error.message : t('toast.exportFailed'));
    } finally {
      await debugLog('[ExportPage Debug] 🔄 Cleaning up export state...');
      // Increment export count after successful export (non-blocking)
      if (exportSucceeded) {
        try {
          useAppStore.getState().incrementExportCount();
          // Mark project as exported
          const cp = useAppStore.getState().currentProject;
          if (cp) {
            useAppStore.getState().updateProject(cp.id, {
              metadata: { ...cp.metadata, lastExportedAt: new Date().toISOString() }
            });
          }
        } catch { /* non-critical */ }
      }
      setIsExporting(false);
      setExportProgress(0);
      await debugLog('[ExportPage Debug] ✅ Export cleanup completed');
    }
  };

  const getContentType = (format: string): string => {
    switch (format.toLowerCase()) {
      // Document formats
      case 'pdf':
        return 'application/pdf';
      case 'docx':
        return 'application/vnd.openxmlformats-officedocument.wordprocessingml.document';
      case 'pptx':
        return 'application/vnd.openxmlformats-officedocument.presentationml.presentation';
      case 'md':
      case 'markdown':
        return 'text/markdown';
      case 'html':
      case 'htm':
        return 'text/html';
      case 'txt':
        return 'text/plain';
      case 'rtf':
        return 'application/rtf';
      
      // Video formats
      case 'webm':
        return 'video/webm';
      case 'mp4':
        return 'video/mp4';
      case 'avi':
        return 'video/x-msvideo';
      case 'mov':
        return 'video/quicktime';
      case 'wmv':
        return 'video/x-ms-wmv';
      case 'flv':
        return 'video/x-flv';
      case 'mkv':
        return 'video/x-matroska';
      
      // Image formats
      case 'jpg':
      case 'jpeg':
        return 'image/jpeg';
      case 'png':
        return 'image/png';
      case 'gif':
        return 'image/gif';
      case 'bmp':
        return 'image/bmp';
      case 'webp':
        return 'image/webp';
      case 'svg':
        return 'image/svg+xml';
      case 'tiff':
      case 'tif':
        return 'image/tiff';
      case 'ico':
        return 'image/x-icon';
      
      // Audio formats
      case 'mp3':
        return 'audio/mpeg';
      case 'wav':
        return 'audio/wav';
      case 'ogg':
        return 'audio/ogg';
      case 'aac':
        return 'audio/aac';
      case 'flac':
        return 'audio/flac';
      
      // Archive formats
      case 'zip':
        return 'application/zip';
      case 'rar':
        return 'application/vnd.rar';
      case '7z':
        return 'application/x-7z-compressed';
      case 'tar':
        return 'application/x-tar';
      case 'gz':
        return 'application/gzip';
      
      // Other common formats
      case 'json':
        return 'application/json';
      case 'xml':
        return 'application/xml';
      case 'csv':
        return 'text/csv';
      case 'xlsx':
        return 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet';
      case 'xls':
        return 'application/vnd.ms-excel';
      
      default:
        return 'application/octet-stream';
    }
  };

  const toggleOption = (key: keyof ExportOptions) => {
    setExportOptions(prev => ({
      ...prev,
      [key]: !prev[key]
    }));
  };

  const updateOption = (key: keyof ExportOptions, value: any) => {
    setExportOptions(prev => ({
      ...prev,
      [key]: value
    }));
  };

  // Check if we have either a recording or interactive screenshots data
  const hasExportData = currentRecording ||
                        (locationState?.screenshots && locationState.screenshots.length > 0) ||
                        (currentProject?.recordings && currentProject.recordings.length > 0) ||
                        (currentProject?.metadata?.screenshots && currentProject.metadata.screenshots.length > 0);
  
  if (!hasExportData) {
    return (
      <div className="p-6 max-w-[1600px] mx-auto">
        <div className="text-center py-12">
          <Download className="w-16 h-16 text-gray-400 mx-auto mb-4" />
          <h2 className="text-xl font-semibold text-gray-900 dark:text-white mb-2">
            {t('empty.title')}
          </h2>
          <p className="text-gray-600 dark:text-gray-400 mb-6">
            {t('empty.subtitle')}
          </p>
          <button
            onClick={() => navigate('/dashboard')}
            className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors"
          >
            {t('empty.goToDashboard')}
          </button>
        </div>
      </div>
    );
  }

  // Define exportData at component level so it can be used throughout
  logger.log('DEBUG - currentProject?.name:', currentProject?.name);
  logger.log('DEBUG - locationState?.currentProject?.name:', locationState?.currentProject?.name);
  
  const exportData = {
    name: currentProject?.metadata?.projectTitle || locationState?.projectTitle || currentRecording?.name || 'Step-by-Step Screenshots',
    projectName: currentProject?.name || locationState?.currentProject?.name || 'Project',
    screenshots: locationState?.exportType === 'interactive-screenshots' && locationState?.unifiedSteps
      ? locationState.unifiedSteps
      : locationState?.screenshots || [],
    isInteractiveScreenshots: locationState?.exportType === 'interactive-screenshots',
    documentationSteps: currentRecording?.documentationSteps,
    source: currentProject?.metadata?.projectSource || currentRecording?.metadata?.projectSource || ''
  };
  
  logger.log('DEBUG - exportData.projectName:', exportData.projectName);

  // Detect if the project contains video steps
  const hasVideoSteps = (currentProject?.metadata?.documentationSteps || []).some(
    (s: any) => s.mediaType === 'video' || s.actionType === 'video'
  );


  // Compute preview steps from real project data
  const previewSteps = useMemo(() => {
    const steps: Array<{ title: string; description: string; hasImage: boolean; imageData?: string; filePath?: string; type?: string; diagramImagePath?: string; mediaType?: string; videoClipPath?: string; id?: string }> = [];

    // Interactive screenshots path
    if (exportData.isInteractiveScreenshots && exportData.screenshots?.length > 0) {
      exportData.screenshots.forEach((item: any, index: number) => {
        if (item.type === 'docStep' && item.docStep) {
          steps.push({
            title: item.docStep.title || `Step ${index + 1}`,
            description: item.docStep.description || '',
            hasImage: !!item.docStep.diagramImagePath,
            imageData: item.docStep.diagramImagePath,
            type: item.docStep.type || 'diagram',
            diagramImagePath: item.docStep.diagramImagePath,
            mediaType: item.docStep.mediaType,
            videoClipPath: item.docStep.videoClipPath,
            id: item.docStep.id
          });
        } else if (item.screenshot) {
          const screenshotId = item.screenshot.stepId || item.screenshot.id;
          const projectStep = currentProject?.metadata?.documentationSteps?.find((s: any) => s.id === screenshotId);
          steps.push({
            title: item.screenshot.title || projectStep?.title || `Step ${index + 1}`,
            description: item.screenshot.description || projectStep?.description || '',
            hasImage: !!(item.screenshot.imageData || item.screenshot.filePath),
            imageData: item.screenshot.imageData,
            filePath: item.screenshot.filePath || (item.screenshot as any).filename,
            mediaType: projectStep?.mediaType,
            videoClipPath: projectStep?.videoClipPath,
            id: screenshotId
          });
        }
      });
    }
    // Recording with documentation steps
    else if (currentProject?.metadata?.documentationSteps?.length > 0) {
      const screenshotsArray = currentProject?.metadata?.screenshots || [];
      currentProject.metadata.documentationSteps.forEach((step: any, index: number) => {
        // documentationSteps store image path in `screenshot` (relative), `filePath`, or `screenshotPath`
        let imgPath = step.filePath || step.screenshotPath || step.screenshot;
        // Recovery: if screenshot was stripped by partialize, find filePath from metadata.screenshots
        if (!imgPath && step.actionType !== 'diagram' && step.actionType !== 'video') {
          const matchingScreenshot = screenshotsArray.find((s: any) => s.id === step.id);
          if (matchingScreenshot?.filePath) {
            imgPath = matchingScreenshot.filePath;
          }
        }
        steps.push({
          title: step.title || `Step ${index + 1}`,
          description: step.description || '',
          hasImage: !!(step.imageData || imgPath || step.diagramImagePath || step.videoClipPath),
          imageData: step.imageData,
          filePath: imgPath,
          type: step.type || step.actionType,
          diagramImagePath: step.diagramImagePath,
          mediaType: step.mediaType,
          videoClipPath: step.videoClipPath,
          id: step.id
        });
      });
    }
    // Plain screenshots from metadata
    else if (currentProject?.metadata?.screenshots?.length > 0) {
      currentProject.metadata.screenshots.forEach((s: any, index: number) => {
        steps.push({
          title: `Step ${index + 1}`,
          description: s.description || '',
          hasImage: !!(s.imageData || s.filePath),
          imageData: s.imageData,
          filePath: s.filePath || (s as any).filename
        });
      });
    }

    return steps;
  }, [exportData, currentProject]);

  // Stable key for image loading — only re-load when file paths actually change
  const previewStepsKey = useMemo(() => {
    return previewSteps.map((s, i) => `${i}:${s.filePath || s.imageData?.substring(0, 30) || ''}`).join('|');
  }, [previewSteps]);

  // Load screenshot images from file paths
  const [previewImages, setPreviewImages] = useState<Record<number, string>>({});
  useEffect(() => {
    const loadImages = async () => {
      const projectName = currentProject?.name || exportData.projectName;
      if (!projectName || previewSteps.length === 0) return;

      const newImages: Record<number, string> = {};
      for (let i = 0; i < previewSteps.length; i++) {
        const step = previewSteps[i];
        if (step.imageData && step.imageData.startsWith('data:')) {
          newImages[i] = step.imageData;
        } else if (step.filePath) {
          try {
            // Extract just the filename — filePath may be absolute, relative with folder prefix, or just a name
            const fileName = step.filePath.split(/[/\\]/).pop() || step.filePath;
            const dataUrl = await getProjectFileAsDataUrl(projectName, 'step_by_step_screenshots', fileName);
            if (dataUrl) newImages[i] = dataUrl;
          } catch { /* skip */ }
        }
      }
      setPreviewImages(newImages);
    };
    loadImages();
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [previewStepsKey]);

  // Convert a data: URL to a blob: URL (CSP blocks data: for media-src but allows blob:)
  const dataUrlToBlobUrl = (dataUrl: string): string => {
    const [header, base64Data] = dataUrl.split(',');
    const mimeMatch = header.match(/data:([^;]+)/);
    const mimeType = mimeMatch ? mimeMatch[1] : 'video/mp4';
    const byteString = atob(base64Data);
    const uint8Array = new Uint8Array(byteString.length);
    for (let i = 0; i < byteString.length; i++) {
      uint8Array[i] = byteString.charCodeAt(i);
    }
    return URL.createObjectURL(new Blob([uint8Array], { type: mimeType }));
  };

  // Load secure diagram URLs for preview
  const [previewDiagramUrls, setPreviewDiagramUrls] = useState<Record<number, string>>({});
  const [previewVideoUrls, setPreviewVideoUrls] = useState<Record<number, string>>({});
  useEffect(() => {
    const loadDiagramAndVideoUrls = async () => {
      const projectName = currentProject?.name || exportData.projectName;
      if (!projectName || previewSteps.length === 0) return;

      const newDiagramUrls: Record<number, string> = {};
      const newVideoUrls: Record<number, string> = {};

      for (let i = 0; i < previewSteps.length; i++) {
        const step = previewSteps[i];

        // Load diagram URLs
        if (step.type === 'diagram' && step.diagramImagePath) {
          try {
            let fileName = step.diagramImagePath.split(/[/\\]/).pop();
            if (fileName) {
              fileName = fileName.split('?')[0];
              const dataUrl = await getProjectFileAsDataUrl(projectName, 'diagrams', fileName);
              if (dataUrl) newDiagramUrls[i] = dataUrl;
            }
          } catch { /* skip */ }
        }

        // Load video URLs
        if (step.mediaType === 'video' && step.videoClipPath && window.electronAPI?.getFileUrl) {
          try {
            const videoClipPath = step.videoClipPath;
            let url: string | null = null;
            const isAbsolute = /^[a-zA-Z]:/.test(videoClipPath) || videoClipPath.startsWith('/');
            if (isAbsolute) {
              url = await window.electronAPI.getFileUrl(videoClipPath);
            } else if (window.electronAPI.getProjectFilePath) {
              const absPath = await window.electronAPI.getProjectFilePath(projectName, videoClipPath);
              if (absPath) {
                url = await window.electronAPI.getFileUrl(absPath);
              }
            }
            if (url) {
              // Fix incorrect MIME type for video files
              if (url.startsWith('data:image/') && videoClipPath.match(/\.(mp4|webm|mov)$/i)) {
                const ext = videoClipPath.match(/\.(mp4|webm|mov)$/i)?.[1]?.toLowerCase();
                const mimeMap: Record<string, string> = { mp4: 'video/mp4', webm: 'video/webm', mov: 'video/quicktime' };
                const correctMime = mimeMap[ext || 'mp4'] || 'video/mp4';
                url = url.replace(/^data:image\/[^;]+/, `data:${correctMime}`);
              }
              // CSP blocks data: URLs for media-src — convert to blob: URL which is allowed
              if (url.startsWith('data:')) {
                url = dataUrlToBlobUrl(url);
              }
              newVideoUrls[i] = url;
            }
          } catch { /* skip */ }
        }
      }

      if (Object.keys(newDiagramUrls).length > 0) setPreviewDiagramUrls(newDiagramUrls);
      if (Object.keys(newVideoUrls).length > 0) setPreviewVideoUrls(newVideoUrls);
    };
    loadDiagramAndVideoUrls();
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [previewStepsKey]);

  // Format info map for limitation warnings
  const formatInfo: Record<string, string> = {
    pdf: t('formats.pdf.info'),
    docx: t('formats.docx.info'),
    html: t('formats.html.info'),
    pptx: t('formats.pptx.info'),
    markdown: t('formats.markdown.info'),
  };

  // Onboarding hints
  const hintsSuppressed = useHintsSuppressed();
  const formatSectionRef = useRef<HTMLDivElement | null>(null);
  const destinationSectionRef = useRef<HTMLDivElement | null>(null);
  const exportButtonRef = useRef<HTMLButtonElement | null>(null);
  const [formatReady, setFormatReady] = useState(false);
  const [destinationReady, setDestinationReady] = useState(false);
  const [exportBtnReady, setExportBtnReady] = useState(false);

  const assignFormatRef = useCallback((node: HTMLDivElement | null) => {
    formatSectionRef.current = node;
    setFormatReady(!!node);
  }, []);
  const assignDestinationRef = useCallback((node: HTMLDivElement | null) => {
    destinationSectionRef.current = node;
    setDestinationReady(!!node);
  }, []);
  const assignExportBtnRef = useCallback((node: HTMLButtonElement | null) => {
    exportButtonRef.current = node;
    setExportBtnReady(!!node);
  }, []);

  const formatHint = useOnboardingHint('export.format', { priority: 100 });
  const destinationHint = useOnboardingHint('export.destination', { priority: 90 });
  const exportBtnHint = useOnboardingHint('export.run', { priority: 80, when: !isExporting });

  return (
    <div className="flex h-full overflow-hidden">
      {/* LEFT PANEL — Controls */}
      <div className="w-[520px] xl:w-[580px] flex-shrink-0 flex flex-col bg-white dark:bg-gray-800 border-r border-gray-200 dark:border-gray-700 overflow-y-auto">
        {/* Header — pt-6 aligns border with sidebar and preview headers */}
        <div className="px-5 pt-1 pb-4 border-b border-gray-200 dark:border-gray-700">
          <div className="flex items-center gap-3">
            <button
              onClick={() => navigate('/editing')}
              className="p-1.5 hover:bg-gray-100 dark:hover:bg-gray-700 rounded-lg transition-colors"
            >
              <ArrowLeft className="w-4 h-4 text-gray-600 dark:text-gray-400" />
            </button>
            <div className="min-w-0 flex-1">
              <h1 className="text-lg font-bold text-gray-900 dark:text-white truncate">
                {t('header.title')}
              </h1>
              <p className="text-xs text-gray-500 dark:text-gray-400 truncate">
                {exportData.name} &middot; {exportData.projectName}
              </p>
            </div>
            <button
              onClick={toggleAllOnboardingHints}
              className={cn(
                "p-1.5 rounded-md transition-colors flex-shrink-0",
                hintsSuppressed
                  ? "text-gray-400 hover:text-gray-600 dark:text-gray-500 dark:hover:text-gray-300"
                  : "bg-blue-600 text-white hover:bg-blue-700"
              )}
              title={hintsSuppressed ? t('header.showHints') : t('header.hideHints')}
              aria-pressed={!hintsSuppressed}
            >
              <HelpCircle className="w-4 h-4" />
            </button>
          </div>
        </div>

        {/* Format Selection */}
        <div ref={assignFormatRef} className="px-5 py-4 border-b border-gray-200 dark:border-gray-700">
          <h3 className="text-sm font-semibold text-gray-900 dark:text-white mb-3">{t('formats.heading')}</h3>
            <div className="space-y-1.5">
              {exportFormats.map((format) => {
                return (
                  <button
                    key={format.id}
                    onClick={() => setSelectedFormat(format.id)}
                    className={cn(
                      "w-full flex items-center gap-3 px-3 py-2.5 rounded-lg transition-all text-left text-sm",
                      selectedFormat === format.id
                        ? "bg-blue-50 dark:bg-blue-900/30 border border-blue-300 dark:border-blue-600"
                        : "hover:bg-gray-50 dark:hover:bg-gray-700/50 border border-transparent"
                    )}
                  >
                    <div className={cn(
                      "flex-shrink-0",
                      selectedFormat === format.id ? "text-blue-600 dark:text-blue-400" : "text-gray-400 dark:text-gray-500"
                    )}>
                      {format.icon}
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2">
                        <span className={cn(
                          "font-medium",
                          selectedFormat === format.id ? "text-blue-900 dark:text-blue-100" : "text-gray-900 dark:text-white"
                        )}>
                          {format.name}
                        </span>
                      </div>
                      <p className="text-xs text-gray-500 dark:text-gray-400 mt-0.5">
                        {formatInfo[format.id]}
                      </p>
                    </div>
                    {selectedFormat === format.id && (
                      <Check className="w-4 h-4 text-blue-600 dark:text-blue-400 flex-shrink-0" />
                    )}
                  </button>
                );
              })}
            </div>

          {/* Video steps format notice */}
          {hasVideoSteps && (selectedFormat === 'pdf' || selectedFormat === 'docx' || selectedFormat === 'markdown') && (
            <div className="mt-3 p-2.5 bg-amber-50 dark:bg-amber-900/20 border border-amber-200 dark:border-amber-800 rounded-lg">
              <p className="text-xs text-amber-800 dark:text-amber-200">
                {t('formats.videoStepsWarning')}
              </p>
            </div>
          )}
        </div>

        {/* Export Language */}
        <div className="px-5 py-4 border-b border-gray-200 dark:border-gray-700">
          <label className="block text-sm font-semibold text-gray-900 dark:text-white mb-2">
            {t('language.label')}
          </label>
          <select
            value={exportOptions.translateTo}
            onChange={(e) => updateOption('translateTo', e.target.value)}
            className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 dark:bg-gray-700 dark:text-white text-sm"
          >
            <option value="none">{t('language.none')}</option>
            <option value="EN">{t('language.en')}</option>
            <option value="DE">{t('language.de')}</option>
          </select>
          {exportOptions.translateTo !== 'none' && translationModuleInstalled === false && (
            <p className="mt-1.5 text-xs text-amber-600 dark:text-amber-400">
              {t('language.moduleRequired')}
            </p>
          )}
        </div>

        {/* Destination */}
        <div ref={assignDestinationRef} className="border-b border-gray-200 dark:border-gray-700">
          <div className="w-full flex items-center justify-between px-5 py-3.5">
            <div className="flex items-center gap-2">
              <HardDrive className="w-4 h-4 text-gray-500" />
              <span className="text-sm font-semibold text-gray-900 dark:text-white">{t('destination.heading')}</span>
            </div>
            <span className="text-xs text-gray-500 dark:text-gray-400">{t('destination.localFile')}</span>
          </div>
        </div>

        {/* Template Selection (for supported formats) */}
        {(selectedFormat === 'docx' || selectedFormat === 'html' || selectedFormat === 'pdf') && (
          <div className="border-b border-gray-200 dark:border-gray-700">
            <TemplatePanel
              selectedTemplate={selectedTemplate}
              customization={templateCustomization}
              onTemplateChange={setSelectedTemplate}
              onCustomizationChange={setTemplateCustomization}
              onSaveSettings={handleSaveTemplateSettings}
              companyLogo={exportOptions.companyLogo}
              compact
            />
          </div>
        )}

        {/* Export Button + Progress */}
        <div className="px-5 py-4 mt-auto sticky bottom-0 border-t border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 z-10">
          {/* Export progress */}
          {isExporting && (
            <div className="mb-3">
              <div className="flex items-center justify-between mb-1.5">
                <span className="text-xs font-medium text-gray-700 dark:text-gray-300">{t('export.progress')}</span>
                <span className="text-xs text-gray-500">{Math.round(exportProgress)}%</span>
              </div>
              <div className="w-full bg-gray-200 dark:bg-gray-700 rounded-full h-1.5">
                <div
                  className="bg-blue-600 h-1.5 rounded-full transition-all duration-300"
                  style={{ width: `${exportProgress}%` }}
                />
              </div>
            </div>
          )}

          {/* Post-export success */}
          {lastExportResult && !isExporting && (
            <div className="mb-3 p-3 bg-green-50 dark:bg-green-900/20 border border-green-200 dark:border-green-800 rounded-lg">
              <div className="flex items-center gap-2 mb-2">
                <Check className="w-4 h-4 text-green-600" />
                <span className="text-sm font-medium text-green-800 dark:text-green-200">{t('result.complete')}</span>
              </div>
              <p className="text-xs text-green-700 dark:text-green-300 mb-2 truncate">{lastExportResult.name}</p>
              <div className="flex gap-2">
                {lastExportResult.filePath && (
                  <>
                    <button
                      onClick={async () => {
                        try {
                          await window.electronAPI?.openExportedFile(lastExportResult.filePath!);
                        } catch (error) {
                          toast.error(t('toast.openFileFailed'));
                        }
                      }}
                      className="flex-1 flex items-center justify-center gap-1.5 px-3 py-1.5 bg-green-600 text-white text-xs rounded-lg hover:bg-green-700 transition-colors font-medium"
                    >
                      <ExternalLink className="w-3.5 h-3.5" />
                      {t('result.openFile')}
                    </button>
                    <button
                      onClick={async () => {
                        try {
                          await window.electronAPI?.backup?.showItemInFolder(lastExportResult.filePath!);
                        } catch (error) {
                          toast.error(t('toast.showFolderFailed'));
                        }
                      }}
                      className="flex items-center justify-center gap-1.5 px-3 py-1.5 border border-green-300 dark:border-green-600 text-green-700 dark:text-green-300 text-xs rounded-lg hover:bg-green-100 dark:hover:bg-green-900/30 transition-colors"
                    >
                      <FolderOpen className="w-3.5 h-3.5" />
                      {t('result.folder')}
                    </button>
                  </>
                )}
                <button
                  onClick={() => setLastExportResult(null)}
                  className="px-2 py-1.5 text-xs text-gray-500 hover:text-gray-700 dark:text-gray-400 dark:hover:text-gray-200"
                >
                  {t('result.dismiss')}
                </button>
              </div>
            </div>
          )}

          <button
            ref={assignExportBtnRef}
            data-export-trigger
            onClick={() => { setLastExportResult(null); handleExport(); }}
            disabled={isExporting || !selectedFormat}
            className="w-full inline-flex items-center justify-center px-4 py-2.5 bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors font-medium text-sm"
          >
            {isExporting ? (
              <>
                <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                {t('export.exporting')}
              </>
            ) : (
              <>
                <Download className="w-4 h-4 mr-2" />
                {t('export.button')}
              </>
            )}
          </button>

          {/* Recent exports */}
          {exportedFiles.length > 0 && (
            <div className="mt-3 pt-3 border-t border-gray-100 dark:border-gray-700">
              <p className="text-xs font-medium text-gray-500 dark:text-gray-400 mb-2">{t('recent.heading')}</p>
              <div className="space-y-1.5">
                {exportedFiles.slice(-3).map((file, index) => (
                  <div key={index} className="flex items-center gap-2 text-xs text-gray-600 dark:text-gray-400">
                    <Check className="w-3 h-3 text-green-500 flex-shrink-0" />
                    <span className="truncate flex-1">{file.name}</span>
                    {file.filePath && (
                      <button
                        onClick={() => window.electronAPI?.backup?.showItemInFolder(file.filePath!)}
                        className="text-gray-400 hover:text-blue-600 flex-shrink-0"
                        title={t('result.showInFolder')}
                      >
                        <FolderOpen className="w-3 h-3" />
                      </button>
                    )}
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      </div>

      {/* RIGHT PANEL — Live Preview (reuses PreviewPanel from EditingPage) */}
      <div className="flex-1 flex flex-col min-w-0 overflow-hidden">
        <PreviewPanel
          data={{
            title: exportData.name || 'Untitled Document',
            description: exportData.source || undefined,
            steps: previewSteps.map((step, index) => ({
              id: step.id || `export-step-${index}`,
              title: step.title,
              description: step.description,
              screenshot: previewImages[index] || undefined,
              timestamp: 0,
              type: step.type,
              diagramImagePath: step.diagramImagePath,
              diagramUrl: step.type === 'diagram' ? previewDiagramUrls[index] : undefined,
              mediaType: step.mediaType as 'image' | 'video' | undefined,
              videoClipPath: step.videoClipPath,
              videoClipUrl: step.mediaType === 'video' ? previewVideoUrls[index] : undefined
            }))
          }}
          format="pdf"
          template={selectedTemplate ? applyCustomization(selectedTemplate, templateCustomization) : null}
          className="flex-1 rounded-none border-0 shadow-none"
        />
      </div>

      {/* Onboarding coach marks */}
      {formatHint.visible && formatReady && (
        <CoachMark
          anchorRef={formatSectionRef}
          title={t('coach.formatTitle')}
          description={t('coach.formatDesc')}
          placement="right"
          onDismiss={formatHint.dismiss}
        />
      )}
      {destinationHint.visible && destinationReady && (
        <CoachMark
          anchorRef={destinationSectionRef}
          title={t('coach.destinationTitle')}
          description={t('coach.destinationDesc')}
          placement="right"
          onDismiss={destinationHint.dismiss}
        />
      )}
      {exportBtnHint.visible && exportBtnReady && (
        <CoachMark
          anchorRef={exportButtonRef}
          title={t('coach.runTitle')}
          description={t('coach.runDesc')}
          placement="top"
          onDismiss={exportBtnHint.dismiss}
        />
      )}

      {/* Translation Module Download Modal */}
      <TranslationModuleDownload
        isOpen={showTranslationModuleDownload}
        onClose={() => {
          setShowTranslationModuleDownload(false);
          setPendingTranslationExport(false);
        }}
        onInstallComplete={() => {
          setShowTranslationModuleDownload(false);
          setTranslationModuleInstalled(true);
          if (pendingTranslationExport) {
            setPendingTranslationExport(false);
            setTimeout(() => {
              const exportButton = document.querySelector('[data-export-trigger]') as HTMLButtonElement;
              if (exportButton) {
                exportButton.click();
              }
            }, 500);
          }
        }}
        targetLang={exportOptions.translateTo as 'EN' | 'DE'}
      />
    </div>
  );
};

export default ExportPage;
