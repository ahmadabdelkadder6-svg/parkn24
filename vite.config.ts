import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig({
  plugins: [react()],

  build: {
    outDir: 'dist',
    
    // ✅ إعدادات متوازنة
    assetsInlineLimit: 4096,
    chunkSizeWarningLimit: 2000,
    cssCodeSplit: false,
    
    // ✅ minify أسرع
    minify: 'esbuild',
    
    // ✅ source map للـ production بس لو محتاجه
    sourcemap: false,

    rollupOptions: {
      output: {
        // ✅ تقسيم منطقي يمنع الـ preload warnings
        manualChunks(id) {
          // كل الـ node_modules في chunk واحد
          if (id.includes('node_modules')) {
            // Map منفصل عشان كبير
            if (id.includes('leaflet')) {
              return 'map';
            }
            // Framer منفصل عشان كبير
            if (id.includes('framer-motion')) {
              return 'motion';
            }
            // باقي المكتبات مع بعض
            return 'vendor';
          }
        },
        
        // ✅ أسماء ثابتة للـ caching
        entryFileNames: 'assets/app.[hash].js',
        chunkFileNames: 'assets/[name].[hash].js',
        assetFileNames: 'assets/[name].[hash].[ext]',
      },
    },
  },

  optimizeDeps: {
    include: [
      'react',
      'react-dom',
      'leaflet',
      'react-leaflet',
      'framer-motion',
      'zustand',
      'lucide-react',
      'react-hot-toast',
      '@supabase/supabase-js',
    ],
  },
});