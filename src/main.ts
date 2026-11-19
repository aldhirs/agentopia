import { createApp } from 'vue';
// Fraunces (display, variable with the SOFT axis) · Figtree (text) · IBM Plex Mono (code/terminal).
import '@fontsource-variable/fraunces/soft.css';
import '@fontsource/figtree/400.css';
import '@fontsource/figtree/500.css';
import '@fontsource/figtree/600.css';
import '@fontsource/figtree/700.css';
import '@fontsource/ibm-plex-mono/400.css';
import '@fontsource/ibm-plex-mono/600.css';
import './styles/base.css';
import App from './App.vue';
import { startBgm } from './lib/bgm';

// The 3D office draws name tags and the neon sign into canvases once, so load those fonts first
// (bundled locally; never waits more than a moment).
const fontsUsedInCanvas = ['600 44px Figtree', "italic 700 150px 'Fraunces Variable'"];
Promise.race([
  Promise.all(fontsUsedInCanvas.map((f) => document.fonts.load(f))),
  new Promise((r) => setTimeout(r, 1500)),
]).finally(() => {
  createApp(App).mount('#app');
  startBgm();
});
