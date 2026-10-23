// Security: Extracted from inline script in index.html to enable strict CSP
// Polyfills for browser context (require and process)

// Polyfill for require function in browser context
if (typeof require === 'undefined') {
  window.require = function() {
    throw new Error('require is not available in browser context');
  };
}

// Comprehensive polyfill for process object in browser context
(function() {
  const mockProcess = {
    cwd: function() { return '/tmp'; },
    env: {},
    platform: 'browser',
    version: 'v16.0.0',
    versions: { node: '16.0.0' },
    argv: [],
    pid: 1,
    ppid: 0,
    title: 'browser',
    arch: 'x64',
    nextTick: function(callback) { setTimeout(callback, 0); },
    exit: function() {},
    kill: function() {},
    chdir: function() {},
    umask: function() { return 0; }
  };

  // Set on window
  if (typeof window !== 'undefined') {
    window.process = mockProcess;
  }

  // Set on globalThis
  if (typeof globalThis !== 'undefined') {
    globalThis.process = mockProcess;
  }

  // Set as global variable
  if (typeof global !== 'undefined') {
    global.process = mockProcess;
  }

  // Override any existing process
  try {
    if (typeof process === 'undefined' || !process.cwd || typeof process.cwd !== 'function') {
      window.process = mockProcess;
      globalThis.process = mockProcess;
    }
  } catch (e) {
    window.process = mockProcess;
    globalThis.process = mockProcess;
  }
})();
