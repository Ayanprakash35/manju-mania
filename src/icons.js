// 16x16 pixel-art item icons (the hotbar, item pickups). Drawn once to canvases, used as data URLs.
const PAL = {
  '.': null, 'k': '#0d0e10', 'd': '#2a2d31', 'g': '#4a4f56', 'l': '#9aa3ab', 'w': '#f1efe8', 'b': '#3f78d2', 'B': '#7fb0ff',
  'o': '#e0702e', 'O': '#ffb27a', 'r': '#c8202a', 'R': '#ff5a4a', 'm': '#9cc9e6', 'M': '#d6ecf8', 'c': '#5a3420', 'C': '#8a5a34', 'y': '#e8b04a',
};
const ART = {
  laptop: [
    '................', '................', '...kkkkkkkkkk...', '...kbbbbbbbbk...', '...kbBbbbbbbk...', '...kbbBbbbbbk...',
    '...kbbbbbbbbk...', '...kbbbbbbbbk...', '...kkkkkkkkkk...', '..kggggggggggk..', '.kglglglglglgk..', 'kgggggggggggggk.',
    'kkkkkkkkkkkkkkk.', '................', '................', '................'],
  tablet: [
    '................', '....kkkkkkkk....', '....kddddddk....', '....koooooOk....', '....kooOoOok....', '....kowwoook....',
    '....kowwwook....', '....kowwoook....', '....kooooOok....', '....koOoooOk....', '....koooooOk....', '....kddddddk....',
    '....kddkkddk....', '....kkkkkkkk....', '................', '................'],
  music: [
    '................', '.....kkkkkk.....', '.....krrrrk.....', '.....kBBBBk.....', '.....kBbbBk.....', '.....kBBBBk.....',
    '.....krrrrk.....', '.....krwwrk.....', '.....kwwwwk.....', '.....kwkkwk.....', '.....kwwwwk.....', '.....krwwrk.....',
    '.....krrrrk.....', '.....kkkkkk.....', '................', '................'],
  mask: [
    '................', '................', '................', '.w............w.', '.w...kkkkkk...w.', '..w.kmmmmmmk.w..',
    '..wkmMMMMMMmkw..', '...kmmmmmmmmk...', '..wkMMMMMMMMkw..', '...kmmmmmmmmk...', '..wkmMMMMMMmkw..', '..w.kmmmmmmk.w..',
    '.w...kkkkkk...w.', '................', '................', '................'],
  food: [
    '................', '................', '..kkkkkkkkkkkk..', '.krrrrrrrrrrrrk.', '.krrkkkkkkkkrrk.', '.krkcCCCCCCckrk.',
    '.krkCyyyyyyCkrk.', '.krkcccccccckrk.', '.krkCCCCCCCCkrk.', '.krkcCCCCCCckrk.', '.krrkkkkkkkkrrk.', '.krwrwrrwrrwrrk.',
    '.krrrrrrrrrrrrk.', '..kkkkkkkkkkkk..', '................', '................'],
};
const cache = {};
export function icon(id, scale = 4) {
  const key = id + scale; if (cache[key]) return cache[key];
  const rows = ART[id]; if (!rows) return '';
  const c = document.createElement('canvas'); c.width = c.height = 16 * scale; const g = c.getContext('2d');
  rows.forEach((row, y) => [...row].forEach((ch, x) => { const col = PAL[ch]; if (col) { g.fillStyle = col; g.fillRect(x * scale, y * scale, scale, scale); } }));
  return (cache[key] = c.toDataURL());
}
