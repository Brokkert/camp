import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

// Anders dan CATANIA/Paklijst bouwen we hier géén single-file HTML: maplibre is
// te groot om te inlinen, en de service worker (offline-modus in het veld) heeft
// juist losse, cachebare bestanden nodig.
export default defineConfig({
  plugins: [react()],
  base: './',
  define: {
    __BUILD__: JSON.stringify(new Date().toISOString().slice(0, 16).replace('T', ' ') + ' UTC'),
  },
  build: {
    rollupOptions: {
      output: {
        // Maplibre is verreweg het grootste deel en verandert bijna nooit.
        // Apart houden scheelt de gebruiker een download van een halve MB bij
        // elke update van de app zelf, en de service worker kan het los cachen.
        manualChunks: {
          maplibre: ['maplibre-gl'],
          supabase: ['@supabase/supabase-js'],
        },
      },
    },
  },
  test: {
    environment: 'jsdom',
    globals: true,
  },
});
