import { state } from '../state.js';
import { createSpriteImg } from '../utils.js';
import { buildDynamicLocks } from '../locks/locks.js';
import { showMessage } from '../ui/ui.js';
import { maybeCheckLose } from '../progression/progression.js';
import { recallForgeKeysToInventory, spawnKey, spawnVaultKey } from '../inventory/inventory.js';

export async function loadBoards() {
  if (Array.isArray(window.BOARDS)) {
    state.boards = window.BOARDS;
    return;
  }
  const res = await fetch(new URL('./boards.json', import.meta.url));
  state.boards = await res.json();
}

export function setupBoard(restartSame = false) {
  state.resolvingLoss = false;

  if (!restartSame) {
    document.querySelectorAll('#keys .key').forEach((k) => {
      k.dataset.carried = 'true';
      k.classList.add('carried');
    });
  }

  if (!(restartSame && state.currentBoard)) {
    let pool = state.boards.filter((_, i) => !state.completedBoards.includes(i));
    if (pool.length === 0) {
      state.completedBoards = [];
      pool = state.boards.slice();
    }
    state.currentBoard = pool[Math.floor(Math.random() * pool.length)];
    const actualIndex = state.boards.indexOf(state.currentBoard);
    state.completedBoards.push(actualIndex);
  }

  const themeEl = document.getElementById('theme');
  if (themeEl) themeEl.textContent = state.currentBoard.theme;

  state.remainingWords = state.currentBoard.words.map((w) => w.toUpperCase());
  state.validWords = state.remainingWords.slice();

  let gridEl = document.getElementById('letter-grid');
  if (!gridEl) {
    const host = document.querySelector('.parchment') || document.body;
    gridEl = document.createElement('div');
    gridEl.id = 'letter-grid';
    gridEl.className = 'grid';
    host.appendChild(gridEl);
  }

  gridEl.innerHTML = '';
  const cols = state.currentBoard.cols || Math.sqrt(state.currentBoard.grid.length) || 5;
  gridEl.style.display = 'inline-grid';
  gridEl.style.gap = '10px';
  gridEl.style.justifyContent = 'center';
  gridEl.style.gridTemplateColumns = `repeat(${cols}, 74px)`;

  for (let i = 0; i < state.currentBoard.grid.length; i++) {
    const div = document.createElement('div');
    div.className = 'letter';
    div.textContent = state.currentBoard.grid[i];
    div.dataset.index = i;
    div.dataset.active = 'true';
    div.addEventListener('mousedown', startSelect);
    div.addEventListener('pointerdown', startSelect);
    div.addEventListener('mouseenter', continueSelect);
    div.addEventListener('pointerenter', continueSelect);
    gridEl.appendChild(div);
  }

  buildDynamicLocks(state.currentBoard.words);
  placeVaultIcon();
}

export function placeVaultIcon() {
  const grid = document.getElementById('letter-grid');
  if (!grid) return;
  grid.querySelectorAll('.vault-badge').forEach((el) => el.remove());

  const tiles = Array.from(grid.querySelectorAll('.letter')).filter((el) => el.dataset.active === 'true');
  if (tiles.length === 0) {
    state.vaultIndex = -1;
    return;
  }

  const pick = tiles[Math.floor(Math.random() * tiles.length)];
  state.vaultIndex = Number(pick.dataset.index);

  const img = createSpriteImg('vault.png', 'Vault');
  img.className = 'vault-badge';
  pick.appendChild(img);
}

export function startSelect(e) {
  if (e.target.dataset.active !== 'true') return;
  e.preventDefault();
  recallForgeKeysToInventory();

  state.isSelecting = true;
  document.body.classList.add('no-select');

  state.currentPath = [e.target];
  e.target.style.background = '#e8d8b7';
  state.selectedLetters = [e.target.textContent];
}

export function continueSelect(e) {
  if (
    state.isSelecting &&
    state.currentPath.length > 0 &&
    !state.currentPath.includes(e.target) &&
    e.target.dataset.active === 'true'
  ) {
    state.currentPath.push(e.target);
    e.target.style.background = '#e8d8b7';
    state.selectedLetters.push(e.target.textContent);
  }
}

export function endSelect() {
  if (!state.isSelecting) return;
  state.isSelecting = false;

  const word = state.selectedLetters.join('');

  if (state.selectedLetters.length >= 3 && state.validWords.includes(word)) {
    const idx = state.remainingWords.indexOf(word);
    if (idx !== -1) {
      state.remainingWords.splice(idx, 1);
      giveKey(word.length);
      markUsedTiles(state.currentPath);
    } else {
      invalidWordFeedback(state.currentPath);
    }
  } else if (state.selectedLetters.length >= 3) {
    invalidWordFeedback(state.currentPath);
  }

  state.currentPath.forEach((el) => (el.style.background = ''));
  state.selectedLetters = [];
  state.currentPath = [];
  document.body.classList.remove('no-select');

  maybeCheckLose();
}

function giveKey(len) {
  const type = len === 3 ? 'wood' : len === 4 ? 'stone' : 'gold';
  spawnKey(type);
}

export function markUsedTiles(tiles) {
  tiles.forEach((el) => {
    el.dataset.active = 'false';
    el.classList.add('used');
  });

  if (
    state.vaultIndex !== -1 &&
    tiles.some((el) => Number(el.dataset.index) === Number(state.vaultIndex))
  ) {
    const grid = document.getElementById('letter-grid');
    const badge = grid && grid.querySelector('.vault-badge');
    if (badge) badge.remove();
    state.vaultIndex = -1;

    spawnVaultKey();
    showMessage('Vault Key acquired! Drag it to the safe.');
  }
}

export function invalidWordFeedback(tiles) {
  tiles.forEach((el) => {
    el.classList.add('invalid');
    setTimeout(() => el.classList.remove('invalid'), 400);
  });
}
