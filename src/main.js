// Entry point — imports the stylesheet, hero effects, and the scroll cinematic.
// Modules are deferred by default, so the DOM is ready when these run.
//
// Scroll/grid animation concepts inspired by https://github.com/NayanVangala/rein
// — clean-room vanilla JS implementations written for this site; no code copied.
import './style.css';
import { initHeroGrid } from './hero-grid.js';
import { initHeroIntro } from './hero-intro.js';
import { initCinematic, initLogoSpin } from './cinematic.js';

initHeroGrid();
initHeroIntro();
initCinematic();
initLogoSpin();
