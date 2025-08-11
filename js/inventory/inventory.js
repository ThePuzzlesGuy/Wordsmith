import { createSpriteImg } from '../utils.js';
import { showMessage } from '../ui/ui.js';
import { openPrizeWheel } from '../wheel/wheel.js';
import { maybeCheckLose } from '../progression/progression.js';

export function spawnKey(type){
  const inv = document.getElementById("inventory");
  const keyGrid = document.getElementById("keys");

  const emptySlot = Array.from(keyGrid.querySelectorAll('.inv-slot')).find(s => !s.querySelector('.key'));
  if (!emptySlot) {
    inv.classList.add('full');
    setTimeout(() => inv.classList.remove('full'), 320);
    return;
  }

  const img = createSpriteImg(`key_${type}.png`, `${type} key`);
  img.className = "key";
  img.dataset.type = type;
  img.draggable = true;

  let dragGhost = null;

  img.addEventListener("dragstart", (e) => {
    e.dataTransfer.setData("text/plain", img.dataset.type || "key");
    e.dataTransfer.effectAllowed = "move";

    dragGhost = img.cloneNode(true);
    Object.assign(dragGhost.style, {
      width: "36px", height: "36px", maxWidth: "36px", maxHeight: "36px",
      position: "absolute", top: "-1000px", left: "-1000px", pointerEvents: "none", border:"0"
    });
    document.body.appendChild(dragGhost);
    try { e.dataTransfer.setDragImage(dragGhost, 18, 18); } catch (_){}

    img.classList.add("dragging");
    document.getElementById('smith')?.classList.add('drag-over');
  });

  img.addEventListener("dragend", () => {
    img.classList.remove("dragging");
    document.getElementById('smith')?.classList.remove('drag-over');
    if (dragGhost) { dragGhost.remove(); dragGhost = null; }
  });

  emptySlot.appendChild(img);
}

export function spawnVaultKey(){
  const inv = document.getElementById("inventory");
  const keyGrid = document.getElementById("keys");

  const emptySlot = Array.from(keyGrid.querySelectorAll('.inv-slot')).find(s => !s.querySelector('.key'));
  if (!emptySlot) {
    inv.classList.add('full');
    setTimeout(() => inv.classList.remove('full'), 320);
    return;
  }

  const wrap = document.createElement('div');
  wrap.className = 'key vault-key';
  wrap.dataset.type = 'vault';
  wrap.draggable = true;

  const base = createSpriteImg('key_gold.png', 'Vault Key');
  base.className = 'key-inner';
  base.draggable = false;

  const badge = createSpriteImg('vault.png', 'Vault');
  badge.className = 'badge-vault';
  badge.draggable = false;

  wrap.appendChild(base);
  wrap.appendChild(badge);

  let dragGhost = null;
  wrap.addEventListener('dragstart', (e) => {
    e.dataTransfer.setData('text/plain', 'vault');
    e.dataTransfer.effectAllowed = 'move';

    dragGhost = wrap.cloneNode(true);
    Object.assign(dragGhost.style, {
      width:"36px", height:"36px", maxWidth:"36px", maxHeight:"36px",
      position:"absolute", top:"-1000px", left:"-1000px", pointerEvents:"none"
    });
    document.body.appendChild(dragGhost);
    try { e.dataTransfer.setDragImage(dragGhost, 18, 18); } catch (_){}

    wrap.classList.add('dragging');
  });
  wrap.addEventListener('dragend', () => {
    wrap.classList.remove('dragging');
    if (dragGhost) { dragGhost.remove(); dragGhost = null; }
  });

  emptySlot.appendChild(wrap);
}

export function recallForgeKeysToInventory(){
  const { a, b } = getCombinerSlots();
  const keyArea = document.getElementById("keys");

  [a,b].forEach(slot => {
    const k = slot.querySelector('.key');
    if (!k) return;
    const empty = Array.from(keyArea.querySelectorAll('.inv-slot')).find(s => !s.querySelector('.key'));
    if (empty) empty.appendChild(k); else keyArea.appendChild(k);
    slot.classList.remove('has-key');
  });

  document.dispatchEvent(new CustomEvent('forge:changed'));
}

export function setupDragAndDrop() {
  const trash = document.getElementById("trash");
  const keyArea = document.getElementById("keys");
  const { a:slotA, b:slotB } = getCombinerSlots();
  const smith = document.getElementById('smith');
  const vaultSafe = document.getElementById('vault-safe');

  [slotA, slotB, trash, keyArea, smith, vaultSafe].forEach(area => {
    area.addEventListener("dragover", e => { e.preventDefault(); e.dataTransfer.dropEffect = "move"; });
  });

  [slotA, slotB].forEach((slot) => {
    slot.addEventListener('dragenter', () => slot.classList.add('hover'));
    slot.addEventListener('dragleave', () => slot.classList.remove('hover'));
    slot.addEventListener("drop", e => {
      e.preventDefault();
      slot.classList.remove('hover');
      const dragging = document.querySelector(".dragging");
      if (!dragging) return;
      const t = dragging.dataset.type;
      if (t === 'vault') return;
      if (slot.querySelector('.key')) return;

      slot.appendChild(dragging);
      slot.classList.add('has-key');
      document.dispatchEvent(new CustomEvent('forge:changed'));
      maybeCheckLose();
    });
  });

  trash.addEventListener("drop", e => {
    e.preventDefault();
    document.querySelectorAll(".dragging").forEach(k => k.remove());
    [slotA, slotB].forEach(s => s.classList.toggle('has-key', !!s.querySelector('.key')));
    document.dispatchEvent(new CustomEvent('forge:changed'));
    maybeCheckLose();
  });

  keyArea.addEventListener("drop", e => {
    e.preventDefault();
    const dragging = document.querySelector(".dragging");
    if (!dragging) return;

    const empty = Array.from(keyArea.querySelectorAll('.inv-slot')).find(s => !s.querySelector('.key'));
    if (empty) empty.appendChild(dragging); else keyArea.appendChild(dragging);

    [slotA, slotB].forEach(s => s.classList.toggle('has-key', !!s.querySelector('.key')));
    document.dispatchEvent(new CustomEvent('forge:changed'));
    maybeCheckLose();
  });

  vaultSafe.addEventListener('dragenter', () => vaultSafe.classList.add('hover'));
  vaultSafe.addEventListener('dragleave', () => vaultSafe.classList.remove('hover'));
  vaultSafe.addEventListener('drop', e => {
    e.preventDefault();
    vaultSafe.classList.remove('hover');
    const dragging = document.querySelector('.dragging');
    if (!dragging) return;
    if (dragging.dataset.type !== 'vault') return;

    dragging.remove();
    openPrizeWheel();
  });
}

function getCombinerSlots(){
  const root = document.getElementById('smith');
  return { a: root.querySelector('.drop-slot[data-slot="a"]'), b: root.querySelector('.drop-slot[data-slot="b"]') };
}
