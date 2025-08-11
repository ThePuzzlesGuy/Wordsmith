// Centralized game state
export const state = {
  boards: [],
  validWords: [],
  remainingWords: [],
  hiddenLockId: null,
  currentPath: [],
  selectedLetters: [],
  completedBoards: [],
  currentBoard: null,

  lives: 3,
  scrolls: 0,

  resolvingLoss: false,
  isSelecting: false,

  vaultIndex: -1, // letter index that has the vault badge
};

export function resetTransientState() {
  state.resolvingLoss = false;
  state.currentPath = [];
  state.selectedLetters = [];
  state.validWords = [];
  state.remainingWords = [];
  state.hiddenLockId = null;
  state.vaultIndex = -1;
}
