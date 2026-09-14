import { sceneFor } from './scene.js';

const $ = (s) => document.querySelector(s);
const app = $('#app');
const token = $('meta[name="session-token"]').content;
const labels = {normal:'通常',heavy:'多め',reduced:'控えめ',none:'なし',study:'学習',craft:'創作',respect:'本人の意思を尊重',coach:'目標を相談',push:'強く促す',grand:'祖父母',paid:'有料支援',A:'親A',B:'親B'};
const fieldNames = {work:'仕事',care:'世話',bond:'関わり',rest:'休息',self:'自分の時間',domain:'活動の分野',level:'活動の量',sponsor:'活動の担当',style:'関わり方',help:'支援'};
const presetNames = ['好きに付き合う','目標を目指す','余白を作る','親の時間も'];
let state = null, fields = [], presets = {}, config = {}, busy = false, dirty = false;
let pending = null, stale = false, page = 'home', editorOpen = false, recap = [], result = null;
// A server restart may select a different save on the same port.
const pendingKey = `kosodate-pending:${location.origin}:${token}`;
try { pending = JSON.parse(sessionStorage.getItem(pendingKey)); } catch { /* Storage may be unavailable. */ }
const esc = (v) => String(v ?? '').replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const number = (v) => Number(v).toLocaleString('ja-JP');
const age = (months) => `${Math.floor(months / 12)}歳${months % 12 ? `${months % 12}か月` : ''}`;
const paragraphs = (lines) => lines.map(line => `<p>${esc(line)}</p>`).join('');
const observationText = (o) => ['A','B'].includes(o.subject) ? `親${o.subject}に対して：${o.text}` : o.text;
const valueAt = (obj, path) => path.split('.').reduce((o, key) => o[key], obj);
function setAt(obj, path, value) { const keys = path.split('.'); const last = keys.pop(); keys.reduce((o,k) => o[k] ||= {}, obj)[last] = value; }
function error(message = '') { $('#error').hidden = !message; $('#error').textContent = message; }
function remember(packet) { pending = packet; try { packet ? sessionStorage.setItem(pendingKey, JSON.stringify(packet)) : sessionStorage.removeItem(pendingKey); } catch { /* In-memory retry remains available. */ } }
function controls() {
  const locked = busy || !!pending || stale;
  app.setAttribute('aria-busy', String(busy));
  document.querySelectorAll('[data-mutate]').forEach(button => {
    button.disabled = locked || (dirty && !button.hasAttribute('data-draft')) || button.dataset.blocked === 'true';
  });
  document.querySelectorAll('#plan-form input,#plan-form select,#start-form input,#start-form select').forEach(input => input.disabled = locked);
  $('#recovery').hidden = busy || (!pending && !stale);
  $('#retry').hidden = !pending;
  $('#retry').disabled = busy;
  $('#reload').disabled = busy;
  $('#save-status').textContent = busy ? '処理しています…' : pending ? '通信を確認してください' : stale ? '読み直しが必要です' : dirty ? '方針に未保存の変更' : state?.ok ? '保存済み' : 'はじめる準備';
}
async function request(path, packet) {
  const abort = new AbortController();
  const timeout = setTimeout(() => abort.abort(), 40000);
  try {
    const response = await fetch(path, {method: packet ? 'POST' : 'GET', headers: {'Content-Type':'application/json','X-Session-Token':token}, body:packet ? JSON.stringify(packet) : undefined, signal:abort.signal});
    const data = await response.json();
    if (!response.ok) throw new Error(data.message || '画面との接続を確認できませんでした。');
    return data;
  } finally { clearTimeout(timeout); }
}
async function read(command, args = {}) {
  const data = await request('/api/command', {command,args});
  if (!data.response.ok) throw new Error(data.response.error.message);
  return data.response;
}
function apply(data) { state = data.response; presets = data.presets; }
function editable() { if (dirty) { error('先に「方針を保存」するか、編集を取り消してください。'); return false; } return !busy && !pending && !stale; }

async function mutate(command, input, retry = false, extra = {}) {
  if (busy || (!retry && (pending || stale))) return;
  const packet = retry ? pending : {command, args:{request_id:crypto.randomUUID().replaceAll('-',''), ...extra}};
  if (!retry && command !== 'new') packet.args.revision = state.revision;
  if (!retry && input !== undefined) packet.args.input = input;
  remember(packet); busy = true; error(); controls();
  try {
    const data = await request('/api/command', packet);
    remember(null);
    const response = data.response;
    if (!response.ok) {
      stale = response.error.code === 'STALE_REVISION' || response.error.code === 'FINISHED';
      error([stale ? '別の画面またはCLIで更新されています。保存済みの状態を読み直してください。' : response.error.message, ...response.error.details.map(d => d.reason)].join('\n'));
      return;
    }
    apply(data); dirty = false; result = null;
    if (packet.command === 'advance') recap = response.payload.history_added;
    // A retried receipt may describe an older revision; observe the current save.
    if (response.payload?.receipt?.duplicate) apply(await request('/api/command', {command:'observe',args:{}}));
    page = 'home';
    await renderHome();
    if (packet.command === 'advance' || packet.command === 'new') {
      window.scrollTo({top:0,behavior:matchMedia('(prefers-reduced-motion: reduce)').matches ? 'instant' : 'smooth'});
      app.querySelector('h1')?.focus({preventScroll:true});
    }
  } catch (e) {
    error(pending ? '操作結果を受信できませんでした。同じ操作を再試行できます。再試行しても半年は二重に進みません。\n' + e.message : '保存は完了しましたが、表示を更新できませんでした。「いまの暮らし」から開き直してください。\n' + e.message);
  } finally { busy = false; controls(); }
}

function startScreen() {
  app.innerHTML = `<section class="welcome"><h1 tabindex="-1">親になる。<br>予定どおりに、いかなくなる。</h1><p>小さな寝息から、巣立ちの日まで。<br>仕事、休息、ときどき予想外。半年ずつ、家族の暮らしを紡いでいきます。</p><form id="start-form"><label class="field">はじめる家庭<select id="scenario">${config.scenarios.map(s => `<option value="${esc(s.id)}">${esc(s.label)}</option>`).join('')}</select></label><label class="field">偶然の種<input id="seed" type="number" min="0" max="4294967295" step="1" required value="${config.defaults.seed}"></label><button class="primary" data-mutate>この家族ではじめる →</button></form><p class="footnote muted">0歳から20歳まで、全40期。その先に、親の老後と人生の振り返りが続きます。<br>途中で閉じても、保存したところから再開できます。同じ「偶然の種」で運の条件を揃えられます。</p></section>`;
  $('#scenario').value = config.defaults.scenario;
  $('#start-form').onsubmit = e => { e.preventDefault(); mutate('new', undefined, false, {scenario:$('#scenario').value,seed:Number($('#seed').value)}); };
}

function planSummary(plan) {
  return `<table class="plan-summary"><thead><tr><th>時間の使い方</th><th>親A</th><th>親B</th></tr></thead><tbody>${['work','care','bond','rest','self'].map(k => `<tr><th>${fieldNames[k]}</th>${['A','B'].map(p => `<td>${esc(labels[plan.parents[p][k]] || plan.parents[p][k])}</td>`).join('')}</tr>`).join('')}</tbody></table><p class="plan-caption">活動：${esc(labels[plan.activity.domain])} ／ 量${plan.activity.level} ／ 親${plan.activity.sponsor}<br>${esc(labels[plan.style])} ／ 支援：${esc(labels[plan.help])}</p>`;
}
function fieldHtml(field, plan) {
  const name = fieldNames[field.path.split('.').at(-1)] || field.path;
  const value = valueAt(plan, field.path);
  const id = `field-${field.path.replaceAll('.','-')}`;
  const control = field.enum ? `<select id="${id}" data-path="${esc(field.path)}">${field.enum.map(v => `<option value="${esc(v)}" ${v === value ? 'selected' : ''}>${esc(labels[v] || v)}</option>`).join('')}</select>` : `<input id="${id}" data-path="${esc(field.path)}" type="number" min="${field.min}" max="${field.max}" step="1" required value="${value}">`;
  return `<label class="field">${esc(name)}${control}</label>`;
}
function editor(plan) {
  return `<details id="plan-editor" ${editorOpen ? 'open' : ''}><summary>方針を個別に編集</summary><form id="plan-form"><div class="form-fields">${['A','B'].map(p => `<fieldset><legend>親${p}の時間</legend>${fields.filter(f => f.path.startsWith(`parents.${p}.`)).map(f => fieldHtml(f,plan)).join('')}</fieldset>`).join('')}${fields.filter(f => !f.path.startsWith('parents.')).map(f => fieldHtml(f,plan)).join('')}</div><div class="form-actions"><button class="primary" data-mutate data-draft>方針を保存</button><button id="cancel-edit" type="button" data-mutate data-draft>編集を取り消す</button></div><p class="advance-note">保存後に収支と時間の予測を更新します。</p></form></details>`;
}
function forecastHtml(f, pub) {
  return `<section class="forecast"><div class="section-heading"><h3>半年後の家計予測</h3><span>現在 ${number(pub.cash)}万円</span></div><div class="forecast-cash">${number(f.projected_cash)}<small>万円</small></div><p class="cash-formula">収入 ${number(f.income)} − 費用 ${number(f.cost)} 万円</p>${['A','B'].map(p => `<div class="resource-row"><span>親${p}の時間</span><strong>${f.time_used[p]} / ${f.time_limit}</strong></div><progress max="${f.time_limit}" value="${Math.min(f.time_limit,f.time_used[p])}" aria-label="親${p}の使用時間"></progress>`).join('')}<div class="resource-row"><span>家族で分担する世話</span><strong>${f.care_allocated} / ${f.care_required}</strong></div>${f.reasons.length ? `<ul>${f.reasons.map(r => `<li>${esc(r.message)}</li>`).join('')}</ul>` : '<p class="advance-note">準備ができました。この方針で半年を過ごせます。</p>'}<button id="advance" class="primary advance" data-mutate data-blocked="${!f.can_advance}"><span>${pub.time.next_turn === 40 ? '育児の最後の半年を進める' : 'この方針で半年を進める'}</span><span aria-hidden="true">→</span></button><p class="advance-note">${pub.time.next_turn === 40 ? '確定すると老後から最期までをたどり、結末を開きます。' : '方針と回答を確定します。あとから取り消せません。'}<br>珍事による追加支出は最大${f.uncertain_expense_cap}万円（残金の範囲内）。</p></section>`;
}
function eventHtml(event, answers) {
  return `<section class="event"><h3 class="event-title">${esc(event.text)}</h3><div class="options">${event.options.map(o => {
    const selected = answers[event.instance_id] === o.option_id;
    return `<button class="option" data-mutate data-event="${esc(event.instance_id)}" data-option="${esc(o.option_id)}" aria-pressed="${selected}"><span>${esc(o.label)}</span><span class="choice-marker">${selected ? '✓ 選択中' : '○ 選ぶ'}</span><small>費用 ${o.cost} ／ 入金 ${o.income} 万円${o.available ? '' : '<br>配分の調整が必要'}</small></button>`;
  }).join('')}</div></section>`;
}
function familyHtml(pub) {
  return `<section class="family"><div class="section-heading"><h2>家族のようす</h2><span>夫婦の関係 ${pub.couple} / 100</span></div><div class="family-grid">${['A','B'].map(p => `<section><h3>親${p} <span class="muted">${age(pub.parents[p].age_months)}</span></h3><dl class="stats">${Object.entries({stress:'疲労',health:'健康',fulfillment:'充実',social:'交流',regret:'後悔'}).map(([key,label]) => `<div class="stat"><dt>${label}</dt><dd>${pub.parents[p][key]}</dd></div>`).join('')}</dl></section>`).join('')}</div><p class="family-foot">祖父母：体力 ${pub.grandparents.health} ／ 関係 ${pub.grandparents.relation} ／ 資金 ${number(pub.grandparents.funds)}万円<br>地域の知り合い：${pub.grandparents.network ? 'あり' : 'なし'}</p></section>`;
}
function recapHtml() {
  const h = recap.filter(h => h.kind === 'turn').at(-1);
  return h ? `<aside class="recap"><h3>前の半年を振り返る · 第${h.turn}期</h3>${paragraphs(h.text.length ? h.text : ['大きな出来事のない半年。毎日の積み重ねが続いた。'])}${moneyHtml(h.money)}</aside>` : '';
}
function moneyHtml(items) {
  return items.map(m => `<div class="history-money">${esc({household:'家計',A:'親A',B:'親B'}[m.scope] || m.scope)}：${number(m.before)} + 収入${number(m.income)} − 支出${number(m.expense)}${m.cap_overflow ? ` − 計上外${number(m.cap_overflow)}` : ''} = ${number(m.after)}万円</div>`).join('');
}

async function renderHome() {
  navigation('home');
  if (!state) { startScreen(); return; }
  if (!state.ok) { app.innerHTML = '<section class="welcome"><h1>記録を開けませんでした。</h1><p>保存先とGodotの導入状況を確認して、もう一度開いてください。</p><button id="boot-retry">もう一度読み込む</button></section>'; $('#boot-retry').onclick = bootstrap; error(state.error.message); return; }
  if (state.phase === 'finished') { await renderEnding(); return; }
  const pub = state.public, t = pub.time, scene = sceneFor(t);
  const answers = Object.fromEntries(pub.answers.map(a => [a.event_instance,a.option_id]));
  app.innerHTML = `<div class="chapter-header"><div class="age">${age(t.child_months)}<small>${esc(t.season)} · ${esc(t.school_label)}</small></div><div class="progress-wrap"><div class="progress-caption"><span>育児の記録</span><span>${t.next_turn} / 40期</span></div><progress max="40" value="${t.completed_turns}" aria-label="完了した期数"></progress></div></div><div class="workspace"><div class="story-column"><section class="scene" aria-label="今期の情景"><div data-scene-media></div><h1 tabindex="-1">${esc(scene.title)}</h1><p>${esc(scene.text)}</p><p class="season">${esc(scene.season)}</p></section>${recapHtml()}<section class="observations"><div class="section-heading"><h2>子どものようす</h2><span>言葉と行動から見えること</span></div>${paragraphs(pub.observations.map(observationText))}</section><section class="events"><div class="section-heading"><h2>今期の出来事</h2><span>${pub.answers.length} / ${state.choices.length} 回答済み</span></div>${state.choices.length ? state.choices.map(e => eventHtml(e,answers)).join('') : '<p class="muted">今期、回答する出来事はありません。日々の過ごし方を決めましょう。</p>'}</section>${familyHtml(pub)}</div><aside class="planner" aria-label="今期の方針"><div class="section-heading"><h2>今期、どう過ごす？</h2><span>いつでも選び直せます</span></div><div class="presets">${presetNames.map((name,i) => `<button data-mutate data-preset="${i+1}"><span>0${i+1}</span>${name}</button>`).join('')}</div>${planSummary(pub.plan)}${editor(pub.plan)}<div class="plan-tools"><button id="care" data-mutate>世話の配分を合わせる</button><button id="reset-plan" data-mutate>前期の方針へ戻す</button><button id="fallback" data-mutate>基本の配分にする</button></div>${forecastHtml(pub.forecast,pub)}</aside></div>`;
  document.querySelectorAll('[data-preset]').forEach(b => b.onclick = () => mutate('plan',presets[b.dataset.preset]));
  document.querySelectorAll('[data-event]').forEach(b => b.onclick = () => mutate('choose',{event_instance:b.dataset.event,option_id:b.dataset.option}));
  $('#advance').onclick = () => mutate('advance');
  $('#care').onclick = () => { const need = pub.forecast.care_required; mutate('plan',{parents:{A:{care:Math.ceil(need/2)},B:{care:Math.floor(need/2)}}}); };
  $('#reset-plan').onclick = () => mutate('reset-plan');
  $('#fallback').onclick = () => mutate('plan',pub.forecast.fallback_plan);
  $('#plan-editor').ontoggle = e => { editorOpen = e.target.open; };
  $('#plan-form').oninput = () => { dirty = true; controls(); };
  $('#plan-form').onchange = e => {
    dirty = true;
    const domain = $('#field-activity-domain'), level = $('#field-activity-level');
    if (e.target === domain) level.value = domain.value === 'none' ? 0 : Math.max(1,Number(level.value));
    if (e.target === level && Number(level.value) === 0) domain.value = 'none';
    controls();
  };
  $('#plan-form').onsubmit = e => {
    e.preventDefault(); const plan = {};
    document.querySelectorAll('[data-path]').forEach(el => setAt(plan,el.dataset.path,el.type === 'number' ? Number(el.value) : el.value));
    mutate('plan',plan);
  };
  $('#cancel-edit').onclick = () => { dirty = false; renderHome().then(controls); };
  controls();
}

function navigation(current) {
  page = current;
  $('#home-nav').setAttribute('aria-current',current === 'home' ? 'page' : 'false');
  $('#history-nav').setAttribute('aria-current',current === 'history' ? 'page' : 'false');
}
async function historyPage() {
  if (!editable()) return;
  if (!state?.ok) { error('家族の暮らしをはじめると、振り返りが残ります。'); return; }
  busy = true; controls(); error();
  try {
    let items = [], offset = 0;
    do { const response = await read('history',{offset,limit:200}); items.push(...response.payload.items); offset = response.payload.next_offset; } while (offset !== null);
    navigation('history');
    app.innerHTML = `<section class="history-page"><h1 tabindex="-1">家族の振り返り</h1><p class="muted">あの日の選択と、その先にあった暮らし。</p><div class="history-list">${items.length ? [...items].reverse().map(h => `<details class="history-item"><summary>${h.kind === 'turn' ? `第${h.turn}期 · 子ども${age(h.ages.child_months)}` : `その後 · 子ども${age(h.ages.child_months)}`}${h.text[0] ? `<br><small>${esc(h.text[0])}</small>` : ''}</summary>${paragraphs(h.text.length ? h.text : ['大きな出来事のない半年。毎日の積み重ねが続いた。'])}${moneyHtml(h.money)}${h.observations?.length ? `<h3>そのときの子どものようす</h3>${paragraphs(h.observations.map(observationText))}` : ''}${h.related.length ? `<p class="muted">以前の選択とのつながり：${esc(h.related.join('、'))}</p>` : ''}${h.actions?.plan ? `<details><summary>この半年の方針を見る</summary>${planSummary(h.actions.plan)}</details>` : ''}</details>`).join('') : '<p>最初の半年を進めると、ここに記録が残ります。</p>'}</div><button id="history-back">${state.phase === 'finished' ? '結末に戻る' : 'いまの暮らしに戻る'} →</button></section>`;
    $('#history-back').onclick = showHome;
    window.scrollTo(0,0); app.querySelector('h1').focus({preventScroll:true});
  } catch(e) { error(e.message); } finally { busy = false; controls(); }
}
async function renderEnding() {
  if (!result) result = (await read('result')).payload;
  const axes = {relationship:'親密な関係',security:'生活の安心',fulfillment:'自分自身の充実',child_assurance:'子どもへの安心',regret:'後悔'};
  app.innerHTML = `<section class="ending"><div class="section-heading"><h2>この家族が歩んだ人生</h2><span>40期の育児と、その先へ</span></div><div class="ending-story"><h1 tabindex="-1">${esc(result.ending.title)}</h1><p>${esc(result.ending.text)}</p></div><div class="ending-parents">${Object.entries(result.parents).map(([p,r]) => `<section><h2>親${p}の人生</h2><div class="happiness">${r.happiness}<small> / 100 幸福</small></div><p>${esc(r.label)} · ${r.death_age}歳で最期を迎えた</p><div class="axes">${Object.entries(axes).map(([key,name]) => `<div class="axis"><span>${name}</span><span>${r.axes[key]}</span></div>`).join('')}</div><p class="muted">最期の口座 ${number(r.cash)}万円 ／ 健康 ${r.health}</p></section>`).join('')}</div><section class="child-ending"><h2>子どもの人生 · ${result.child.age}歳</h2><dl class="stats">${Object.entries({happiness:'幸福',autonomy:'主体性',social_success:'社会的成果'}).map(([key,name]) => `<div class="stat"><dt>${name}</dt><dd>${result.child[key]}</dd></div>`).join('')}</dl></section>${paragraphs(result.story)}<button class="primary" id="ending-history">老後までの記録を読む →</button><p class="advance-note">この人生は保存されています。いつでも同じ保存先から振り返れます。</p></section>`;
  $('#ending-history').onclick = historyPage;
}
async function showHome() {
  if (!editable()) return;
  busy = true; controls(); error();
  try { if (state?.ok) apply(await request('/api/command',{command:'observe',args:{}})); await renderHome(); window.scrollTo(0,0); app.querySelector('h1')?.focus({preventScroll:true}); } catch(e) { error(e.message); }
  finally { busy = false; controls(); }
}
async function bootstrap() {
  busy = true; controls(); error();
  try {
    config = await request('/api/bootstrap'); fields = config.fields; apply(config);
    $('#save-name').textContent = `保存先：${config.save_name}`;
    // Recover the latest recap through public history, including after reload.
    if (state?.ok && state.public.time.completed_turns > 0 && state.phase !== 'finished') recap = (await read('history',{offset:state.public.time.completed_turns - 1,limit:1})).payload.items;
    await renderHome();
    if (pending) error('前回の操作結果を確認できていません。同じ操作を再試行するか、表示中の保存済み状態を利用してください。');
  } catch(e) {
    app.innerHTML = '<section class="welcome"><h1>画面に接続できませんでした。</h1><p>起動用ターミナルが動いていることを確認してください。</p><button id="boot-retry">もう一度読み込む</button></section>';
    $('#boot-retry').onclick = bootstrap; error(e.message);
  } finally { busy = false; controls(); }
}
$('#home-nav').onclick = showHome;
$('#history-nav').onclick = historyPage;
$('#help-nav').onclick = () => $('#help-dialog').showModal();
$('#help-close').onclick = () => $('#help-dialog').close();
$('#retry').onclick = () => mutate('',undefined,true);
$('#reload').onclick = async () => {
  if (busy) return;
  // Read before dropping an uncertain request; never blindly issue a new write.
  busy = true; controls();
  try { const data = await request('/api/bootstrap'); apply(data); remember(null); stale = false; dirty = false; result = null; error(); await renderHome(); }
  catch(e) { error(e.message); } finally { busy = false; controls(); }
};
window.addEventListener('beforeunload',e => { if (dirty || busy || pending) { e.preventDefault(); e.returnValue = ''; } });
bootstrap();
