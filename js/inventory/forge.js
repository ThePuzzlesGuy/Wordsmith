import { showMessage } from '../ui/ui.js';
import { spawnKey } from './inventory.js';
import { maybeCheckLose } from '../progression/progression.js';

export function initForge(){
  const forgeBtn = document.getElementById('forge-btn');
  if (!forgeBtn) return;

  forgeBtn.addEventListener('click', () => {
    const { a, b } = getCombinerSlots();
    const k1 = a.querySelector('.key');
    const k2 = b.querySelector('.key');
    if (!k1 || !k2 || k1.dataset.type !== k2.dataset.type) return;

    const result = nextTier(k1.dataset.type);
    const label = result === 'pick' ? 'Lock Pick' : (result[0].toUpperCase() + result.slice(1) + ' key');
    const ok = window.confirm(`Forge these two keys into a ${label}?`);
    if (!ok) return;

    doCombine();
  });

  document.addEventListener('forge:changed', updateForgeButton);
  updateForgeButton();
}

export function updateForgeButton(){
  const forgeBtn = document.getElementById('forge-btn');
  if (!forgeBtn) return;
  const { a, b } = getCombinerSlots();
  const k1 = a.querySelector('.key');
  const k2 = b.querySelector('.key');
  forgeBtn.disabled = !(k1 && k2 && k1.dataset.type === k2.dataset.type);
}

export function nextTier(type){
  if (type === 'wood') return 'stone';
  if (type === 'stone') return 'gold';
  if (type === 'gold') return 'pick';
  return null;
}

export function doCombine(){
  const { a:slotA, b:slotB } = getCombinerSlots();
  const k1 = slotA.querySelector('.key');
  const k2 = slotB.querySelector('.key');
  if (!k1 || !k2) { updateForgeButton(); return; }
  if (k1.dataset.type !== k2.dataset.type) {
    const smith = document.getElementById('smith');
    smith.classList.add('shake');
    setTimeout(() => smith.classList.remove('shake'), 320);
    updateForgeButton();
    return;
  }

  const result = nextTier(k1.dataset.type);
  if (!result) { updateForgeButton(); return; }

  k1.remove(); k2.remove();
  slotA.classList.remove('has-key');
  slotB.classList.remove('has-key');

  const smith = document.getElementById('smith');
  smith.classList.add('strike');
  setTimeout(() => smith.classList.remove('strike'), 600);

  if (result === 'pick') {
    spawnKey('pick');
    showMessage(`You've successfully crafted a Lock Pick!`);
  } else {
    spawnKey(result);
    const label = result.charAt(0).toUpperCase() + result.slice(1);
    showMessage(`You've successfully crafted a ${label} key!`);
  }

  updateForgeButton();
  maybeCheckLose();
}

function getCombinerSlots(){
  const root = document.getElementById('smith');
  return { a: root.querySelector('.drop-slot[data-slot="a"]'), b: root.querySelector('.drop-slot[data-slot="b"]') };
}
