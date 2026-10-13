export const GUIDES = [
  { id:'progress', icon:'calendar', en:'Timeline', zh:'赛程与截止', detailEn:'See this season’s deliverables and upcoming deadlines.', detailZh:'查看本赛季的比赛交付物、时间线与截止日期。', linkKey:'deliverables' },
  { id:'judging', icon:'book', en:'Judge handbook', zh:'评审手册', detailEn:'Read the official handbook to understand the judging process.', detailZh:'阅读官方评审手册，了解评审流程与评审员参考资料。', linkKey:'judging' },
  { id:'uploads', icon:'upload', en:'Submission guides', zh:'上传与提交指南', detailEn:'Check requirements and instructions for each deliverable.', detailZh:'查看各项提交物的要求与操作说明；“资源”轮盘另有 Wiki 素材上传入口。', linkKey:'uploads' },
  { id:'projects', icon:'projects', en:'Past teams', zh:'历届队伍项目', detailEn:'Search all years by team, institution or region, then explore their project wikis.', detailZh:'按队名、学校或地区搜索全部年份队伍，进入项目 Wiki。', linkKey:'projects' },
  { id:'start', icon:'compass', en:'Start here', zh:'新手入门', detailEn:'Plan your team, roles, project, lab space and funding.', detailZh:'从组队、分工、选题、实验空间和经费开始。', linkKey:'resources' },
  { id:'submissions', icon:'checklist', en:'My deliverables', zh:'我的提交进度', detailEn:'Sign in and select your team to check submission status and deadlines.', detailZh:'登录官方账号并选择队伍，查看提交状态和截止事项。', linkKey:'submissions' },
];

export const PINGS = [
  { id:'help', en:'Need a hand', zh:'来帮个忙', detailEn:'A second pair of eyes on your design.', detailZh:'设计遇到问题，请伙伴一起看看。' },
  { id:'idea', en:'New idea', zh:'有个想法', detailEn:'A little spark for the next iteration.', detailZh:'给下一轮工程迭代一点灵感。' },
  { id:'caution', en:'Check this', zh:'注意这里', detailEn:'Pause and take a closer look.', detailZh:'先停一下，仔细核对这个地方。' },
  { id:'success', en:'It worked!', zh:'有结果啦', detailEn:'Celebrate the small breakthroughs.', detailZh:'每一个小进展，都值得庆祝。' },
  { id:'focus', en:'Focus time', zh:'专注一下', detailEn:'One thing at a time. You have this.', detailZh:'一次做好一件事，慢慢推进。' },
  { id:'break', en:'Take a break', zh:'休息一下', detailEn:'Rest your eyes. Come back curious.', detailZh:'让眼睛休息一下，带着好奇心回来。' },
];

const paths = {
 calendar:'<rect x="4" y="5" width="16" height="16" rx="4"/><path d="M8 3v4m8-4v4M4 11h16m-11 4h2m3 0h1m-6 3h2"/>',
 book:'<path d="M12 6c-3-2-6-2-9-1v15c3-1 6-1 9 1 3-2 6-2 9-1V5c-3-1-6-1-9 1Zm0 0v15M6 9l3 1m6 0 3-1"/>',
 upload:'<path d="M12 16V3m-5 5 5-5 5 5M4 14v5a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2v-5"/>',
 projects:'<rect x="3" y="6" width="15" height="14" rx="4"/><path d="M7 3h11a3 3 0 0 1 3 3v10M7 10h7m-7 4h4"/>',
 compass:'<circle cx="12" cy="12" r="9"/><path d="m15.5 8.5-2 5-5 2 2-5 5-2Z"/>',
 checklist:'<rect x="4" y="3" width="16" height="18" rx="4"/><path d="m7 9 1.5 1.5L11 8m3 1h3m-10 6 1.5 1.5L11 14m3 1h3"/>',
 help:'<circle cx="12" cy="12" r="9"/><path d="M9 9a3 3 0 0 1 6 0c0 2-3 2-3 4m0 3h.01"/>',
 idea:'<path d="M8 15a6 6 0 1 1 8 0c-1 1-1 2-1 3H9c0-1 0-2-1-3Zm2 6h4M12 6v3"/>',
 caution:'<path d="m10 4-8 14a2 2 0 0 0 2 3h16a2 2 0 0 0 2-3L14 4a2.3 2.3 0 0 0-4 0ZM12 9v4m0 4h.01"/>',
 success:'<circle cx="12" cy="12" r="9"/><path d="m7.5 12 3 3 6-6"/>',
 focus:'<circle cx="12" cy="13" r="8"/><path d="M12 9v4l3 2M9 2h6m-3 0v3m6 1 1.5-1.5"/>',
 break:'<path d="M4 10h12v5a5 5 0 0 1-5 5H9a5 5 0 0 1-5-5Zm12 0h2a3 3 0 0 1 0 6h-2M7 3v3m5-3v3M3 23h15"/>',
 edit:'<path d="m15 4 5 5M4 15 16 3a2 2 0 0 1 3 0l2 2a2 2 0 0 1 0 3L9 20l-6 1 1-6Z"/>',
 video:'<rect x="3" y="4" width="18" height="16" rx="5"/><path d="m10 8 6 4-6 4V8Z"/>',
 search:'<circle cx="10.5" cy="10.5" r="6.5"/><path d="m16 16 5 5"/>',
 registry:'<path d="M7 3c0 9 10 9 10 18M17 3C17 12 7 12 7 21M7.5 5h9m-7 5h5m-5 4h5m-7 5h9"/>',
 cycle:'<path d="M20 9a8 8 0 0 0-14-4L3 8m0-5v5h5M4 15a8 8 0 0 0 14 4l3-3m0 5v-5h-5"/>',
 medal:'<circle cx="12" cy="15" r="6"/><path d="m8 10-4-7h5l3 6 3-6h5l-4 7M12 13v4m-2-2h4"/>',
 safety:'<path d="M12 2c3 3 5 3 8 4v6c0 5-4 8-8 10-4-2-8-5-8-10V6c3-1 5-1 8-4Zm-4 10 3 3 5-5"/>',
 community:'<circle cx="9" cy="7" r="3"/><path d="M3 21v-2a6 6 0 0 1 12 0v2M16 4a3 3 0 0 1 0 6m2 4a5 5 0 0 1 3 5v2"/>',
 language:'<circle cx="12" cy="12" r="9"/><ellipse cx="12" cy="12" rx="4" ry="9"/><path d="M3 12h18"/>',
 sound:'<path d="m11 4-5 4H3v8h3l5 4V4Zm4 4a6 6 0 0 1 0 8m3-11a10 10 0 0 1 0 14"/>',
 motion:'<path d="M3 7h11a3 3 0 1 0-3-3M3 12h15a3 3 0 1 1-3 3M3 17h5a2 2 0 1 1-2 2"/>',
 size:'<rect x="3" y="10" width="11" height="11" rx="4"/><path d="M9 6V3h12v12h-3M14 3h7v7"/>',
 quit:'<path d="M12 2v10m-5-7a9 9 0 1 0 10 0"/>',
};
export const icon = (name, size=28) => `<svg class="line-icon" width="${Number(size)||28}" height="${Number(size)||28}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true" focusable="false">${paths[name]||paths.compass}</svg>`;
export const RESOURCES = [
 {id:'wikiGettingStarted',icon:'edit',en:'Edit your wiki',zh:'Wiki 编辑',detailEn:'Sign in, select your team, then edit and publish using iGEM GitLab.',detailZh:'登录并选择队伍，通过 iGEM GitLab 编辑和发布 Wiki。'},
 {id:'wikiUploads',icon:'upload',en:'Upload assets',zh:'素材上传',detailEn:'Activate your team wiki, then upload images, documents and fonts.',detailZh:'登录并激活队伍 Wiki 后，上传图片、文档与字体。'},
 {id:'video',icon:'video',en:'Video Universe',zh:'视频与音频',detailEn:'The official media platform. Follow the relevant submission guide.',detailZh:'官方媒体平台；请按对应交付物的提交指南操作。'},
 {id:'previousYears',icon:'projects',en:'Past seasons',zh:'历届赛事',detailEn:'Explore official competition archives by year.',detailZh:'按年份探索官方赛事档案。'},
 {id:'phoenix',icon:'search',en:'Project search',zh:'项目关键词',detailEn:'Phoenix searches historical project content through 2022.',detailZh:'Phoenix 历史项目内容检索，目前收录至 2022 年。'},
 {id:'registry',icon:'registry',en:'Parts Registry',zh:'生物元件库',detailEn:'Explore synthetic biology parts in the official Registry.',detailZh:'在官方 Registry 查找合成生物学元件。'},
 {id:'competitionCycle',icon:'cycle',en:'Season guide',zh:'全年流程',detailEn:'Understand the stages of an iGEM season.',detailZh:'了解每个比赛阶段应当准备的事项。'},
 {id:'medals',icon:'medal',en:'Medal criteria',zh:'奖牌条件',detailEn:'Check official medal requirements alongside the handbook.',detailZh:'核对奖牌条件，并配合评审手册阅读。'},
 {id:'engineering',icon:'cycle',en:'Engineering',zh:'工程周期',detailEn:'Design, build, test and learn.',detailZh:'设计、构建、测试与学习。'},
 {id:'safety',icon:'safety',en:'Safety',zh:'安全与责任',detailEn:'Read official safety and responsibility policies.',detailZh:'查阅官方安全与责任政策。'},
 {id:'community',icon:'community',en:'Community',zh:'iGEM 社区',detailEn:'Connect with the worldwide iGEM community.',detailZh:'了解全球 iGEM 社区。'},
 {id:'jamboree',icon:'compass',en:'Grand Jamboree',zh:'全球总决赛',detailEn:'Explore the annual gathering of the iGEM community.',detailZh:'了解 iGEM 年度盛会。'},
];
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
