/**
 * Space Pinball Blast — entry point.
 * Boots the game into #root. Canvas + physics + audio + UI live under /src.
 */
import './game/styles.css';
import { Game } from './game/game';

function boot(): void {
  const rootEl = document.getElementById('root');
  if (!rootEl) return;

  const wrap = document.createElement('div');
  wrap.className = 'spb-root';
  rootEl.appendChild(wrap);

  const game = new Game(wrap);

  // Clean teardown during hot-module replacement in development
  if (import.meta.hot) {
    import.meta.hot.dispose(() => {
      game.destroy();
      wrap.remove();
    });
  }
}

boot();
