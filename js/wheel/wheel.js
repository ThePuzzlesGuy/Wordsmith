import { state } from '../state.js';
import { createSpriteImg } from '../utils.js';
import { showMessage } from '../ui/ui.js';
import { spawnKey } from '../inventory/inventory.js';
import { openRandomWrong } from '../locks/locks.js';

let spinsLeft = 0;
let wheelAutoReroll = false;
let wheelPostCloseTask = null;

export function initPrizeWheel(){
  const overlay = document.getElementById('wheel-overlay');
  if (!overlay) return;

  const canvas = document.getElementById('wheel-canvas');
  const ctx = canvas.getContext('2d');
  const R = canvas.width/2;
  const C = {x:R, y:R};
  const POINTER_ANGLE = -Math.PI/2;

  const spinBtn = document.getElementById('spinBtn');
  const closeBtn = document.getElementById('wheelCloseBtn');
  const safeDoor = document.getElementById('safeDoor');

  const SPRITES={
    "Gold Key":"key_gold.png",
    "Stone Key":"key_stone.png",
    "Wooden Key":"key_wood.png",
    "Lose a Key":"lose_key.png",
    "Reveal Hint":"lock_gold.png",
    "Scroll Peek":"scroll.png",
    "+1 Spin":"vault.png"
  };

  const PRIZES=[
    {label:"Gold Key",weight:1},
    {label:"Stone Key",weight:5},
    {label:"Reveal Hint",weight:3},
    {label:"Lose a Key",weight:2},
    {label:"Wooden Key",weight:4},
    {label:"Scroll Peek",weight:2},
    {label:"Lose a Key",weight:2},
    {label:"Stone Key",weight:5},
    {label:"+1 Spin",weight:3},
    {label:"Lose a Key",weight:2}
  ];

  let angle = 0, spinning=false;

  function drawPointer(){
    const tipR=R*0.82, baseR=R*0.92, w=R*0.06, ax=POINTER_ANGLE;
    const nx=Math.cos(ax), ny=Math.sin(ax), tx=-ny, ty=nx;
    const tip={x:C.x+nx*tipR,y:C.y+ny*tipR};
    const bl={x:C.x+nx*baseR+tx*w,y:C.y+ny*baseR+ty*w};
    const br={x:C.x+nx*baseR-tx*w,y:C.y+ny*baseR-ty*w};
    ctx.fillStyle="#bfc6d0";
    ctx.beginPath(); ctx.moveTo(tip.x,tip.y); ctx.lineTo(bl.x,bl.y); ctx.lineTo(br.x,br.y); ctx.closePath();
    ctx.shadowColor="rgba(0,0,0,.4)"; ctx.shadowBlur=6; ctx.fill(); ctx.shadowBlur=0;
    ctx.fillStyle="#7e8794"; const capR=w*0.9, capC={x:C.x+nx*(baseR+capR*0.2),y:C.y+ny*(baseR+capR*0.2)};
    ctx.beginPath(); ctx.arc(capC.x,capC.y,capR,0,Math.PI*2); ctx.fill();
  }

  function draw(){
    ctx.clearRect(0,0,canvas.width,canvas.height);
    const bg=ctx.createRadialGradient(C.x,C.y,R*0.2,C.x,C.y,R);
    bg.addColorStop(0,"#2b3246"); bg.addColorStop(1,"#0f1320");
    ctx.fillStyle=bg; ctx.beginPath(); ctx.arc(C.x,C.y,R,0,Math.PI*2); ctx.fill();

    ctx.lineWidth=R*0.06; ctx.strokeStyle="#3a4256"; ctx.beginPath(); ctx.arc(C.x,C.y,R*0.82,0,Math.PI*2); ctx.stroke();
    const rOuter=R*0.78;
    for(let i=0;i<100;i++){
      const a=angle+i*(2*Math.PI/100), isMajor=i%10===0, isMid=!isMajor&&i%5===0;
      const len=isMajor?R*0.07:isMid?R*0.045:R*0.03;
      const ix=C.x+Math.cos(a)*(rOuter-len), iy=C.y+Math.sin(a)*(rOuter-len);
      const ox=C.x+Math.cos(a)*rOuter, oy=C.y+Math.sin(a)*rOuter;
      ctx.strokeStyle=`rgba(231,236,245,${isMajor?1:isMid?0.75:0.55})`; ctx.lineWidth=isMajor?2.2:isMid?1.8:1.2;
      ctx.beginPath(); ctx.moveTo(ix,iy); ctx.lineTo(ox,oy); ctx.stroke();
    }

    const hub=ctx.createRadialGradient(C.x-10,C.y-10,10,C.x,C.y,R*0.45);
    hub.addColorStop(0,"#cdd5df"); hub.addColorStop(1,"#6c778c");
    ctx.fillStyle=hub; ctx.beginPath(); ctx.arc(C.x,C.y,R*0.36,0,Math.PI*2); ctx.fill();
    ctx.fillStyle="#31394d"; ctx.beginPath(); ctx.arc(C.x,C.y,R*0.035,0,Math.PI*2); ctx.fill();

    drawPointer();
  }

  const totalWeight = PRIZES.reduce((s,p)=>s+p.weight,0);
  function pickWeightedIndex(){
    const r = Math.random(); let s = 0;
    for(let i=0;i<PRIZES.length;i++){ s += PRIZES[i].weight/totalWeight; if(r<=s) return i; }
    return PRIZES.length-1;
  }

  function spinToIndex(index){
    const n=PRIZES.length, step=2*Math.PI/n, targetAngleBase=POINTER_ANGLE-index*step-step/2;
    const turns=6+Math.floor(Math.random()*2), current=angle; let target=targetAngleBase;
    while(target>current-2*Math.PI*turns) target-=2*Math.PI;

    const start=performance.now(), dur=3800;
    const ease=t=>1-Math.pow(1-t,3);
    spinning=true;
    spinBtn.disabled=true;
    safeDoor.classList.remove("open","show");
    canvas.classList.remove('hidden');

    (function loop(now){
      const t = Math.max(0, Math.min(1, (now-start)/dur));
      angle = current + (target-current) * ease(t);
      draw();
      if (t<1){ requestAnimationFrame(loop); }
      else { angle=targetAngleBase; draw(); spinning=false; spinBtn.disabled=false; revealPrize(PRIZES[index]); }
    })(performance.now());
  }

  function prizeMessage(label){
    switch(label){
      case 'Gold Key': return 'You won a Gold Key!';
      case 'Stone Key': return 'You won a Stone Key!';
      case 'Wooden Key': return 'You won a Wooden Key!';
      case 'Lose a Key': return 'You lost a random key.';
      case 'Reveal Hint': return 'One wrong lock revealed.';
      case 'Scroll Peek': return 'You peeked at the scroll lock!';
      case '+1 Spin': return '+1 Spin! Spin again.';
      default: return label;
    }
  }

  function revealPrize(p){
    const newImg = createSpriteImg(SPRITES[p.label], p.label);
    newImg.id = 'prizeImg';
    const prev = document.getElementById('prizeImg');
    if (prev) prev.replaceWith(newImg);

    canvas.classList.add("hidden");
    safeDoor.classList.add("show");
    requestAnimationFrame(()=>safeDoor.classList.add("open"));

    applyPrize(p.label);

    updateButtons();

    const msg = prizeMessage(p.label);
    const CLOSE_DELAY = 1100;
    const AFTER_HIDE_DELAY = 550;

    if (wheelAutoReroll) {
      setTimeout(() => {
        wheelAutoReroll = false;
        safeDoor.classList.remove('open','show');
        canvas.classList.remove('hidden');
        const i = pickWeightedIndex();
        spinToIndex(i);
      }, 950);
      return;
    }

    if (spinsLeft > 0) {
      showMessage(msg);
      updateButtons();
    } else {
      setTimeout(() => {
        closeOverlay();
        showMessage(msg);
        if (typeof wheelPostCloseTask === 'function') {
          const fn = wheelPostCloseTask;
          wheelPostCloseTask = null;
          setTimeout(fn, AFTER_HIDE_DELAY);
        }
      }, CLOSE_DELAY);
    }
  }

  function openOverlay(){
    spinsLeft = 1;
    overlay.classList.remove('hidden');
    overlay.setAttribute('aria-hidden','false');
    canvas.classList.remove('hidden');
    safeDoor.classList.remove('open','show');
    draw();
    updateButtons();
  }
  function closeOverlay(){
    safeDoor.classList.remove('open','show');
    overlay.classList.add('hidden');
    overlay.setAttribute('aria-hidden','true');
    spinsLeft = 0;
    wheelAutoReroll = false;
  }

  function updateButtons(){
    if (safeDoor.classList.contains('open')) {
      if (spinsLeft > 0) {
        spinBtn.textContent = 'Spin again';
        spinBtn.disabled = false;
        closeBtn.style.display = 'none';
      } else {
        spinBtn.textContent = 'Spin';
        spinBtn.disabled = true;
        closeBtn.style.display = 'inline-flex';
      }
    } else {
      spinBtn.textContent = 'Spin';
      spinBtn.disabled = spinsLeft <= 0;
      closeBtn.style.display = 'none';
    }
  }

  spinBtn.addEventListener('click', ()=>{
    if (spinning) return;

    if (safeDoor.classList.contains('open')) {
      if (spinsLeft > 0) {
        safeDoor.classList.remove('open','show');
        canvas.classList.remove('hidden');
        updateButtons();
      }
      return;
    }

    if (spinsLeft <= 0) return;
    spinsLeft -= 1;
    const i = pickWeightedIndex();
    spinToIndex(i);
    updateButtons();
  });

  closeBtn.addEventListener('click', closeOverlay);

  openPrizeWheel.open = openOverlay;
  draw();
}

export function openPrizeWheel(){
  if (typeof openPrizeWheel.open === 'function') openPrizeWheel.open();
}

function applyPrize(label){
  switch(label){
    case 'Gold Key': spawnKey('gold'); break;
    case 'Stone Key': spawnKey('stone'); break;
    case 'Wooden Key': spawnKey('wood'); break;
    case '+1 Spin': spinsLeft += 1; break;
    case 'Reveal Hint': openRandomWrong(1); break;
    case 'Scroll Peek': peekScroll(); break;
    case 'Lose a Key':
      wheelPostCloseTask = () => { loseRandomKey(); };
      break;
    default: break;
  }
}

export function loseRandomKey(){
  const keyGrid = document.getElementById('keys');
  if (!keyGrid) return;
  const keys = Array.from(keyGrid.querySelectorAll('.key'));
  if (keys.length === 0) return;

  keys.forEach(k => {
    k.classList.remove('inv-dim','inv-doomed','inv-lit');
    k.classList.add('inv-lit');
  });

  const clearHighlights = () => {
    Array.from(keyGrid.querySelectorAll('.key')).forEach(k => {
      k.classList.remove('inv-dim','inv-doomed','inv-lit');
    });
  };

  if (keys.length === 1) {
    const target = keys[0];
    setTimeout(() => {
      target.classList.add('inv-doomed');
      target.classList.remove('inv-lit');
      setTimeout(() => {
        target.remove();
        setTimeout(clearHighlights, 50);
      }, 300);
    }, 600);
    return;
  }

  const order = keys.sort(()=>Math.random()-0.5);
  const doomed = order[order.length - 1];
  let i = 0;

  const stepTime = 380;
  function step(){
    if (i < order.length - 1) {
      const k = order[i++];
      k.classList.remove('inv-lit');
      k.classList.add('inv-dim');
      setTimeout(step, stepTime);
    } else {
      setTimeout(() => {
        doomed.classList.add('inv-doomed');
        doomed.classList.remove('inv-lit');
        setTimeout(() => {
          doomed.remove();
          setTimeout(clearHighlights, 80);
        }, 320);
      }, 360);
    }
  }
  setTimeout(step, stepTime);
}

function peekScroll(){
  const el = document.querySelector(`.lock[data-id="${state.hiddenLockId}"]`);
  if (el){
    el.classList.add('peek');
    setTimeout(()=> el.classList.remove('peek'), 1600);
  }
}
