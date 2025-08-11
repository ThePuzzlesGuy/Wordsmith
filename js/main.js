<script type="module">
import { loadBoards, setupBoard, endSelect } from './board/board.js';
import { sizeLocksRow } from './locks/locks.js';
import { setupDragAndDrop } from './inventory/inventory.js';
import { initPrizeWheel } from './wheel/wheel.js';
import { installImageFallbacks } from './utils.js';
import './state.js';

document.addEventListener('DOMContentLoaded', async () => {
  await loadBoards();
  setupBoard(false);
  setupDragAndDrop();
  initPrizeWheel();
  installImageFallbacks();
  window.addEventListener('resize', sizeLocksRow);
  ['mouseup','pointerup','touchend'].forEach(ev => document.addEventListener(ev, endSelect));
});
</script>

  const pop = document.getElementById('popup');
  pop?.addEventListener('click', (e) => {
    if (e.target.id === 'popup' && pop.dataset.dismiss !== 'locked') hidePopup();
  });

  window.addEventListener('resize', sizeLocksRow);
  updateProgressUI();

  ['mouseup','pointerup','touchend'].forEach(ev =>
    document.addEventListener(ev, endSelect)
  );

  // Init wheel + path fallbacks
  initPrizeWheel();
  installImageFallbacks();
});

/* decoupled flow events */
document.addEventListener('game:reset', () => setupBoard(false));
document.addEventListener('game:restart', (e) => {
  const restartSame = !!(e.detail && e.detail.restartSame);
  setupBoard(restartSame);
});
