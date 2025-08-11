export function shuffle(arr){
  for (let i = arr.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [arr[i], arr[j]] = [arr[j], arr[i]];
  }
  return arr;
}

export function createSpriteImg(file, alt = ''){
  const img = new Image();
  img.alt = alt;
  img.src = 'sprites/' + file;
  img.onerror = () => { img.onerror = null; img.src = file; };
  return img;
}

export function installImageFallbacks(){
  const tryResolve = (img) => {
    const src = img.getAttribute('src') || '';
    if (!src) return;
    const file = src.split('/').pop();
    if (!file) return;
    img.onerror = null;
    img.src = src.includes('sprites/') ? file : ('sprites/' + file);
  };

  document.querySelectorAll('img').forEach(img => {
    img.addEventListener('error', () => tryResolve(img));
    if (img.complete && img.naturalWidth === 0) tryResolve(img);
  });
}
