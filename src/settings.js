import {GUIDES,PINGS,icon,t,applyState,formatTime,applyImageSkins} from './shared.js';
const api=window.igem;
let activePanel='home', toastTimeout;
const resourceGroups=[
  {en:'Start and plan',zh:'新手与赛程',items:[
    ['resources','home','Start here','新手入门','Plan your team, roles, lab space and funding.','了解组队、分工、实验空间与经费准备。','competition.igem.org'],
    ['competitionCycle','calendar','The competition cycle','全年比赛流程','Understand the stages of an iGEM season.','了解一个赛季有哪些阶段、每阶段该做什么。','competition.igem.org'],
    ['deliverables','calendar','Timeline & deadlines','赛程与截止日期','See current deliverables and official due dates.','查看本赛季的提交物和官方截止日期。','competition.igem.org'],
    ['submissions','success','My deliverables','我的提交进度','Sign in and select your team to check submission status.','需登录并选择队伍，查看提交状态和截止事项。','teams.igem.org'],
    ['judging','resources','Judge handbook','评审手册','Read the official handbook and understand the judging process.','阅读官方手册，了解评审流程与评审员参考资料。','competition.igem.org'],
    ['medals','success','Medal criteria','奖牌条件','Check the official medal requirements.','核对官方奖牌条件，和评审手册配合阅读。','competition.igem.org'],
    ['rules','safety','Rules & policies','比赛规则与政策','Find the competition’s participation rules.','查阅参赛规则，最新要求以官方为准。','competition.igem.org'],
  ]},
  {en:'Build, upload and submit',zh:'编辑、上传与正式提交',noteEn:'Wiki code goes through iGEM GitLab. Images, documents and fonts use Uploads; video and audio use Video Universe. Uploading a file is not the same as submitting a deliverable.',noteZh:'Wiki 代码通过 iGEM GitLab 发布；图片、文档和字体使用 Uploads；视频与音频使用 Video Universe。上传素材不等于正式提交比赛交付物。',items:[
    ['uploads','link','Submission guides','上传与提交指南','Read the requirements and steps for every deliverable.','先阅读各项交付物的要求和提交步骤。','competition.igem.org'],
    ['wikiGettingStarted','engineering','Edit your wiki','Wiki 编辑入门','Sign in and select your team. Edit and publish with iGEM GitLab.','需登录并选择队伍；通过 iGEM GitLab 编辑与发布 Wiki。','teams.igem.org'],
    ['wikiUploads','link','Upload wiki assets','Wiki 素材上传','Sign in, select your team and activate its wiki. Upload images, documents and fonts.','需登录、选择队伍并激活 Wiki；上传图片、文档与字体。','teams.igem.org'],
    ['video','resources','Video Universe','视频与音频上传','Use iGEM’s media platform; follow each deliverable’s guide.','进入官方媒体平台；按对应交付物指南操作。','video.igem.org'],
  ]},
  {en:'Explore past projects',zh:'寻找历年项目灵感',items:[
    ['projects','community','All-years team directory','全部年份队伍目录','Search teams, institutions and regions, then open a project wiki.','按队名、学校或地区搜索，进入队伍项目 Wiki。','teams.igem.org'],
    ['phoenix','resources','Phoenix project search','Phoenix 项目关键词检索','Search project content in the historical index, covering years through 2022.','检索历史项目内容；官方说明目前仅收录至 2022 年。','community.igem.org'],
    ['previousYears','calendar','Previous competitions','历届赛事档案','Browse official competition archives by year.','按年份浏览官方赛事档案与队伍信息。','competition.igem.org'],
  ]},
  {en:'Keep useful resources close',zh:'常用官方资源',items:[
    ['registry','registry','Registry of Parts','生物元件库','Explore the building blocks of synthetic biology.','探索合成生物学元件。','registry.igem.org'],
    ['engineering','engineering','Engineering cycle','工程周期','Design, build, test and learn.','设计、构建、测试与学习。','technology.igem.org'],
    ['safety','safety','Safety & responsibility','安全与责任','Check the official safety policies.','查阅官方安全政策。','responsibility.igem.org'],
    ['community','community','iGEM community','iGEM 社区','Connect with the worldwide community.','了解全球 iGEM 社区。','community.igem.org'],
    ['jamboree','idea','Grand Jamboree','全球总决赛','Explore the annual celebration of synthetic biology.','了解合成生物学年度盛会。','jamboree.igem.org'],
  ]},
];
function toast(message){const el=document.querySelector('#toast');el.textContent=message;el.hidden=false;applyImageSkins();clearTimeout(toastTimeout);toastTimeout=setTimeout(()=>el.hidden=true,3000);}
function translate(){
  document.querySelectorAll('[data-en]').forEach(el=>el.textContent=t(el.dataset.en,el.dataset.zh).replaceAll('\\n','\n'));
  document.querySelectorAll('[data-icon]').forEach(el=>el.innerHTML=icon(el.dataset.icon));
  document.querySelector('#crumb').textContent=t({home:'Companion',resources:'Resources',preferences:'Preferences'}[activePanel],{home:'桌面伙伴',resources:'官方资源',preferences:'偏好设置'}[activePanel]);
  document.querySelector('#pet-preview').ariaLabel=t('Open iGEM guide','打开 iGEM 导航');
  document.querySelector('#minutes').ariaLabel=t('Focus minutes','专注分钟数');
  document.querySelector('#guide-grid').innerHTML=GUIDES.map(g=>`<button class="guide-button" data-link="${g.linkKey}" title="${t(g.detailEn,g.detailZh)}">${icon(g.icon,44)}<span>${t(g.en,g.zh)}</span></button>`).join('');
  document.querySelector('#ping-grid').innerHTML=PINGS.map((p,i)=>`<button class="ping-button" data-ping="${p.id}" title="${t(p.detailEn,p.detailZh)}"><span class="ping-number">0${i+1}</span><span class="ping-icon">${icon(p.id,44)}</span><span>${t(p.en,p.zh)}</span></button>`).join('');
  document.querySelector('#resource-grid').innerHTML=resourceGroups.map(group=>`<section class="resource-group"><h2>${t(group.en,group.zh)}</h2>${group.noteEn?`<p class="resource-intro">${t(group.noteEn,group.noteZh)}</p>`:''}<div class="resource-items">${group.items.map(([key,image,en,zh,den,dzh,domain])=>`<button class="resource-card" data-link="${key}"><span class="resource-symbol">${icon(image,44)}</span><div><strong>${t(en,zh)}</strong><p>${t(den,dzh)}</p><span class="resource-domain">${domain}</span></div>${icon('link',20)}</button>`).join('')}</div></section>`).join('');
  renderTimer();
  applyImageSkins();
}
function render(state){
  applyState(state);
  document.querySelector('#language-name').textContent=state.settings.language==='en'?'English':'简体中文';
  document.querySelector('#language').ariaLabel=state.settings.language==='en'?'Switch to 简体中文':'Switch to English';
  for(const key of ['sound','petVisible','reducedMotion']) document.getElementById(key).checked=state.settings[key];
  document.querySelectorAll('[data-size]').forEach(button=>{const active=Number(button.dataset.size)===state.settings.petSize;button.classList.toggle('active',active);button.setAttribute('aria-pressed',String(active));});
  if(document.activeElement!==document.querySelector('#minutes')) document.querySelector('#minutes').value=state.settings.focusMinutes;
  const warning=document.querySelector('#shortcut-warning');
  const missing=Object.entries(state.shortcuts).filter(([,ok])=>!ok).map(([key])=>key==='wheel'?'Ctrl + Alt + G':'Ctrl + Alt + P');
  warning.hidden=!missing.length;
  warning.textContent=t(`Shortcut unavailable: ${missing.join(', ')}. Use the companion or tray menu.`,`快捷键暂不可用：${missing.join('、')}。仍可使用桌宠或托盘菜单。`);
  translate();
}
function renderTimer(){
  if(!window.appState)return;
  const {timer,settings}=window.appState, running=Boolean(timer.endsAt);
  const remaining=running?Math.max(0,timer.endsAt-Date.now()):settings.focusMinutes*60000;
  document.querySelector('#timer-display').textContent=formatTime(remaining);
  document.querySelector('#timer-sub').textContent=running?t('ONE SMALL STEP','一步一步，慢慢来'):t('READY TO BEGIN','准备好，就出发');
  document.querySelector('#timer-toggle').textContent=running?t('End session','结束专注'):t('Start focus','开始专注');
  document.querySelector('#minutes').disabled=running;
  applyImageSkins();
}
function showPanel(id){activePanel=id;document.querySelectorAll('.panel').forEach(p=>p.hidden=p.id!==id);document.querySelectorAll('.nav').forEach(n=>n.classList.toggle('active',n.dataset.panel===id));translate();window.scrollTo(0,0);}
document.querySelectorAll('[data-panel]').forEach(b=>b.onclick=()=>showPanel(b.dataset.panel));
document.querySelectorAll('[data-go]').forEach(b=>b.onclick=()=>showPanel(b.dataset.go));
document.querySelector('#open-wheel').onclick=()=>api.openWheel();
document.querySelector('#pet-preview').onclick=()=>api.openWheel();
document.querySelector('#ping-grid').onclick=e=>{const button=e.target.closest('[data-ping]');if(button)api.ping(button.dataset.ping);};
for(const id of ['guide-grid','resource-grid'])document.getElementById(id).onclick=async e=>{const button=e.target.closest('[data-link]');if(button&&!await api.openLink(button.dataset.link))toast(t('Could not open your browser. Please try again.','无法打开浏览器，请重试。'));};
document.querySelector('#language').onclick=()=>api.updateSettings({language:window.appState.settings.language==='en'?'zh':'en'}).then(render);
for(const key of ['sound','petVisible','reducedMotion'])document.getElementById(key).onchange=e=>api.updateSettings({[key]:e.target.checked}).then(render);
document.querySelectorAll('[data-size]').forEach(button=>button.onclick=()=>api.updateSettings({petSize:Number(button.dataset.size)}).then(render));
document.querySelector('#minutes').onchange=e=>{if(e.target.validity.valid)api.updateSettings({focusMinutes:Number(e.target.value)}).then(render);};
document.querySelector('#timer-form').onsubmit=async e=>{e.preventDefault();try{if(window.appState.timer.endsAt)render(await api.stopTimer());else render(await api.startTimer(Number(document.querySelector('#minutes').value)));}catch{toast(t('Enter a whole number between 1 and 180.','请输入 1 到 180 之间的整数。'));}};
document.querySelector('#minimize').onclick=()=>api.minimizeSettings();
document.querySelector('#hide').onclick=()=>api.hideSettings();
document.querySelector('#quit').onclick=()=>api.quit();
api.onState(render);render(await api.getState());setInterval(renderTimer,500);
