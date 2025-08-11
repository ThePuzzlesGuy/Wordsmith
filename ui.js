import { state } from './state.js';

let _popupTimer;

export function clearPopupTimer(){ if (_popupTimer){ clearTimeout(_popupTimer); _popupTimer = null; } }

export function showMessage(msg, opts = {}) {
  const popup = document.getElementById('popup'); if (!popup) return;
  if (popup.dataset.dismiss === 'locked') return;
  const txt = document.getElementById('popup-text');
  const actions = document.getElementById('popup-actions');
  clearPopupTimer(); txt.textContent = msg; actions.innerHTML = ""; popup.dataset.dismiss = ""; popup.classList.remove('hidden');
  const duration = (opts && typeof opts.duration === 'number') ? opts.duration : (opts.sticky ? 2200 : 1600);
  _popupTimer = setTimeout(() => hidePopup(), duration);
}

export function showContinue(message, buttonLabel="Continue"){
  return new Promise(resolve => {
    const popup = document.getElementById('popup');
    const txt = document.getElementById('popup-text');
    const actions = document.getElementById('popup-actions');
    if (!popup || !txt || !actions) { resolve(); return; }
    clearPopupTimer(); txt.textContent = message; actions.innerHTML = "";
    const btn = document.createElement('button'); btn.className = 'btn primary'; btn.textContent = buttonLabel;
    btn.addEventListener('click', () => { popup.classList.add('hidden'); popup.dataset.dismiss = ""; resolve(); });
    actions.appendChild(btn);
    popup.dataset.dismiss = "locked"; popup.classList.remove('hidden');
  });
}

export function hidePopup(){ const p = document.getElementById('popup'); if (p?.dataset.dismiss === 'locked') return; clearPopupTimer(); p?.classList.add('hidden'); }

export function confirmChoice(message, yesLabel="Yes", noLabel="No"){
  return new Promise(resolve => {
    const popup = document.getElementById('popup');
    const txt = document.getElementById('popup-text');
    const actions = document.getElementById('popup-actions');
    if (!popup || !txt || !actions) { resolve(false); return; }
    clearPopupTimer(); txt.textContent = message; actions.innerHTML = "";
    const yes = document.createElement('button'); yes.className = 'btn primary'; yes.textContent = yesLabel;
    const no  = document.createElement('button'); no.className  = 'btn'; no.textContent = noLabel;
    yes.addEventListener('click', () => { popup.classList.add('hidden'); popup.dataset.dismiss=""; resolve(true); });
    no .addEventListener('click', () => { popup.classList.add('hidden'); popup.dataset.dismiss=""; resolve(false); });
    popup.dataset.dismiss = "locked"; actions.appendChild(yes); actions.appendChild(no); popup.classList.remove('hidden');
  });
}

export function updateProgressUI(){
  const heartEls = Array.from(document.querySelectorAll('#hearts .heart'));
  heartEls.forEach((el, i) => el.classList.toggle('lost', i >= state.lives));
  const sc = document.getElementById('scroll-count');
  if (sc) sc.textContent = String(state.scrolls);
}
