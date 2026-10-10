// Entry point — imports the stylesheet, hero effects, and the scroll cinematic.
// Modules are deferred by default, so the DOM is ready when these run.
import './style.css';
import { initHeroGrid } from './hero-grid.js';
import { initHeroIntro } from './hero-intro.js';
import { initCinematic } from './cinematic.js';
import { initFaq } from './faq.js';
import { initTracks } from './tracks.js';

initHeroGrid();
initHeroIntro();
initCinematic();
initFaq();
initTracks();
