import { state } from './state.js';
import { showMessage, showContinue, updateProgressUI } from './ui.js';

export function maybeCheckLose(){
  if (state.resolvingLoss) return;
  if (isAnyRemainingWordPossible()) return;
  if (canOpenHiddenLock()) return;

  state.resolvingLoss = true;
  state.lives = Math.max(0, state.lives - 1);
  updateProgressUI();

  if (state.lives === 0) {
    showMessage("Game Over", { sticky:true });
    setTimeout(() => {
      document.getElementById('keys').innerHTML = `
        <div class="inv-slot"></div>
        <div class="inv-slot"></div>
        <div class="inv-slot"></div>
        <div class="inv-slot"></div>
        <div class="inv-slot"></div>`;
      state.lives = 3; state.scrolls = 0; updateProgressUI();
      state.resolvingLoss = false;
      // tell main to reset with a fresh board
      document.dispatchEvent(new CustomEvent('game:restart', { detail:{ restartSame:false } }));
    }, 1200);
  } else {
    showContinue(
      "Oh no! You've lost a heart.\nNo valid words, or keys remaining.\nThe scroll is now behind a new lock-\ntry and find it before you use all 3 hearts!",
      "Continue"
    ).then(() => {
      state.resolvingLoss = false;
      // restart same board
      document.dispatchEvent(new CustomEvent('game:restart', { detail:{ restartSame:true } }));
    });
  }
}

export function isAnyRemainingWordPossible(){
  if (state.remainingWords.length === 0) return false;
  const counts = {};
  document.querySelectorAll('#letter-grid .letter').forEach(t => {
    if (t.dataset.active === "true") {
      const ch = (t.textContent || "").toUpperCase();
      counts[ch] = (counts[ch] || 0) + 1;
    }
  });
  const canMake = (word) => {
    const need = {};
    for (const ch of word.toUpperCase()) need[ch] = (need[ch] || 0) + 1;
    for (const k in need) if (!counts[k] || counts[k] < need[k]) return false;
    return true;
  };
  return state.remainingWords.some(canMake);
}

export function canOpenHiddenLock(){
  const keys = document.querySelectorAll('#keys .key, #smith .key');
  const counts = { wood:0, stone:0, gold:0, pick:0 };
  keys.forEach(k => { const t = k.dataset.type; if (counts[t] !== undefined) counts[t]++; });

  if (counts.pick > 0) return true;

  const typeNeeded = getHiddenLockType();
  if (!typeNeeded) return false;

  if (typeNeeded === 'wood') return counts.wood > 0 || pickPossible(counts) > 0;
  if (typeNeeded === 'stone'){
    const stonesFromWood = Math.floor(counts.wood / 2);
    return counts.stone > 0 || stonesFromWood > 0 || pickPossible(counts) > 0;
  }
  if (typeNeeded === 'gold'){
    const stonesFromWood = Math.floor(counts.wood / 2);
    const totalStones = counts.stone + stonesFromWood;
    const goldFromStones = Math.floor(totalStones / 2);
    return counts.gold > 0 || goldFromStones > 0 || pickPossible(counts) > 0;
  }
  return false;
}

export function pickPossible(counts){
  const stonesFromWood = Math.floor(counts.wood / 2);
  const totalStones = counts.stone + stonesFromWood;
  const goldFromStones = Math.floor(totalStones / 2);
  const totalGold = counts.gold + goldFromStones;
  return Math.floor(totalGold / 2);
}

export function getHiddenLockType(){
  const el = document.querySelector(`.lock[data-id="${state.hiddenLockId}"]`);
  return el?.dataset.type || null;
}
