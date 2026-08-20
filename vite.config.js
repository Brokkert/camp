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
        // Als functie en niet als object: vite 8 bundelt met rolldown, en die
        // accepteert alleen de functievorm. Rollup kent beide, dus dit werkt
        // ook als we ooit teruggaan.
        manualChunks(id) {
          if (id.includes('node_modules/maplibre-gl')) return 'maplibre';
          if (id.includes('node_modules/@supabase')) return 'supabase';
        },
      },
    },
  },
  test: {
    environment: 'jsdom',
    globals: true,
  },
});
