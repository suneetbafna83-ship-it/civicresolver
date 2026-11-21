import type { IncomingMessage, ServerResponse } from 'node:http';
import tailwindcss from '@tailwindcss/vite';
import react from '@vitejs/plugin-react';
import { defineConfig, type Plugin } from 'vite';
import { createDevServer } from './server/devServer.js';

function civicApiMiddlewarePlugin(): Plugin {
  const apiApp = createDevServer();
  const handler = (
    req: IncomingMessage,
    res: ServerResponse,
    next: () => void,
  ): void => {
    const url = req.url ?? '';
    if (url === '/api' || url.startsWith('/api/')) {
      apiApp(req, res);
      return;
    }
    next();
  };

  return {
    name: 'civicresolve-api-middleware',
    configureServer(server) {
      server.middlewares.use(handler);
    },
    configurePreviewServer(server) {
      server.middlewares.use(handler);
    },
  };
}

export default defineConfig({
  plugins: [react(), tailwindcss(), civicApiMiddlewarePlugin()],
  server: {
    port: 5173,
    strictPort: false,
  },
  build: {
    sourcemap: false,
    chunkSizeWarningLimit: 650,
  },
});
