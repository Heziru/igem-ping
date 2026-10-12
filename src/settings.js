import {PINGS,icon,t,applyState,formatTime} from './shared.js';
const api=window.igem;
let activePanel='home', toastTimeout;
const resourceList=[
  ['competition','◎','Competition','iGEM 比赛','The official starting point for every team.','每支队伍的官方起点。','competition.igem.org'],
  ['deliverables','◷','Deliverables & deadlines','提交物与截止日期','Keep up with current requirements and dates.','查看当前提交要求和截止日期。','competition.igem.org'],
  ['registry','⌘','Registry of Parts','生物元件库','Explore the building blocks of synthetic biology.','探索合成生物学的基础元件。','registry.igem.org'],
  ['engineering','↻','Engineering cycle','工程周期','Design. Build. Test. Learn. Repeat.','设计、构建、测试、学习，继续迭代。','technology.igem.org'],
  ['safety','◇','Safety & responsibility','安全与责任','Official policies for responsible participation.','负责任地参赛，查看官方安全政策。','responsibility.igem.org'],
  ['community','♧','iGEM community','iGEM 社区','Meet the people moving biology forward.','认识共同推动生物学进步的人们。','community.igem.org'],
  ['jamboree','✳','Grand Jamboree','全球总决赛','Discover the celebration of synthetic biology.','一起参与合成生物学的年度盛会。','jamboree.igem.org'],
];
function toast(message){const el=document.querySelector('#toast');el.textContent=message;el.hidden=false;clearTimeout(toastTimeout);toastTimeout=setTimeout(()=>el.hidden=true,3000);}
function translate(){
  document.querySelectorAll('[data-en]').forEach(el=>el.textContent=t(el.dataset.en,el.dataset.zh).replaceAll('\\n','\n'));
  document.querySelector('#crumb').textContent=t({home:'Companion',resources:'Resources',preferences:'Preferences'}[activePanel],{home:'桌面伙伴',resources:'官方资源',preferences:'偏好设置'}[activePanel]);
  document.querySelector('#pet-preview').ariaLabel=t('Open ping wheel','打开 Ping 轮盘');
  document.querySelector('#minutes').ariaLabel=t('Focus minutes','专注分钟数');
  document.querySelector('#ping-grid').innerHTML=PINGS.map((p,i)=>`<button class="ping-button" data-ping="${p.id}" style="--ping-color:${p.color}" title="${t(p.detailEn,p.detailZh)}"><span class="ping-number">0${i+1}</span><span class="ping-icon">${icon(p.id,21)}</span><span>${t(p.en,p.zh)}</span></button>`).join('');
  document.querySelector('#resource-grid').innerHTML=resourceList.map(([key,symbol,en,zh,den,dzh,domain])=>`<button class="resource-card" data-link="${key}"><span class="resource-symbol">${symbol}</span><div><strong>${t(en,zh)}</strong><p>${t(den,dzh)}</p><span class="resource-domain">${domain}</span></div>${icon('link',16)}</button>`).join('');
  renderTimer();
}
function render(state){
  applyState(state);
  document.querySelector('#language').value=state.settings.language;
  for(const key of ['sound','petVisible','reducedMotion']) document.getElementById(key).checked=state.settings[key];
  document.querySelector('#petSize').value=state.settings.petSize;
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
  const progress=running?Math.min(360,Math.max(0,(1-remaining/timer.durationMs)*360)):0;
  document.querySelector('#timer-ring').style.setProperty('--progress',`${progress}deg`);
}
function showPanel(id){activePanel=id;document.querySelectorAll('.panel').forEach(p=>p.hidden=p.id!==id);document.querySelectorAll('.nav').forEach(n=>n.classList.toggle('active',n.dataset.panel===id));translate();window.scrollTo(0,0);}
document.querySelectorAll('[data-panel]').forEach(b=>b.onclick=()=>showPanel(b.dataset.panel));
document.querySelectorAll('[data-go]').forEach(b=>b.onclick=()=>showPanel(b.dataset.go));
document.querySelector('#open-wheel').onclick=()=>api.openWheel();
document.querySelector('#pet-preview').onclick=()=>api.openWheel();
document.querySelector('#ping-grid').onclick=e=>{const button=e.target.closest('[data-ping]');if(button)api.ping(button.dataset.ping);};
document.querySelector('#resource-grid').onclick=async e=>{const button=e.target.closest('[data-link]');if(button&&!await api.openLink(button.dataset.link))toast(t('Could not open your browser. Please try again.','无法打开浏览器，请重试。'));};
document.querySelector('#language').onchange=e=>api.updateSettings({language:e.target.value}).then(render);
for(const key of ['sound','petVisible','reducedMotion'])document.getElementById(key).onchange=e=>api.updateSettings({[key]:e.target.checked}).then(render);
document.querySelector('#petSize').onchange=e=>api.updateSettings({petSize:Number(e.target.value)}).then(render);
document.querySelector('#minutes').onchange=e=>{if(e.target.validity.valid)api.updateSettings({focusMinutes:Number(e.target.value)}).then(render);};
document.querySelector('#timer-form').onsubmit=async e=>{e.preventDefault();try{if(window.appState.timer.endsAt)render(await api.stopTimer());else render(await api.startTimer(Number(document.querySelector('#minutes').value)));}catch{toast(t('Enter a whole number between 1 and 180.','请输入 1 到 180 之间的整数。'));}};
document.querySelector('#quit').onclick=()=>api.quit();
api.onState(render);render(await api.getState());setInterval(renderTimer,500);
