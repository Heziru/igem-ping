export const PINGS = [
  { id:'help', color:'#5a88bc', symbol:'?', en:'Need a hand', zh:'来帮个忙', detailEn:'A second pair of eyes on your design.', detailZh:'设计遇到问题，请伙伴一起看看。' },
  { id:'idea', color:'#a484cf', symbol:'✦', en:'New idea', zh:'有个想法', detailEn:'A little spark for the next iteration.', detailZh:'给下一轮工程迭代一点灵感。' },
  { id:'caution', color:'#d7a04c', symbol:'!', en:'Check this', zh:'注意这里', detailEn:'Pause and take a closer look.', detailZh:'先停一下，仔细核对这个地方。' },
  { id:'success', color:'#4d9b73', symbol:'✓', en:'It worked!', zh:'有结果啦', detailEn:'Celebrate the small breakthroughs.', detailZh:'每一个小进展，都值得庆祝。' },
  { id:'focus', color:'#6486a0', symbol:'◷', en:'Focus time', zh:'专注一下', detailEn:'One thing at a time. You have this.', detailZh:'一次做好一件事，慢慢推进。' },
  { id:'break', color:'#d78979', symbol:'☕', en:'Take a break', zh:'休息一下', detailEn:'Rest your eyes. Come back curious.', detailZh:'让眼睛休息一下，带着好奇心回来。' },
];

const paths = {
  help:'<path d="M9 9a3 3 0 1 1 5 2.2c-1.4.8-2 1.3-2 2.8"/><path d="M12 18h.01"/><circle cx="12" cy="12" r="10"/>',
  idea:'<path d="M9 18h6m-5 3h4M8 13a6 6 0 1 1 8 0c-1.2 1-1 2-1 2H9s.2-1-1-2Z"/><path d="M12 1V0M2 8H0m24 0h-2"/>',
  caution:'<path d="m10.3 3-8.5 15a2 2 0 0 0 1.7 3h17a2 2 0 0 0 1.7-3L13.7 3a2 2 0 0 0-3.4 0Z"/><path d="M12 9v4m0 4h.01"/>',
  success:'<path d="m7 12 3 3 7-7"/><circle cx="12" cy="12" r="10"/>',
  focus:'<circle cx="12" cy="13" r="9"/><path d="M12 8v5l3 2M9 1h6m4 3 2 2"/>',
  break:'<path d="M3 8h14v7a5 5 0 0 1-5 5H8a5 5 0 0 1-5-5Zm14 1h2a3 3 0 0 1 0 6h-2M7 1v3m5-3v3M2 23h18"/>',
  link:'<path d="M14 3h7v7m0-7L10 14m0-9H5a2 2 0 0 0-2 2v12a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2v-5"/>',
  settings:'<path d="M4 6h16M4 12h16M4 18h16"/><circle cx="8" cy="6" r="2" fill="currentColor"/><circle cx="16" cy="12" r="2" fill="currentColor"/><circle cx="10" cy="18" r="2" fill="currentColor"/>',
};
export const icon = (name, size=24) => `<svg width="${size}" height="${size}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${paths[name] || paths.idea}</svg>`;
export const t = (en, zh) => window.appState?.settings.language === 'zh' ? zh : en;
export function applyState(state) {
  window.appState = state;
  document.documentElement.lang = state.settings.language === 'zh' ? 'zh-CN' : 'en';
  document.body.classList.toggle('reduced-motion', state.settings.reducedMotion);
  document.documentElement.style.setProperty('--pet-scale', state.settings.petSize);
}
let audio;
export function playSound(id) {
  if (!window.appState?.settings.sound) return;
  try {
    audio ||= new AudioContext();
    audio.resume().catch(() => {});
    const frequency = {help:440,idea:660,caution:330,success:784,focus:523,break:587}[id] || 523;
    for (let i=0; i<2; i++) {
      const o = audio.createOscillator(), g = audio.createGain();
      const now = audio.currentTime + i*.10;
      o.type = 'sine'; o.frequency.value = frequency * (i ? 1.25 : 1);
      g.gain.setValueAtTime(0,now); g.gain.linearRampToValueAtTime(.07,now+.012);
      g.gain.exponentialRampToValueAtTime(.001,now+.19);
      o.connect(g); g.connect(audio.destination); o.start(now); o.stop(now+.20);
      o.onended = () => { o.disconnect(); g.disconnect(); };
    }
  } catch { /* Audio is optional; visual feedback always remains available. */ }
}
export function formatTime(ms) {
  const seconds = Math.max(0,Math.ceil(ms/1000));
  return `${String(Math.floor(seconds/60)).padStart(2,'0')}:${String(seconds%60).padStart(2,'0')}`;
}
