// js/main.js
import { loadBoards, setupBoard, endSelect } from './board/board.js';
import { sizeLocksRow } from './locks/locks.js';
import { setupDragAndDrop } from './inventory/inventory.js';
import { initPrizeWheel } from './wheel/wheel.js';
import { updateProgressUI } from './progression/progression.js';
import { hidePopup } from './ui/ui.js';
import { installImageFallbacks } from './utils.js';
import './state.js';

document.addEventListener('DOMContentLoaded', async () => {
  await loadBoards();
  setupBoard(false);
  setupDragAndDrop();
  initPrizeWheel();
  installImageFallbacks();

  // UI wiring
  window.addEventListener('resize', sizeLocksRow);
  updateProgressUI();
  ['mouseup', 'pointerup', 'touchend'].forEach(ev =>
    document.addEventListener(ev, endSelect)
  );

  // Dismiss popup when clicking the backdrop (unless locked)
  const pop = document.getElementById('popup');
  if (pop) {
    pop.addEventListener('click', (e) => {
      if (e.target.id === 'popup' && pop.dataset.dismiss !== 'locked') {
        hidePopup();
      }
    });
  }
});

// Soft restart hooks
document.addEventListener('game:reset', () => setupBoard(false));
document.addEventListener('game:restart', (e) => {
  const restartSame = !!(e.detail && e.detail.restartSame);
  setupBoard(restartSame);
});
