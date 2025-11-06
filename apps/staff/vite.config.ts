import path from 'path';
import { defineConfig, loadEnv } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig(({ mode }) => {
    const env = loadEnv(mode, path.resolve(__dirname, '../..'), '');
    return {
      server: {
        port: 5174,
        host: '0.0.0.0',
      },
      plugins: [react()],
      define: {
        // Support both STAFF_GEMINI_API_KEY (from remote) and GEMINI_API_KEY/VITE_API_KEY (from local)
        'process.env.API_KEY': JSON.stringify(env.STAFF_GEMINI_API_KEY || env.GEMINI_API_KEY || env.VITE_API_KEY || ''),
        'process.env.GEMINI_API_KEY': JSON.stringify(env.STAFF_GEMINI_API_KEY || env.GEMINI_API_KEY || env.VITE_API_KEY || ''),
        'import.meta.env.VITE_API_KEY': JSON.stringify(env.STAFF_GEMINI_API_KEY || env.GEMINI_API_KEY || env.VITE_API_KEY || '')
      },
      resolve: {
        alias: {
          '@': path.resolve(__dirname, '.'),
        }
      }
    };
});
