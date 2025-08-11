import './board/boards.js';

import { loadBoards, setupBoard, endSelect } from './board/board.js';
import { sizeLocksRow } from './locks/locks.js';
import { setupDragAndDrop } from './inventory/inventory.js';
import { initPrizeWheel } from './wheel/wheel.js';
import { updateProgressUI } from './progression/progression.js';
import { hidePopup } from './ui/ui.js';
import { installImageFallbacks } from './utils.js';
import { initForge } from './inventory/forge.js';
import './state.js';

document.addEventListener('DOMContentLoaded', async () => {
  await loadBoards();
  setupBoard(false);
  setupDragAndDrop();
  initForge();
  initPrizeWheel();
  installImageFallbacks();

  window.addEventListener('resize', sizeLocksRow);
  updateProgressUI();
  ['mouseup', 'pointerup', 'touchend'].forEach(ev =>
    document.addEventListener(ev, endSelect)
  );

  const pop = document.getElementById('popup');
  if (pop) {
    pop.addEventListener('click', (e) => {
      if (e.target.id === 'popup' && pop.dataset.dismiss !== 'locked') {
        hidePopup();
      }
    });
  }
});

document.addEventListener('game:reset', () => setupBoard(false));
document.addEventListener('game:restart', (e) => {
  const restartSame = !!(e.detail && e.detail.restartSame);
  setupBoard(restartSame);
});
