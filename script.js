let boards = [];
let validWords = [];
let hiddenLock = '';
let currentPath = [];
let selectedLetters = [];
let completedBoards = [];
// let completedBoards = JSON.parse(localStorage.getItem("completedBoards") || "[]");

document.addEventListener("DOMContentLoaded", async () => {
  await loadBoards();
  setupLocks();
  setupBoard();
  setupDragAndDrop();
});

async function loadBoards() {
  const res = await fetch("boards.json");
  boards = await res.json();
}

function setupBoard() {
  const gridEl = document.getElementById("letter-grid");
  gridEl.innerHTML = "";

  // Filter boards to only ones not yet used
  const unusedBoards = boards.filter((_, i) => !completedBoards.includes(i));

  if (unusedBoards.length === 0) {
    showMessage("🎉 You've completed all puzzles!");
    // Reset if you want endless mode:
    // completedBoards = [];
    return;
  }

  // Randomly pick one of the unused boards
  const randomIndex = Math.floor(Math.random() * unusedBoards.length);
  const board = unusedBoards[randomIndex];

  // Find actual index in full boards list
  const actualIndex = boards.indexOf(board);
  completedBoards.push(actualIndex);
  // localStorage.setItem("completedBoards", JSON.stringify(completedBoards));

  // Store theme + words
  const grid = board.grid;
  validWords = board.words.map(w => w.toUpperCase());
  hiddenLock = board.scrollLock;
  document.getElementById("theme").textContent = `Theme: ${board.theme}`;

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

document.removeEventListener("mouseup", endSelect);
document.addEventListener("mouseup", endSelect);
}

function startSelect(e) {
  if (e.target.dataset.active !== "true") return;
  e.preventDefault(); // stop native text selection start
  document.body.classList.add('no-select');

  currentPath = [e.target];
  e.target.style.background = "#ccc";
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
    e.target.style.background = "#ccc";
    selectedLetters.push(e.target.textContent);
  }
}

function endSelect() {
  const word = selectedLetters.join("");

  if (selectedLetters.length >= 3 && validWords.includes(word)) {
    giveKey(word.length);
    markUsedTiles(currentPath);
    showMessage(`Found word: ${word}`);
  } else if (selectedLetters.length >= 3) {
    invalidWordFeedback(currentPath);
    showMessage(`"${word}" is not a valid word.`);
  }

  currentPath.forEach(el => el.style.background = "");
  selectedLetters = [];
  currentPath = [];
  document.body.classList.remove('no-select'); // re-enable selection after drag
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
  setupDrag(img);

  const keyGrid = document.getElementById("keys");
  const empty = Array.from(keyGrid.querySelectorAll('.inv-slot')).find(s => !s.querySelector('.key'));
  if (empty) {
    empty.appendChild(img);
  } else {
    // fallback: append at end (if no slots left)
    keyGrid.appendChild(img);
  }
}

function setupLocks() {
  document.querySelectorAll(".lock").forEach(lock => {
    lock.innerHTML = `<img src="sprites/lock_${lock.dataset.type}.png" />`;

    lock.addEventListener("dragover", e => e.preventDefault());
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
          showMessage("🔓 You found the scroll!");
          const scroll = document.createElement("img");
          scroll.src = "sprites/scroll.png";
          scroll.style.position = "absolute";
          scroll.style.top = "0";
          scroll.style.left = "0";
          scroll.style.width = "100%";
          lock.appendChild(scroll);
          setTimeout(() => resetGame(), 2000);
        } else {
          lock.classList.add("failed");
          showMessage("❌ Wrong lock.");
        }
      } else {
        showMessage("❌ That key doesn't fit this lock.");
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

    document.getElementById("keys").innerHTML = "";
    setupLocks();
    setupBoard();
    showMessage("🔁 New round!");
  }, 500);
}

function setupDragAndDrop() {
  const combiner = document.getElementById("combiner");
  const trash = document.getElementById("trash");
  const keyArea = document.getElementById("keys");
  const { a:slotA, b:slotB } = getCombinerSlots();

  // Allow drag over everywhere we drop
  [slotA, slotB, trash, keyArea, ...document.querySelectorAll(".lock")].forEach(area => {
    area.addEventListener("dragover", e => { e.preventDefault(); e.dataTransfer.dropEffect = "move"; });
  });

  // Drop into individual combiner slots
  [slotA, slotB].forEach(slot => {
    slot.addEventListener("drop", e => {
      e.preventDefault();
      const dragging = document.querySelector(".dragging");
      if (!dragging) return;

      // one key per slot
      if (slot.querySelector('.key')) return;

      slot.appendChild(dragging);
      slot.classList.add('has-key');
      checkCombinerKeys(); // try to combine if both filled
    });
  });

  // Trash
  trash.addEventListener("drop", e => {
    e.preventDefault();
    document.querySelectorAll(".dragging").forEach(k => k.remove());
    showMessage("🗑️ Key deleted");
    [slotA, slotB].forEach(s => s.classList.toggle('has-key', !!s.querySelector('.key')));
  });

  // Return to inventory (we’ll target a slot, see section 3)
  keyArea.addEventListener("dragover", e => { e.preventDefault(); e.dataTransfer.dropEffect = "move"; });
  keyArea.addEventListener("drop", e => {
    e.preventDefault();
    const dragging = document.querySelector(".dragging");
    if (!dragging) return;

    // find the closest empty inv slot
    const empty = Array.from(keyArea.querySelectorAll('.inv-slot')).find(s => !s.querySelector('.key'));
    if (empty) empty.appendChild(dragging);
    [slotA, slotB].forEach(s => s.classList.toggle('has-key', !!s.querySelector('.key')));
  });
}

function setupDrag(el) {
  el.addEventListener("dragstart", () => el.classList.add("dragging"));
  el.addEventListener("dragend", () => el.classList.remove("dragging"));
}

function checkCombinerKeys() {
  const combiner = document.getElementById("combiner");
  const keys = combiner.querySelectorAll(".key");

  if (keys.length >= 2) {
    const [k1, k2] = keys;
    const t1 = k1.dataset.type;
    const t2 = k2.dataset.type;

    if (t1 === t2) {
      let upgraded = null;
      if (t1 === "wood") upgraded = "stone";
      else if (t1 === "stone") upgraded = "gold";

      if (upgraded) {
        k1.remove();
        k2.remove();
        giveKey(upgraded === "stone" ? 4 : 5);
        showMessage(`🔁 Combined into a ${upgraded} key!`);
      }
    }
  }
}

function showMessage(msg) {
  document.getElementById("message").textContent = msg;
}

function getCombinerSlots(){
  const c = document.getElementById('combiner');
  return {
    a: c.querySelector('.slot.a'),
    b: c.querySelector('.slot.b')
  };
}

