let boards = [];
let validWords = [];
let hiddenLockId = null;     // which specific lock holds the scroll (index in current row)
let currentPath = [];
let selectedLetters = [];
let completedBoards = [];    // session-only rotation

document.addEventListener("DOMContentLoaded", async () => {
  await loadBoards();
  setupBoard();
  setupDragAndDrop();

  // Dismiss simple message popup on click
  document.getElementById('popup')?.addEventListener('click', () => hidePopup());

  // Refit locks on resize
  window.addEventListener('resize', sizeLocksRow);
});

async function loadBoards() {
  const res = await fetch("boards.json");
  boards = await res.json();
}

/* ========== BOARD + LOCKS ========== */
function setupBoard() {
  // mark existing keys as "carried" for the new round
  document.querySelectorAll('#keys .key').forEach(k => {
    k.dataset.carried = "true";
    k.classList.add('carried');
  });

  // choose an unused board (then reset rotation)
  let pool = boards.filter((_, i) => !completedBoards.includes(i));
  if (pool.length === 0) { completedBoards = []; pool = boards.slice(); }
  const board = pool[Math.floor(Math.random() * pool.length)];
  const actualIndex = boards.indexOf(board);
  completedBoards.push(actualIndex);

  // theme
  document.getElementById("theme").textContent = board.theme;

  // valid words
  validWords = board.words.map(w => w.toUpperCase());

  // render letters
  const gridEl = document.getElementById("letter-grid");
  gridEl.innerHTML = "";
  const cols = board.cols || Math.sqrt(board.grid.length) || 5;
  gridEl.style.gridTemplateColumns = `repeat(${cols}, 74px)`;

  for (let i = 0; i < board.grid.length; i++) {
    const div = document.createElement("div");
    div.className = "letter";
    div.textContent = board.grid[i];
    div.dataset.index = i;
    div.dataset.active = "true";
    div.addEventListener("mousedown", startSelect);
    div.addEventListener("mouseenter", continueSelect);
    gridEl.appendChild(div);
  }

  // build locks from the distribution implied by word lengths
  buildDynamicLocks(board.words);

  // ensure single mouseup listener
  document.removeEventListener("mouseup", endSelect);
  document.addEventListener("mouseup", endSelect);
}

function buildDynamicLocks(words) {
  const locksWrap = document.getElementById('locks');
  locksWrap.innerHTML = "";

  // count by length → type
  let wood = 0, stone = 0, gold = 0;
  for (const w of words) {
    const L = w.trim().length;
    if (!L) continue;
    if (L === 3) wood++;
    else if (L === 4) stone++;
    else gold++;
  }

  const lockTypes = [
    ...Array(wood).fill('wood'),
    ...Array(stone).fill('stone'),
    ...Array(gold).fill('gold'),
  ];

  shuffle(lockTypes);
  hiddenLockId = Math.floor(Math.random() * lockTypes.length);

  lockTypes.forEach((type, i) => {
    const lock = document.createElement('div');
    lock.className = 'lock';
    lock.dataset.type = type;
    lock.dataset.id = String(i);
    lock.innerHTML = `<img src="sprites/lock_${type}.png" alt="">`;

    lock.addEventListener("dragover", e => { e.preventDefault(); e.dataTransfer.dropEffect = "move"; });
    lock.addEventListener("drop", e => onLockDrop(e, lock));

    locksWrap.appendChild(lock);
  });

  // Fit the row to one line (shrink if >7)
  sizeLocksRow();
}

/* Fit locks to the same width that 7 full-size locks would use */
function sizeLocksRow() {
  const wrap = document.getElementById('locks');
  if (!wrap) return;

  const count = wrap.children.length;
  const styles = getComputedStyle(wrap);
  const gap = parseInt(styles.gap || 18, 10) || 18;

  const BASE = 86;        // normal lock size (px)
  const MIN  = 48;        // don't get tiny

  // Width that 7 full-size locks would occupy (our target visual width)
  const targetWidth = 7 * BASE + (7 - 1) * gap;

  let size = BASE;
  if (count > 7) {
    // Shrink so c * size + (c-1) * gap == targetWidth (or as close as possible)
    size = Math.floor((targetWidth - (count - 1) * gap) / count);
    size = Math.max(MIN, Math.min(BASE, size));
  }

  wrap.style.setProperty('--lock-size', `${size}px`);
}

async function onLockDrop(e, lock) {
  e.preventDefault();
  const draggingKey = document.querySelector(".dragging");
  const keyType = draggingKey?.dataset.type;
  const lockType = lock.dataset.type;

  lock.classList.add("jiggle");
  setTimeout(() => lock.classList.remove("jiggle"), 500);

  if (!draggingKey) return;

  // strict matching (no overkill)
  if (keyType !== lockType) return;

  // if carried, run durability mini-game first
  if (draggingKey.dataset.carried === "true") {
    const ok = await runDurabilityCheck(keyType);
    if (!ok) { draggingKey.remove(); return; } // shattered
  }

  // consume the key
  draggingKey.remove();

  const isScrollHere = Number(lock.dataset.id) === Number(hiddenLockId);
  if (isScrollHere) {
    showMessage("You've found the scroll!");
    const scroll = document.createElement("img");
    scroll.src = "sprites/scroll.png";
    scroll.style.position = "absolute";
    scroll.style.top = "0";
    scroll.style.left = "0";
    scroll.style.width = "100%";
    lock.appendChild(scroll);
    setTimeout(() => resetGame(), 1500);
  } else {
    lock.classList.add("failed");
    showMessage("Nothing behind this lock...");

    // gold bonus: darken one extra wrong lock
    if (keyType === 'gold') {
      darkenAnotherWrongLock(Number(lock.dataset.id));
    }
  }
}

function darkenAnotherWrongLock(excludeId) {
  const locksWrap = document.getElementById('locks');
  const candidates = Array.from(locksWrap.querySelectorAll('.lock'))
    .filter(l =>
      !l.classList.contains('failed') &&
      Number(l.dataset.id) !== hiddenLockId &&
      Number(l.dataset.id) !== Number(excludeId)
    );
  if (candidates.length === 0) return;
  const pick = candidates[Math.floor(Math.random() * candidates.length)];
  pick.classList.add('failed');
}

/* ========== LETTER DRAG-SELECT ========== */
function startSelect(e) {
  if (e.target.dataset.active !== "true") return;
  e.preventDefault();
  document.body.classList.add('no-select');

  currentPath = [e.target];
  e.target.style.background = "#e8d8b7";
  selectedLetters = [e.target.textContent];
}

function continueSelect(e) {
  if (
    e.buttons &&
    currentPath.length > 0 &&
    !currentPath.includes(e.target) &&
    e.target.dataset.active === "true"
  ) {
    currentPath.push(e.target);
    e.target.style.background = "#e8d8b7";
    selectedLetters.push(e.target.textContent);
  }
}

function endSelect() {
  const word = selectedLetters.join("");

  // valid word → grant key (no popup)
  if (selectedLetters.length >= 3 && validWords.includes(word)) {
    giveKey(word.length);
    markUsedTiles(currentPath);
  } else if (selectedLetters.length >= 3) {
    invalidWordFeedback(currentPath); // visual shake only
  }

  currentPath.forEach(el => el.style.background = "");
  selectedLetters = [];
  currentPath = [];
  document.body.classList.remove('no-select');
}

function markUsedTiles(tiles) {
  tiles.forEach(el => {
    el.dataset.active = "false";
    el.classList.add("used");
  });
}

function invalidWordFeedback(tiles) {
  tiles.forEach(el => {
    el.classList.add("invalid");
    setTimeout(() => el.classList.remove("invalid"), 400);
  });
}

/* ========== KEYS, INVENTORY, COMBINER ========== */
function giveKey(len) {
  const type = len === 3 ? 'wood' : len === 4 ? 'stone' : 'gold';
  const inv = document.getElementById("inventory");
  const keyGrid = document.getElementById("keys");

  // capacity check (5 slots)
  const emptySlot = Array.from(keyGrid.querySelectorAll('.inv-slot')).find(s => !s.querySelector('.key'));
  if (!emptySlot) {
    inv.classList.add('full');
    setTimeout(() => inv.classList.remove('full'), 320);
    return; // drop the reward if full
  }

  const img = document.createElement("img");
  img.src = `sprites/key_${type}.png`;
  img.className = "key";
  img.dataset.type = type;
  img.draggable = true;

  img.addEventListener("dragstart", (e) => {
    e.dataTransfer.setData("text/plain", img.dataset.type || "key");
    e.dataTransfer.effectAllowed = "move";
    img.classList.add("dragging");
  });
  img.addEventListener("dragend", () => img.classList.remove("dragging"));

  emptySlot.appendChild(img);
}

function resetGame() {
  const grid = document.getElementById("letter-grid");
  grid.style.opacity = 0;

  setTimeout(() => {
    grid.style.opacity = 1;
    // keep inventory (carryover)
    setupBoard();
  }, 400);
}

function setupDragAndDrop() {
  const trash = document.getElementById("trash");
  const keyArea = document.getElementById("keys");
  const { a:slotA, b:slotB } = getCombinerSlots();

  [slotA, slotB, trash, keyArea].forEach(area => {
    area.addEventListener("dragover", e => { e.preventDefault(); e.dataTransfer.dropEffect = "move"; });
  });

  [slotA, slotB].forEach(slot => {
    slot.addEventListener("drop", e => {
      e.preventDefault();
      const dragging = document.querySelector(".dragging");
      if (!dragging) return;
      if (slot.querySelector('.key')) return; // one per slot

      slot.appendChild(dragging);
      slot.classList.add('has-key');
      checkCombinerKeys(); // combine if both filled
    });
  });

  trash.addEventListener("drop", e => {
    e.preventDefault();
    document.querySelectorAll(".dragging").forEach(k => k.remove());
    [slotA, slotB].forEach(s => s.classList.toggle('has-key', !!s.querySelector('.key')));
  });

  keyArea.addEventListener("drop", e => {
    e.preventDefault();
    const dragging = document.querySelector(".dragging");
    if (!dragging) return;

    const empty = Array.from(keyArea.querySelectorAll('.inv-slot')).find(s => !s.querySelector('.key'));
    if (empty) empty.appendChild(dragging); else keyArea.appendChild(dragging);

    [slotA, slotB].forEach(s => s.classList.toggle('has-key', !!s.querySelector('.key')));
  });
}

function checkCombinerKeys() {
  const { a:slotA, b:slotB } = getCombinerSlots();
  const k1 = slotA.querySelector('.key');
  const k2 = slotB.querySelector('.key');
  if (!k1 || !k2) return;

  const t1 = k1.dataset.type;
  const t2 = k2.dataset.type;
  if (t1 !== t2) return;

  let upgraded = null;
  if (t1 === "wood") upgraded = "stone";
  else if (t1 === "stone") upgraded = "gold";
  if (!upgraded) return;

  // consume inputs
  k1.remove(); k2.remove();
  slotA.classList.remove('has-key');
  slotB.classList.remove('has-key');

  // create result key (fresh, not carried)
  giveKey(upgraded === "stone" ? 4 : 5);

  // success popup (your phrasing)
  const label = upgraded.charAt(0).toUpperCase() + upgraded.slice(1);
  showMessage(`You've successfully crafted a ${label} key!`);
}

function getCombinerSlots(){
  const c = document.getElementById('combiner');
  return { a: c.querySelector('.slot.a'), b: c.querySelector('.slot.b') };
}

/* ========== DURABILITY MINI-GAME ========== */
function runDurabilityCheck(keyType){
  return new Promise(resolve => {
    const survival = keyType === 'wood' ? 0.25 : keyType === 'stone' ? 0.5 : 0.75; // survive odds
    const breakOdds = 1 - survival;

    const dur = document.getElementById('durability');
    const cursor = document.getElementById('dur-cursor');
    const caption = document.getElementById('dur-caption');
    const red = dur.querySelector('.dur-red');
    const green = dur.querySelector('.dur-green');

    // set bar proportions
    const totalWidth = 320;
    red.style.width = `${Math.round(breakOdds * totalWidth)}px`;
    green.style.width = `${Math.round(survival * totalWidth)}px`;

    // reset cursor & text
    cursor.style.left = `0px`;
    caption.textContent = "Checking durability…";
    dur.classList.remove('hidden');

    // simple left-right wiggle for ~1.2s
    let dir = 1, pos = 0;
    const speed = 6; // px per tick
    const interval = setInterval(() => {
      pos += dir * speed;
      if (pos < 0) { pos = 0; dir = 1; }
      if (pos > totalWidth) { pos = totalWidth; dir = -1; }
      cursor.style.left = `${pos}px`;
    }, 16);

    // pick result
    const succeed = Math.random() < survival;

    setTimeout(() => {
      clearInterval(interval);
      // land cursor inside the success/failed zone
      const min = succeed ? Math.round(breakOdds * totalWidth) + 6 : 6;
      const max = succeed ? totalWidth - 6 : Math.round(breakOdds * totalWidth) - 6;
      const stop = Math.max(6, Math.min(totalWidth-6, Math.floor(min + Math.random()*(max-min))));
      cursor.style.left = `${stop}px`;

      caption.textContent = succeed ? "It holds!" : "It shatters!";
      setTimeout(() => { dur.classList.add('hidden'); resolve(succeed); }, 650);
    }, 1200);
  });
}

/* ========== UTIL & POPUPS ========== */
function shuffle(arr){
  for (let i = arr.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [arr[i], arr[j]] = [arr[j], arr[i]];
  }
  return arr;
}

function showMessage(msg, opts = {}) {
  const popup = document.getElementById('popup');
  const txt = document.getElementById('popup-text');
  if (!popup || !txt) return;
  txt.textContent = msg;
  popup.classList.remove('hidden');
  clearTimeout(window._popupTimer);
  window._popupTimer = setTimeout(() => hidePopup(), opts.sticky ? 2200 : 1600);
}
function hidePopup(){
  document.getElementById('popup')?.classList.add('hidden');
}
