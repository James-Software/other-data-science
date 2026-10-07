import { defineConfig } from 'vite';

// base './' keeps asset paths relative so the built site works from any
// path (Vercel project URL, custom domain, or a plain static host).
export default defineConfig({
  base: './',
});
