let boards = [];
let validWords = [];
let hiddenLock = '';
let currentPath = [];
let selectedLetters = [];
let completedBoards = []; // session-only rotation

document.addEventListener("DOMContentLoaded", async () => {
  await loadBoards();
  setupLocks();
  setupBoard();
  setupDragAndDrop();

  // click anywhere on popup to dismiss
  const popup = document.getElementById('popup');
  popup?.addEventListener('click', () => popup.classList.add('hidden'));
});

async function loadBoards() {
  const res = await fetch("boards.json");
  boards = await res.json();
}

function setupBoard() {
  const gridEl = document.getElementById("letter-grid");
  gridEl.innerHTML = "";

  // choose an unused board
  const unusedBoards = boards.filter((_, i) => !completedBoards.includes(i));
  if (unusedBoards.length === 0) {
    showMessage("You've found the scroll!", { sticky: true }); // end-state message if you want
    return;
  }
  const randomIndex = Math.floor(Math.random() * unusedBoards.length);
  const board = unusedBoards[randomIndex];
  const actualIndex = boards.indexOf(board);
  completedBoards.push(actualIndex);

  // data
  const grid = board.grid;
  validWords = board.words.map(w => w.toUpperCase());
  hiddenLock = board.scrollLock;

  // theme into the sidebar card
  document.getElementById("theme").textContent = board.theme;

  // render letters
  for (let i = 0; i < grid.length; i++) {
    const div = document.createElement("div");
    div.className = "letter";
    div.textContent = grid[i];
    div.dataset.index = i;
    div.dataset.active = "true";
    div.addEventListener("mousedown", startSelect);
    div.addEventListener("mouseenter", continueSelect);
    gridEl.appendChild(div);
  }

  // ensure single mouseup listener
  document.removeEventListener("mouseup", endSelect);
  document.addEventListener("mouseup", endSelect);
}

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

  // Generate key on valid word, but NO popup
  if (selectedLetters.length >= 3 && validWords.includes(word)) {
    giveKey(word.length);
    markUsedTiles(currentPath);
    // no showMessage here
  } else if (selectedLetters.length >= 3) {
    invalidWordFeedback(currentPath);
    // no popup for invalid word per request
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

function giveKey(len) {
  let type = len === 3 ? 'wood' : len === 4 ? 'stone' : 'gold';
  const img = document.createElement("img");
  img.src = `sprites/key_${type}.png`;
  img.className = "key";
  img.dataset.type = type;
  img.draggable = true;

  // reliable dragstart for FF/Edge
  img.addEventListener("dragstart", (e) => {
    e.dataTransfer.setData("text/plain", img.dataset.type || "key");
    e.dataTransfer.effectAllowed = "move";
    img.classList.add("dragging");
  });
  img.addEventListener("dragend", () => img.classList.remove("dragging"));

  const keyGrid = document.getElementById("keys");
  const empty = Array.from(keyGrid.querySelectorAll('.inv-slot')).find(s => !s.querySelector('.key'));
  if (empty) empty.appendChild(img); else keyGrid.appendChild(img);
}

function setupLocks() {
  document.querySelectorAll(".lock").forEach(lock => {
    lock.innerHTML = `<img src="sprites/lock_${lock.dataset.type}.png" />`;

    lock.addEventListener("dragover", e => { e.preventDefault(); e.dataTransfer.dropEffect = "move"; });
    lock.addEventListener("drop", e => {
      e.preventDefault();
      const draggingKey = document.querySelector(".dragging");
      const keyType = draggingKey?.dataset.type;
      const lockType = lock.dataset.type;

      lock.classList.add("jiggle");
      setTimeout(() => lock.classList.remove("jiggle"), 500);

      if (keyType === lockType) {
        draggingKey.remove();
        if (lockType === hiddenLock) {
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
        }
      } else {
        // no popup here; mismatch feedback can be visual jiggle only if you want
      }
    });
  });
}

function resetGame() {
  const grid = document.getElementById("letter-grid");
  grid.style.opacity = 0;

  setTimeout(() => {
    grid.style.opacity = 1;
    document.querySelectorAll(".lock").forEach(lock => {
      lock.classList.remove("failed");
      lock.innerHTML = `<img src="sprites/lock_${lock.dataset.type}.png" />`;
    });

    // clear inventory keys BUT KEEP SLOTS (fixes disappearing slots)
    clearInventoryKeys();

    setupLocks();
    setupBoard();
    // no "new round" popup
  }, 500);
}

function clearInventoryKeys() {
  const keyGrid = document.getElementById("keys");
  keyGrid.querySelectorAll('.key').forEach(k => k.remove());
  // also clear combiner slots
  const { a:slotA, b:slotB } = getCombinerSlots();
  [slotA, slotB].forEach(s => {
    s.querySelectorAll('.key').forEach(k => k.remove());
    s.classList.remove('has-key');
  });
}

function setupDragAndDrop() {
  const trash = document.getElementById("trash");
  const keyArea = document.getElementById("keys");
  const { a:slotA, b:slotB } = getCombinerSlots();

  // Allow drag over on targets
  [slotA, slotB, trash, keyArea, ...document.querySelectorAll(".lock")].forEach(area => {
    area.addEventListener("dragover", e => { e.preventDefault(); e.dataTransfer.dropEffect = "move"; });
  });

  // Drop into individual combiner slots
  [slotA, slotB].forEach(slot => {
    slot.addEventListener("drop", e => {
      e.preventDefault();
      const dragging = document.querySelector(".dragging");
      if (!dragging) return;
      if (slot.querySelector('.key')) return; // one key per slot

      slot.appendChild(dragging);
      slot.classList.add('has-key');
      checkCombinerKeys(); // combine if both filled
    });
  });

  // Trash — no popup, just delete
  trash.addEventListener("drop", e => {
    e.preventDefault();
    document.querySelectorAll(".dragging").forEach(k => k.remove());
    [slotA, slotB].forEach(s => s.classList.toggle('has-key', !!s.querySelector('.key')));
  });

  // Return to inventory: drop anywhere in #keys -> into first empty slot
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

  // output to inventory
  giveKey(upgraded === "stone" ? 4 : 5);

  // success popup with requested phrasing
  const label = upgraded.charAt(0).toUpperCase() + upgraded.slice(1);
  showMessage(`You've successfully crafted a ${label} key!`);
}

function getCombinerSlots(){
  const c = document.getElementById('combiner');
  return {
    a: c.querySelector('.slot.a'),
    b: c.querySelector('.slot.b')
  };
}

/* Popup-based messaging */
function showMessage(msg, opts = {}) {
  const popup = document.getElementById('popup');
  const txt = document.getElementById('popup-text');
  if (!popup || !txt) return;

  txt.textContent = msg;
  popup.classList.remove('hidden');

  clearTimeout(window._popupTimer);
  if (!opts.sticky) {
    window._popupTimer = setTimeout(() => popup.classList.add('hidden'), 1600);
  }
}
