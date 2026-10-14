import { icon, t } from './shared.js';

export function createProjectSearch(api, onBack) {
  const panel = document.querySelector('#project-search');
  const form = document.querySelector('#search-form');
  const input = document.querySelector('#search-query');
  const year = document.querySelector('#search-year');
  const results = document.querySelector('#search-results');
  const status = document.querySelector('#search-status');
  const previous = document.querySelector('#search-previous');
  const next = document.querySelector('#search-next');
  let info = null, response = null, query = '', queryYear = null, request = 0, loading = false;
  document.querySelector('#search-back').innerHTML = '<span aria-hidden="true">←</span>';
  document.querySelector('#search-mark').innerHTML = icon('search',22);
  function updateInfo() {
    if (!info) return;
    const years = info.years;
    const ranges = [];
    for (const y of [...years].sort((a,b)=>a-b)) {
      const last = ranges.at(-1);
      if (last && y === last[1] + 1) last[1] = y;
      else ranges.push([y,y]);
    }
    const span = ranges.map(([a,b]) => a===b ? String(a) : `${a}–${b}`).join(', ');
    document.querySelector('#search-coverage-summary').textContent = t(`${info.count.toLocaleString('en')} descriptions · ${span}`,`${info.count.toLocaleString('zh')} 篇项目描述 · ${span}`);
    const date = info.builtAt ? new Intl.DateTimeFormat(t('en-CA','zh-CN'), {year:'numeric',month:'2-digit',day:'2-digit'}).format(new Date(info.builtAt)) : '—';
    document.querySelector('#search-coverage-note').textContent = t(`Snapshot ${date}. Only indexed Project Description pages are searched; missing years and pages are not included.`, `索引日期 ${date}。仅搜索已收录的 Project Description 正文，不包含缺失的年份和页面。`);
    const list = document.querySelector('#search-coverage-years');
    list.replaceChildren();
    for (const item of [...info.coverage].sort((a,b)=>b.year-a.year)) {
      const row = document.createElement('li');
      row.textContent = `${item.year} · ${item.indexed} / ${item.total} ${t('teams','队伍')}`;
      list.append(row);
    }
    const current = year.value;
    year.replaceChildren(new Option(t('All indexed years','全部收录年份'),''),...years.map(y=>new Option(String(y),String(y))));
    year.value = current;
  }
  function updateText() {
    panel.setAttribute('aria-label',t('Project Description search','项目描述检索'));
    document.querySelector('#search-title').textContent = t('Project search','项目检索');
    document.querySelector('#search-subtitle').textContent = t('Search the ideas that came before yours.','从历年的项目中，找到你的下一步。');
    document.querySelector('#search-back').setAttribute('aria-label',t('Back to wheel','返回轮盘'));
    document.querySelector('#search-query-label').textContent = t('Keywords in Project Description','Project Description 正文关键词');
    input.placeholder = t('Try IBD, biosensor, plastic…','试试 IBD、biosensor、plastic…');
    document.querySelector('#search-submit').textContent = t('Search','搜索');
    year.setAttribute('aria-label',t('Filter by year','按年份筛选'));
    document.querySelector('#search-scope').textContent = t('All keywords · whole words · newest first','匹配全部关键词 · 完整词匹配 · 年份从新到旧');
    document.querySelector('#search-directory').textContent = t('Official team directory','官方队伍目录');
    document.querySelector('#search-local').textContent = t('Local search · no account needed','本地检索 · 无需账号');
    document.querySelector('#search-coverage-toggle').textContent = t('Index coverage','查看收录范围');
    previous.textContent = t('Previous','上一页'); next.textContent = t('Next','下一页');
    updateInfo();
    if (response) renderResults();
    else if (!loading) status.textContent = t('Enter keywords to find matching project descriptions.','输入关键词，查找提到它们的项目描述。');
  }
  function renderResults() {
    results.replaceChildren();
    status.textContent = response.total ? t(`${response.total} teams mention “${query}” in their indexed description.`,`${response.total} 支队伍的已收录项目描述提到了“${query}”。`) : t(`No matches in the indexed descriptions for “${query}”. Try the full English term or another year.`,`已收录正文中没有“${query}”的匹配。试试英文全称或其他年份。`);
    for (const result of response.results) {
      const article = document.createElement('article'); article.className='search-result';
      const heading = document.createElement('div'); heading.className='result-heading';
      const team = document.createElement('h2'); team.textContent=result.team;
      const badge = document.createElement('span'); badge.textContent=String(result.year);
      heading.append(team,badge);
      const label = document.createElement('p'); label.className='result-source'; label.textContent='Project Description';
      const snippet = document.createElement('p'); snippet.className='result-snippet';
      let cursor=0;
      for (const [start,end] of result.ranges) {
        snippet.append(document.createTextNode(result.snippet.slice(cursor,start)));
        const mark=document.createElement('mark'); mark.textContent=result.snippet.slice(start,end); snippet.append(mark); cursor=end;
      }
      snippet.append(document.createTextNode(result.snippet.slice(cursor)));
      const open = document.createElement('button'); open.type='button'; open.className='result-open';
      open.textContent=t('Read original description ↗','阅读原始项目描述 ↗');
      open.addEventListener('click',async()=>{
        open.disabled=true;
        try { if (!await api.openProject(result.id)) status.textContent=t('Could not open the page. Please try again.','页面未能打开，请重试。'); }
        catch { status.textContent=t('Could not open the page. Please try again.','页面未能打开，请重试。'); }
        finally { open.disabled=false; }
      });
      article.append(heading,label,snippet,open); results.append(article);
    }
    previous.disabled=response.offset===0;
    next.disabled=response.offset+response.limit>=response.total;
    document.querySelector('#search-pagination').hidden=response.total<=response.limit;
    document.querySelector('#search-page').textContent=`${Math.floor(response.offset/response.limit)+1} / ${Math.max(1,Math.ceil(response.total/response.limit))}`;
  }
  async function run(offset=0, paging=false) {
    const text=paging ? query : input.value.trim();
    const selectedYear=paging ? queryYear : (year.value ? Number(year.value) : null);
    if (text.length<2) { input.focus(); status.textContent=t('Enter at least 2 characters.','请输入至少 2 个字符。'); return; }
    const token=++request; loading=true; previous.disabled=true; next.disabled=true;
    document.querySelector('#search-submit').disabled=true;
    status.textContent=t('Searching descriptions…','正在检索项目描述…');
    try {
      const result=await api.searchProjects({query:text,year:selectedYear,offset});
      if (token!==request) return;
      response=result; info=result.info; query=text; queryYear=selectedYear; renderResults(); results.scrollTop=0;
    } catch {
      if (token===request) {response=null;results.replaceChildren();document.querySelector('#search-pagination').hidden=true;status.textContent=t('The project index could not be searched. Please retry or download the latest release.','项目索引暂时无法检索，请重试或下载最新版本。');}
    } finally {if(token===request){loading=false;document.querySelector('#search-submit').disabled=false;}}
  }
  form.addEventListener('submit',event=>{event.preventDefault();run();});
  year.addEventListener('change',()=>{if(input.value.trim().length>=2)run();});
  previous.addEventListener('click',()=>{if(response&&!loading)run(Math.max(0,response.offset-response.limit),true);});
  next.addEventListener('click',()=>{if(response&&!loading)run(response.offset+response.limit,true);});
  document.querySelector('#search-back').addEventListener('click',onBack);
  document.querySelector('#search-directory').addEventListener('click',()=>api.openLink('projects'));
  return {
    updateText,
    hide(){panel.hidden=true;document.body.classList.remove('search-open');},
    visible(){return !panel.hidden;},
    async show(){
      panel.hidden=false;document.body.classList.add('search-open');updateText();input.focus({preventScroll:true});
      if (!info) {
        loading=true;status.textContent=t('Loading the project index…','正在载入项目索引…');
        try {info=await api.searchInfo();loading=false;updateText();}
        catch {loading=false;status.textContent=t('The index is unavailable. Download the latest release and try again.','项目索引不可用，请下载最新版本后重试。');}
      }
    }
  };
}
