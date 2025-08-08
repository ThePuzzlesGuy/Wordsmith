let dictionary = new Set();
let currentPath = [];
let selectedLetters = [];
let keys = [];
let hiddenLock = '';
const lockTypes = ['wood', 'stone', 'gold'];

document.addEventListener("DOMContentLoaded", async () => {
  await loadWords();
  setupBoard();
  setupLocks();
  setupDragAndDrop();
});

async function loadWords() {
  const res = await fetch("words.txt");
  const text = await res.text();
  text.split("\n").forEach(w => {
    if (w.length >= 3) dictionary.add(w.trim().toUpperCase());
  });
}

function setupBoard() {
  const grid = document.getElementById("letter-grid");
  grid.innerHTML = "";
  const letters = "ABCDEFGHIJKLMNOPQRSTUVWXYZ";

  for (let i = 0; i < 25; i++) {
    const div = document.createElement("div");
    div.className = "letter";
    div.textContent = letters[Math.floor(Math.random() * letters.length)];
    div.dataset.index = i;
    div.addEventListener("mousedown", startSelect);
    div.addEventListener("mouseenter", continueSelect);
    grid.appendChild(div);
  }

  document.addEventListener("mouseup", endSelect);
}

function startSelect(e) {
  currentPath = [e.target];
  e.target.style.background = "#ccc";
  selectedLetters = [e.target.textContent];
}

function continueSelect(e) {
  if (currentPath.length > 0 && !currentPath.includes(e.target) && e.buttons) {
    currentPath.push(e.target);
    e.target.style.background = "#ccc";
    selectedLetters.push(e.target.textContent);
  }
}

function endSelect() {
  if (selectedLetters.length >= 3) {
    const word = selectedLetters.join("");
    if (dictionary.has(word)) {
      giveKey(word.length);
      showMessage(`Found word: ${word}`);
    }
  }
  currentPath.forEach(el => el.style.background = "");
  selectedLetters = [];
  currentPath = [];
}

function giveKey(len) {
  let type = len === 3 ? 'wood' : len === 4 ? 'stone' : 'gold';
  const img = document.createElement("img");
  img.src = `sprites/key_${type}.png`;
  img.className = "key";
  img.dataset.type = type;
  img.draggable = true;
  document.getElementById("keys").appendChild(img);
  setupDrag(img);
}

function setupLocks() {
  hiddenLock = lockTypes[Math.floor(Math.random() * 3)];
  document.querySelectorAll(".lock").forEach(lock => {
    lock.addEventListener("click", () => tryUnlock(lock));
  });
}

function tryUnlock(lock) {
  const type = lock.dataset.type;
  lock.classList.add("jiggle");

  setTimeout(() => {
    lock.classList.remove("jiggle");
  }, 500);

  if (type === hiddenLock) {
    showMessage("🔓 You found the scroll!");
    const img = document.createElement("img");
    img.src = "sprites/scroll.png";
    img.style.position = "absolute";
    img.style.top = "0";
    img.style.left = "0";
    img.style.width = "100%";
    lock.appendChild(img);
    setTimeout(() => {
      resetGame();
    }, 2000);
  } else {
    lock.classList.add("failed");
    showMessage("❌ Wrong lock.");
  }
}

function resetGame() {
  document.querySelectorAll(".lock").forEach(lock => {
    lock.classList.remove("failed");
    lock.innerHTML = `<img src="sprites/lock_${lock.dataset.type}.png" />`;
  });
  document.getElementById("keys").innerHTML = "";
  setupLocks();
  setupBoard();
  showMessage("🔁 New round!");
}

function setupDragAndDrop() {
  document.querySelectorAll(".key").forEach(setupDrag);
  const combiner = document.getElementById("combiner");
  const trash = document.getElementById("trash");

  [combiner, trash].forEach(area => {
    area.addEventListener("dragover", e => e.preventDefault());
  });

  combiner.addEventListener("drop", e => {
    e.preventDefault();
    const dragged = document.querySelectorAll(".dragging");
    if (dragged.length === 2) {
      const t1 = dragged[0].dataset.type;
      const t2 = dragged[1].dataset.type;
      if (t1 === t2) {
        let upgrade = t1 === "wood" ? "stone" : t1 === "stone" ? "gold" : null;
        if (upgrade) {
          dragged.forEach(k => k.remove());
          giveKey(upgrade === "stone" ? 4 : 5);
          showMessage(`🔁 Combined to make a ${upgrade} key!`);
        }
      }
    }
  });

  trash.addEventListener("drop", e => {
    e.preventDefault();
    document.querySelectorAll(".dragging").forEach(k => k.remove());
    showMessage("🗑️ Key deleted");
  });
}

function setupDrag(el) {
  el.addEventListener("dragstart", () => {
    el.classList.add("dragging");
  });
  el.addEventListener("dragend", () => {
    el.classList.remove("dragging");
  });
}

function showMessage(msg) {
  document.getElementById("message").textContent = msg;
}
