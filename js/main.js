<script src="js/board/boards.js"></script>
<script type="module">
import { loadBoards, setupBoard, endSelect } from './js/board/board.js';
import { sizeLocksRow } from './js/locks/locks.js';
import { setupDragAndDrop } from './js/inventory/inventory.js';
import { initPrizeWheel } from './js/wheel/wheel.js';
import { installImageFallbacks } from './js/utils.js';
import './js/state.js';

document.addEventListener('DOMContentLoaded', async () => {
  await loadBoards();
  setupBoard(false);
  setupDragAndDrop();
  initPrizeWheel();
  installImageFallbacks();
  window.addEventListener('resize', sizeLocksRow);
  ['mouseup','pointerup','touchend'].forEach(ev =>
    document.addEventListener(ev, endSelect)
  );
});

document.addEventListener('game:reset', () => setupBoard(false));
document.addEventListener('game:restart', e =>
  setupBoard(!!(e.detail && e.detail.restartSame))
);
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
