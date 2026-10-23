import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import tsconfigPaths from 'vite-tsconfig-paths';
import path from 'path';
import fs from 'fs';
import os from 'os';
import type { Plugin } from 'vite';

// REMOVED: copyExcalidrawAssetsPlugin - Excalidraw feature removed
// REMOVED: devCSPPlugin - Excalidraw CSP relaxation no longer needed

// Custom plugin to serve project files
const projectFilesPlugin = () => {
  return {
    name: 'project-files-server',
    configureServer(server: any) {
      // Serve project files from /project-files/:projectName/:type/:fileName and ./project-files/:projectName/:type/:fileName
      server.middlewares.use('/project-files', (req: any, res: any, next: any) => {
        try {
          // Parse URL: /project-files/ProjectName/recordings/filename.webm or ./project-files/ProjectName/recordings/filename.webm
          const urlParts = req.url.split('/').filter((part: string) => part);
          
          if (urlParts.length < 3) {
            res.statusCode = 400;
            res.end('Invalid project file path');
            return;
          }
          
          const projectName = decodeURIComponent(urlParts[0]);
          let fileType = urlParts[1]; // 'recordings' or 'screenshots' or 'step_by_step_screenshots'
          const fileName = decodeURIComponent(urlParts.slice(2).join('/'));
          
          // Handle legacy 'screenshots' folder name - map to 'step_by_step_screenshots'
          if (fileType === 'screenshots') {
            fileType = 'step_by_step_screenshots';
          }
          
          // Handle legacy 'interactive_screenshots' folder name - map to 'step_by_step_screenshots'
          if (fileType === 'interactive_screenshots') {
            fileType = 'step_by_step_screenshots';
          }
          
          console.log('Project files middleware - project:', projectName, 'type:', fileType, 'file:', fileName);
          
          // Sanitize project name
          const sanitizedProjectName = projectName.replace(/[<>:"/\\|?*]/g, '_').trim();
          
          // Build file path
          const projectsDir = path.join(os.homedir(), 'Documents', 'Docfai Projects');
          const filePath = path.join(projectsDir, sanitizedProjectName, fileType, fileName);
          
          console.log('Project files middleware - full path:', filePath);
          console.log('Project files middleware - file exists:', fs.existsSync(filePath));
          
          if (fs.existsSync(filePath) && fs.statSync(filePath).isFile()) {
            const ext = path.extname(filePath).toLowerCase();
            const mimeTypes: { [key: string]: string } = {
              '.webm': 'video/webm',
              '.mp4': 'video/mp4',
              '.avi': 'video/x-msvideo',
              '.mov': 'video/quicktime',
              '.png': 'image/png',
              '.jpg': 'image/jpeg',
              '.jpeg': 'image/jpeg',
              '.gif': 'image/gif',
              '.json': 'application/json'
            };
            
            const stats = fs.statSync(filePath);
            const contentType = mimeTypes[ext] || 'application/octet-stream';
            
            res.setHeader('Content-Type', contentType);
            res.setHeader('Accept-Ranges', 'bytes');
            res.setHeader('Content-Length', stats.size);
            res.setHeader('Cache-Control', 'no-cache');
            res.setHeader('Access-Control-Allow-Origin', '*');
            
            console.log('Project files middleware - serving file with headers:', {
              'Content-Type': contentType,
              'Content-Length': stats.size
            });
            
            const stream = fs.createReadStream(filePath);
            stream.on('error', (err) => {
              console.error('Project files middleware - stream error:', err);
              res.statusCode = 500;
              res.end('Internal server error');
            });
            stream.pipe(res);
          } else {
            console.log('Project files middleware - file not found:', filePath);
            res.statusCode = 404;
            res.end('File not found');
          }
        } catch (error) {
          console.error('Project files middleware - error:', error);
          res.statusCode = 500;
          res.end('Internal server error');
        }
      });
    }
  };
};

// https://vite.dev/config/
export default defineConfig({
  plugins: [
    // REMOVED: copyExcalidrawAssetsPlugin() - Excalidraw feature removed
    // REMOVED: devCSPPlugin() - Excalidraw CSP relaxation no longer needed
    react(),
    tsconfigPaths(),
    projectFilesPlugin()
  ],
  base: './',
  server: {
    port: 5180,
    strictPort: true,
    host: true,
    hmr: {
      port: 5181
    },
    fs: {
      // Allow serving files from project directories
      allow: ['..', './recordings']
    }
  },
  optimizeDeps: {
    exclude: ['fs-extra', 'fluent-ffmpeg']
    // REMOVED: include: ['@excalidraw/excalidraw']
  },
  ssr: {
    external: ['electron', 'path', 'fs-extra', 'fluent-ffmpeg', 'fs', 'os', 'crypto', 'stream', 'util', 'events', 'child_process', 'net', 'tls', 'dns']
  },
  build: {
    rollupOptions: {
      external: (id) => {
        return ['electron', 'path', 'fs-extra', 'fluent-ffmpeg', 'fs', 'os', 'crypto', 'stream', 'util', 'events', 'child_process', 'net', 'tls', 'dns'].includes(id);
      }
      // REMOVED: output.manualChunks - was for Excalidraw CDN avoidance
    },
    target: 'esnext',
    commonjsOptions: {
      ignoreDynamicRequires: true
    },
    // Inline all assets to avoid external CDN dependencies
    assetsInlineLimit: 0
  },
  define: {
    global: 'globalThis',
    // REMOVED: Excalidraw configuration
    'process.env.VITE_APP_DISABLE_SENTRY': 'true',
    'process.env.VITE_APP_DISABLE_TRACKING': 'true'
  },
  resolve: {
    alias: {
      'fs-extra': 'fs-extra',
      'fluent-ffmpeg': 'fluent-ffmpeg'
      // REMOVED: Excalidraw alias configuration
    }
  }
})
