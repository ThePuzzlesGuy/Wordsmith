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

  // Simple popup click hides
  document.getElementById('popup')?.addEventListener('click', (e) => {
    if (e.target.id === 'popup') hidePopup();
  });

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

  // build locks from word-length distribution
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

  sizeLocksRow(); // fit single row
}

/* Fit locks to the same width 7 full-size locks would use */
function sizeLocksRow() {
  const wrap = document.getElementById('locks');
  if (!wrap) return;

  const count = wrap.children.length;
  const styles = getComputedStyle(wrap);
  const gap = parseInt(styles.gap || 18, 10) || 18;

  const BASE = 86;        // normal lock size (px)
  const MIN  = 48;        // don't get tiny

  const targetWidth = 7 * BASE + (7 - 1) * gap;

  let size = BASE;
  if (count > 7) {
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

  // LOCK PICK: can open any lock with gamble flow
  if (keyType === 'pick') {
    await handleLockPickDrop(lock, draggingKey);
    return;
  }

  // strict matching for normal keys (gold only opens gold now)
  if (keyType !== lockType) return;

  // carried keys (wood/stone/gold) still have durability rolls, NOT for pick
  if (draggingKey.dataset.carried === "true") {
    const ok = await runDurabilityCheck(keyType);
    if (!ok) { draggingKey.remove(); return; } // shattered
  }

  draggingKey.remove();

  const isScrollHere = Number(lock.dataset.id) === Number(hiddenLockId);
  if (isScrollHere) {
    revealScroll(lock);
  } else {
    lock.classList.add("failed");
    showMessage("Nothing behind this lock...");
  }
}

/* ===== Lock Pick flow ===== */
async function handleLockPickDrop(lock, keyEl){
  // Ask if they want to attempt multiple locks
  const wantMulti = await confirmChoice(
    "Use the lock pick on multiple locks?",
    "Yes, take the risk",
    "No, just this lock"
  );

  if (!wantMulti) {
    // open chosen only
    keyEl.remove();
    openLockSimple(lock, /*announce*/true);
    return;
  }

  // First gamble: 50/50 to prime for 2 uses
  const ok50 = await runGamble(0.5);
  if (!ok50) {
    keyEl.remove();
    showMessage("Lock picking unsuccessful");
    return;
  }

  // Offer second gamble for 3 uses (25% success)
  const tryThree = await confirmChoice(
    "Key is good for 2 uses. Try for 3 uses?",
    "Yes (25% risk)",
    "No, take 2"
  );

  if (!tryThree) {
    keyEl.remove();
    // chosen + 1 random wrong
    openLockSimple(lock, /*announce*/true);
    openRandomWrong(1, [Number(lock.dataset.id)]);
    return;
  }

  const ok25 = await runGamble(0.25);
  if (!ok25) {
    keyEl.remove();
    showMessage("Lock picking unsuccessful");
    return;
  }

  // Success: chosen + 2 wrong
  keyEl.remove();
  openLockSimple(lock, /*announce*/true);
  openRandomWrong(2, [Number(lock.dataset.id)]);
}

/* Open exactly one lock, announcing result (scroll message or single "Nothing...") */
function openLockSimple(lock, announce){
  const isScrollHere = Number(lock.dataset.id) === Number(hiddenLockId);
  if (isScrollHere) {
    revealScroll(lock);
  } else {
    lock.classList.add("failed");
    if (announce) showMessage("Nothing behind this lock...");
  }
}

/* Open N additional wrong locks (no messages), excluding ids in "exclude" */
function openRandomWrong(n, excludeIds = []) {
  const wrap = document.getElementById('locks');
  const candidates = Array.from(wrap.querySelectorAll('.lock'))
    .filter(l =>
      !l.classList.contains('failed') &&
      Number(l.dataset.id) !== hiddenLockId &&
      !excludeIds.includes(Number(l.dataset.id))
    );
  shuffle(candidates);
  candidates.slice(0, n).forEach(l => l.classList.add('failed'));
}

function revealScroll(lock){
  showMessage("You've found the scroll!");
  const scroll = document.createElement("img");
  scroll.src = "sprites/scroll.png";
  scroll.style.position = "absolute";
  scroll.style.top = "0";
  scroll.style.left = "0";
  scroll.style.width = "100%";
  lock.appendChild(scroll);
  setTimeout(() => resetGame(), 1500);
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

  if (selectedLetters.length >= 3 && validWords.includes(word)) {
    giveKey(word.length);
    markUsedTiles(currentPath);
  } else if (selectedLetters.length >= 3) {
    invalidWordFeedback(currentPath);
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
  spawnKey(type);
}

function spawnKey(type){
  const inv = document.getElementById("inventory");
  const keyGrid = document.getElementById("keys");

  const emptySlot = Array.from(keyGrid.querySelectorAll('.inv-slot')).find(s => !s.querySelector('.key'));
  if (!emptySlot) {
    inv.classList.add('full');
    setTimeout(() => inv.classList.remove('full'), 320);
    return;
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
    setupBoard(); // keep inventory (carryover)
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

  // combine mapping: wood->stone, stone->gold, gold->pick
  let result = null;
  if (t1 === "wood") result = "stone";
  else if (t1 === "stone") result = "gold";
  else if (t1 === "gold") result = "pick";

  if (!result) return;

  // consume inputs
  k1.remove(); k2.remove();
  slotA.classList.remove('has-key');
  slotB.classList.remove('has-key');

  // spawn result
  if (result === 'pick') {
    spawnKey('pick');
    showMessage(`You've successfully crafted a Lock Pick!`);
  } else {
    spawnKey(result);
    const label = result.charAt(0).toUpperCase() + result.slice(1);
    showMessage(`You've successfully crafted a ${label} key!`);
  }
}

function getCombinerSlots(){
  const c = document.getElementById('combiner');
  return { a: c.querySelector('.slot.a'), b: c.querySelector('.slot.b') };
}

/* ========== DURABILITY & GAMBLE ========== */
function runDurabilityCheck(keyType){
  return new Promise(resolve => {
    // No durability for lock picks
    if (keyType === 'pick') { resolve(true); return; }

    const survival = keyType === 'wood' ? 0.25 : keyType === 'stone' ? 0.5 : 0.75; // survive odds
    showGambleBar(survival, resolve);
  });
}

function runGamble(successChance){
  return new Promise(resolve => {
    showGambleBar(successChance, resolve);
  });
}

function showGambleBar(successChance, resolve){
  const breakOdds = 1 - successChance;

  const dur = document.getElementById('durability');
  const cursor = document.getElementById('dur-cursor');
  const caption = document.getElementById('dur-caption');
  const red = dur.querySelector('.dur-red');
  const green = dur.querySelector('.dur-green');

  const totalWidth = 320;
  red.style.width = `${Math.round(breakOdds * totalWidth)}px`;
  green.style.width = `${Math.round(successChance * totalWidth)}px`;

  cursor.style.left = `0px`;
  caption.textContent = "Checking durability…";
  dur.classList.remove('hidden');

  let dir = 1, pos = 0;
  const speed = 6;
  const interval = setInterval(() => {
    pos += dir * speed;
    if (pos < 0) { pos = 0; dir = 1; }
    if (pos > totalWidth) { pos = totalWidth; dir = -1; }
    cursor.style.left = `${pos}px`;
  }, 16);

  const succeed = Math.random() < successChance;

  setTimeout(() => {
    clearInterval(interval);
    const min = succeed ? Math.round(breakOdds * totalWidth) + 6 : 6;
    const max = succeed ? totalWidth - 6 : Math.round(breakOdds * totalWidth) - 6;
    const stop = Math.max(6, Math.min(totalWidth-6, Math.floor(min + Math.random()*(max-min))));
    cursor.style.left = `${stop}px`;

    caption.textContent = succeed ? "It holds!" : "It shatters!";
    setTimeout(() => { dur.classList.add('hidden'); resolve(succeed); }, 650);
  }, 1200);
}

/* ========== POPUPS & UTILS ========== */
function showMessage(msg, opts = {}) {
  const popup = document.getElementById('popup');
  const txt = document.getElementById('popup-text');
  const actions = document.getElementById('popup-actions');
  if (!popup || !txt || !actions) return;
  txt.textContent = msg;
  actions.innerHTML = ""; // no buttons
  popup.classList.remove('hidden');
  clearTimeout(window._popupTimer);
  window._popupTimer = setTimeout(() => hidePopup(), 1600);
}
function hidePopup(){ document.getElementById('popup')?.classList.add('hidden'); }

function confirmChoice(message, yesLabel="Yes", noLabel="No"){
  return new Promise(resolve => {
    const popup = document.getElementById('popup');
    const txt = document.getElementById('popup-text');
    const actions = document.getElementById('popup-actions');
    if (!popup || !txt || !actions) { resolve(false); return; }

    txt.textContent = message;
    actions.innerHTML = "";

    const yes = document.createElement('button');
    yes.className = 'btn primary';
    yes.textContent = yesLabel;

    const no = document.createElement('button');
    no.className = 'btn';
    no.textContent = noLabel;

    yes.addEventListener('click', () => { popup.classList.add('hidden'); resolve(true); });
    no.addEventListener('click',  () => { popup.classList.add('hidden'); resolve(false); });

    actions.appendChild(yes);
    actions.appendChild(no);
    popup.classList.remove('hidden');
  });
}

/* Helpers */
function shuffle(arr){
  for (let i = arr.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [arr[i], arr[j]] = [arr[j], arr[i]];
  }
  return arr;
}
