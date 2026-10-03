import { defineConfig } from 'vite';

// base './' sorgt dafür, dass die App in der Android-WebView ihre Dateien findet.
export default defineConfig({
  base: './',
  build: { outDir: 'dist', emptyOutDir: true }
});
