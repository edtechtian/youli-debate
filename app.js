import { SIDE_LABELS, STORAGE_KEY, MAX_DEBATERS, TOPIC_BANK, randomTopic, debaterRole, debaterLabel, defaultConfig, presetRounds, validateConfig, totalSeconds, totalMinutes, clockText, DebateTimer } from './core.js';

const $ = id => document.getElementById(id);
const fieldIds = { eventName: 'event-name', topic: 'topic', proName: 'pro-name', conName: 'con-name', proStance: 'pro-stance', conStance: 'con-stance' };
let config = defaultConfig();
let session = null;
let saveTimeout, toastTimeout, audioContext, audioUnavailable = false, notice = '';
let resolveConfirmation = null;
let nativeFullscreenActive = false;
let loadNotice = '';
let topicHistory = [], previousTopic = null;
try { const saved = localStorage.getItem(STORAGE_KEY); if (saved) config = validateConfig(JSON.parse(saved)); }
catch { loadNotice = '无法读取上次的设置，已使用默认模板。可以导入设置备份。'; }

function toast(message, error = false) {
  clearTimeout(toastTimeout); $('toast').textContent = message; $('toast').classList.toggle('error', error); $('toast').hidden = false;
  toastTimeout = setTimeout(() => { $('toast').hidden = true; }, 4500);
}

function confirmAction(title, message) {
  if (resolveConfirmation) resolveConfirmation(false);
  $('confirm-title').textContent = title; $('confirm-message').textContent = message; $('confirm-dialog').showModal();
  return new Promise(resolve => { resolveConfirmation = resolve; });
}

function settleConfirmation(approved) {
  const resolve = resolveConfirmation; resolveConfirmation = null; $('confirm-dialog').close(); resolve?.(approved);
}
$('confirm-ok').addEventListener('click', () => settleConfirmation(true));
$('confirm-cancel').addEventListener('click', () => settleConfirmation(false));
$('confirm-dialog').addEventListener('cancel', event => { event.preventDefault(); settleConfirmation(false); });
$('help-button').addEventListener('click', () => $('help-dialog').showModal());
document.querySelectorAll('[data-close-dialog]').forEach(button => button.addEventListener('click', () => $('help-dialog').close()));
document.querySelector('.brand').addEventListener('click', event => { event.preventDefault(); if (session) returnToSetup(); else window.scrollTo({ top: 0, behavior: 'smooth' }); });

function saveSettings() {
  clearTimeout(saveTimeout);
  try {
    const clean = validateConfig(config); localStorage.setItem(STORAGE_KEY, JSON.stringify(clean));
    $('save-status').classList.remove('error'); $('save-status').querySelector('span').textContent = '设置已自动保存在此浏览器';
    return true;
  } catch (error) {
    $('save-status').classList.add('error');
    $('save-status').querySelector('span').textContent = error instanceof DOMException ? '浏览器无法保存，请使用导出设置备份' : '有环节尚未填完整，完成后自动保存';
    return false;
  }
}
function scheduleSave() { clearTimeout(saveTimeout); saveTimeout = setTimeout(saveSettings, 250); }

function refreshPreview() {
  $('preview-event').textContent = config.eventName.trim() || '中文课堂辩论';
  $('preview-topic').textContent = config.topic.trim() || '一个问题，两种思考。';
  $('preview-pro').textContent = config.proName.trim() || '正方'; $('preview-con').textContent = config.conName.trim() || '反方';
  let people = $('preview-people');
  if (!people) { people = document.createElement('p'); people.id = 'preview-people'; people.className = 'preview-people'; document.querySelector('.preview-match').after(people); }
  people.textContent = `正方 ${config.proDebaters.length} 位辩友 · 反方 ${config.conDebaters.length} 位辩友`;
  $('preview-rounds').textContent = config.rounds.length;
  const validTime = config.rounds.every(round => Number.isInteger(round.seconds) && round.seconds > 0 && round.seconds <= 3599);
  const total = validTime ? totalMinutes(config) : '—';
  $('preview-total').replaceChildren(document.createTextNode(total));
  const unit = document.createElement('small'); unit.textContent = '分钟'; $('preview-total').append(unit);
  $('inline-total').textContent = total;
  $('preview-total').title = validTime ? `准确时长 ${clockText(totalSeconds(config))}（双方环节按每方时长计入）` : '请检查各环节时长';
  const flow = []; const unique = [...new Set(config.rounds.map(round => round.name.trim()).filter(Boolean))];
  unique.slice(0, 4).forEach((name, index) => { if (index) { const arrow = document.createElement('i'); arrow.textContent = '›'; flow.push(arrow); } const span = document.createElement('span'); span.textContent = name; flow.push(span); });
  if (unique.length > 4) flow.push(document.createTextNode(' …'));
  $('preview-flow').replaceChildren(...flow);
  document.querySelectorAll('[data-preset]').forEach(button => { const active = button.dataset.preset === config.preset; button.classList.toggle('active', active); button.setAttribute('aria-pressed', String(active)); });
}

function renderRoundSpeakers(row, round, index) {
  const container = row.querySelector('.round-speaker-picks'); container.replaceChildren();
  for (const side of ['pro', 'con']) {
    if (round.side !== 'both' && round.side !== side) continue;
    const select = document.createElement('select'); select.dataset.field = `${side}Speaker`; select.className = 'speaker-select'; select.dataset.side = side;
    select.setAttribute('aria-label', `第 ${index + 1} 环节${SIDE_LABELS[side]}辩友`);
    for (let position = 0; position <= config[`${side}Debaters`].length; position++) {
      const option = document.createElement('option'); option.value = position; option.textContent = debaterLabel(config, side, position); select.append(option);
    }
    select.value = round[`${side}Speaker`] ?? 0; select.title = debaterLabel(config, side, Number(select.value)); container.append(select);
  }
}

function fitRoundSpeakers() {
  let changed = false;
  for (const round of config.rounds) for (const side of ['pro', 'con']) {
    const key = `${side}Speaker`;
    if (round[key] > config[`${side}Debaters`].length) { round[key] = 0; changed = true; }
  }
  return changed;
}

function renderDebaters(side) {
  const select = $(`${side}-count`); select.replaceChildren();
  for (let count = 1; count <= MAX_DEBATERS; count++) { const option = document.createElement('option'); option.value = count; option.textContent = `${count} 位`; select.append(option); }
  select.value = config[`${side}Debaters`].length;
  const fragment = document.createDocumentFragment();
  config[`${side}Debaters`].forEach((name, index) => {
    const wrapper = document.createElement('div'); wrapper.className = 'debater-input-row';
    const label = document.createElement('label'); label.htmlFor = `${side}-debater-${index + 1}`; label.textContent = debaterRole(side, index + 1);
    const input = document.createElement('input'); input.id = label.htmlFor; input.dataset.debater = index; input.value = name; input.maxLength = 32; input.placeholder = '姓名（选填）'; input.autocomplete = 'off'; input.setAttribute('aria-label', `${debaterRole(side, index + 1)}姓名`);
    wrapper.append(label, input); fragment.append(wrapper);
  });
  $(`${side}-debaters`).replaceChildren(fragment);
}

function renderRoundEditor() {
  const fragment = document.createDocumentFragment();
  config.rounds.forEach((round, index) => {
    const row = document.createElement('div'); row.className = 'round-row'; row.dataset.index = index;
    row.innerHTML = `<div class="round-name-wrap"><span class="round-number"></span><input data-field="name" maxlength="40" required></div><div class="round-side-controls"><select data-field="side"><option value="pro">正方</option><option value="con">反方</option><option value="both">双方</option></select><div class="round-speaker-picks"></div></div><div class="duration-input"><input data-field="minutes" type="number" min="0" max="59" step="1" inputmode="numeric" required><span>:</span><input data-field="seconds" type="number" min="0" max="59" step="1" inputmode="numeric" required><small class="per-side">每方</small></div><div class="row-actions"><button type="button" data-action="up"><svg class="icon"><use href="#i-up"/></svg></button><button type="button" data-action="down"><svg class="icon"><use href="#i-down"/></svg></button><button type="button" data-action="delete"><svg class="icon"><use href="#i-trash"/></svg></button></div>`;
    row.querySelector('.round-number').textContent = String(index + 1).padStart(2, '0');
    const name = row.querySelector('[data-field=name]'); name.value = round.name; name.setAttribute('aria-label', `第 ${index + 1} 环节名称`);
    const side = row.querySelector('select'); side.value = round.side; side.dataset.side = round.side; side.setAttribute('aria-label', `第 ${index + 1} 环节发言方`);
    renderRoundSpeakers(row, round, index);
    const minutes = row.querySelector('[data-field=minutes]'); minutes.value = Number.isFinite(round.seconds) ? Math.floor(round.seconds / 60) : ''; minutes.setAttribute('aria-label', `第 ${index + 1} 环节分钟`);
    const seconds = row.querySelector('[data-field=seconds]'); seconds.value = Number.isFinite(round.seconds) ? round.seconds % 60 : ''; seconds.setAttribute('aria-label', `第 ${index + 1} 环节秒数`);
    row.querySelector('.per-side').hidden = round.side !== 'both';
    for (const [action, label, disabled] of [['up', '上移', index === 0], ['down', '下移', index === config.rounds.length - 1], ['delete', '删除', config.rounds.length === 1]]) {
      const button = row.querySelector(`[data-action=${action}]`); button.setAttribute('aria-label', `${label}第 ${index + 1} 环节`); button.title = `${label}环节`; button.disabled = disabled;
    }
    fragment.append(row);
  });
  $('rounds-editor').replaceChildren(fragment); $('add-round').disabled = config.rounds.length >= 30;
}

function renderSetup() {
  previousTopic = null; $('undo-topic').hidden = true;
  Object.entries(fieldIds).forEach(([key, id]) => { $(id).value = config[key]; });
  $('sound-enabled').checked = config.sound; $('auto-next').checked = config.autoNext;
  for (const side of ['pro', 'con']) renderDebaters(side);
  renderRoundEditor(); refreshPreview();
}

for (const [key, id] of Object.entries(fieldIds)) $(id).addEventListener('input', () => { config[key] = $(id).value; if (key === 'topic') { previousTopic = null; $('undo-topic').hidden = true; } refreshPreview(); scheduleSave(); });
for (const [id, key] of [['sound-enabled', 'sound'], ['auto-next', 'autoNext']]) $(id).addEventListener('change', () => { config[key] = $(id).checked; saveSettings(); });

$('random-topic').addEventListener('click', () => {
  if (!TOPIC_BANK.some(topic => topic !== config.topic.trim() && !topicHistory.includes(topic))) topicHistory = [];
  previousTopic = config.topic; const chosen = randomTopic(config.topic, topicHistory);
  topicHistory = [...new Set([...topicHistory, config.topic.trim(), chosen])]; config.topic = chosen; $('topic').value = chosen; $('undo-topic').hidden = false;
  refreshPreview(); saveSettings();
  toast(config.proStance.trim() || config.conStance.trim() ? '已随机换题，请核对双方观点；也可以撤销换题。' : `已从 ${TOPIC_BANK.length} 道课堂辩题中随机选题，可继续换题或手动修改。`);
});
$('undo-topic').addEventListener('click', () => {
  if (previousTopic === null) return; config.topic = previousTopic; $('topic').value = config.topic; previousTopic = null; $('undo-topic').hidden = true; refreshPreview(); saveSettings(); toast('已恢复上一道辩题。');
});
for (const side of ['pro', 'con']) {
  $(`${side}-count`).addEventListener('change', async () => {
    const count = Number($(`${side}-count`).value), previous = config[`${side}Debaters`];
    if (count < previous.length && previous.slice(count).some(name => name.trim()) && !(await confirmAction(`减少${SIDE_LABELS[side]}辩友人数？`, '超出新人数的姓名将被移除，对应的环节发言人会改为全队。其他设置会保留。'))) { $(`${side}-count`).value = previous.length; return; }
    config[`${side}Debaters`] = Array.from({ length: count }, (_, index) => previous[index] || '');
    const adjusted = fitRoundSpeakers(); renderDebaters(side); renderRoundEditor(); refreshPreview(); saveSettings();
    if (adjusted) toast('人数已调整，超出人数的环节已改为全队发言。');
  });
  $(`${side}-debaters`).addEventListener('input', event => {
    const input = event.target.closest('[data-debater]'); if (!input) return;
    config[`${side}Debaters`][Number(input.dataset.debater)] = input.value;
    document.querySelectorAll('.round-row').forEach((row, index) => renderRoundSpeakers(row, config.rounds[index], index)); scheduleSave();
  });
}

document.querySelectorAll('[data-topic]').forEach(button => button.addEventListener('click', async () => {
  if (config.topic.trim() && config.topic !== button.dataset.topic && !(await confirmAction('更换辩题？', '这会替换当前输入的辩论题目，队伍和环节设置会保留。'))) return;
  config.topic = button.dataset.topic; $('topic').value = config.topic; previousTopic = null; $('undo-topic').hidden = true; refreshPreview(); saveSettings(); $('topic').focus();
}));
document.querySelectorAll('[data-preset]').forEach(button => button.addEventListener('click', async () => {
  if (config.preset === button.dataset.preset) return;
  if (config.preset === 'custom' && !(await confirmAction('使用新的赛制模板？', '这会替换自定义环节和时长。辩题与队伍设置会保留。'))) return;
  config.rounds = presetRounds(button.dataset.preset); fitRoundSpeakers(); config.preset = button.dataset.preset; renderRoundEditor(); refreshPreview(); saveSettings();
}));

function updateRoundFromInput(event) {
  const row = event.target.closest('.round-row'); if (!row || !event.target.dataset.field) return;
  const round = config.rounds[Number(row.dataset.index)]; const field = event.target.dataset.field;
  if (field === 'name') round.name = event.target.value;
  else if (field === 'side') { round.side = event.target.value; event.target.dataset.side = round.side; row.querySelector('.per-side').hidden = round.side !== 'both'; renderRoundSpeakers(row, round, Number(row.dataset.index)); }
  else if (field === 'proSpeaker' || field === 'conSpeaker') { round[field] = Number(event.target.value); event.target.title = debaterLabel(config, field === 'proSpeaker' ? 'pro' : 'con', round[field]); }
  else {
    const minutes = row.querySelector('[data-field=minutes]'), seconds = row.querySelector('[data-field=seconds]');
    seconds.setCustomValidity('');
    round.seconds = minutes.value === '' || seconds.value === '' || !minutes.validity.valid || !seconds.validity.valid ? NaN : Number(minutes.value) * 60 + Number(seconds.value);
    seconds.setCustomValidity(Number.isFinite(round.seconds) && round.seconds === 0 ? '时长至少为 1 秒。' : '');
  }
  if (field !== 'proSpeaker' && field !== 'conSpeaker') config.preset = 'custom'; refreshPreview(); scheduleSave();
}
$('rounds-editor').addEventListener('input', updateRoundFromInput);
$('rounds-editor').addEventListener('change', event => { if (event.target.matches('select')) updateRoundFromInput(event); });
$('rounds-editor').addEventListener('click', event => {
  const button = event.target.closest('[data-action]'); if (!button || button.disabled) return;
  const index = Number(button.closest('.round-row').dataset.index), action = button.dataset.action;
  if (action === 'delete') config.rounds.splice(index, 1);
  else { const next = index + (action === 'up' ? -1 : 1); [config.rounds[index], config.rounds[next]] = [config.rounds[next], config.rounds[index]]; }
  config.preset = 'custom'; renderRoundEditor(); refreshPreview(); saveSettings();
});
$('add-round').addEventListener('click', () => {
  if (config.rounds.length >= 30) return;
  config.rounds.push({ name: '补充发言', side: 'both', seconds: 60, proSpeaker: 0, conSpeaker: 0 }); config.preset = 'custom'; renderRoundEditor(); refreshPreview(); saveSettings();
  $('rounds-editor').lastElementChild.querySelector('input').focus();
});

$('export-config').addEventListener('click', () => {
  try {
    const clean = validateConfig(config); const blob = new Blob([JSON.stringify(clean, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob), link = document.createElement('a'); link.href = url; link.download = '有理-辩论设置.json'; document.body.append(link); link.click(); link.remove(); setTimeout(() => URL.revokeObjectURL(url), 1000);
    toast('设置已导出，可以保存备份或在另一台电脑导入。');
  } catch (error) { toast(error.message, true); }
});
$('import-config').addEventListener('click', () => $('config-file').click());
$('config-file').addEventListener('change', async event => {
  const file = event.target.files?.[0]; if (!file) return;
  try {
    if (file.size > 150000) throw new Error('文件过大，请选择有理导出的设置文件。');
    let parsed; try { parsed = JSON.parse(await file.text()); } catch { throw new Error('文件不是有效的 JSON，无法导入。'); }
    const imported = validateConfig(parsed);
    if (await confirmAction('导入这份辩论设置？', `导入后将替换当前设置：${imported.topic || '未填写辩题'}，共 ${imported.rounds.length} 个环节，预计 ${totalMinutes(imported)} 分钟。`)) {
      config = imported; renderSetup(); saveSettings(); toast('导入成功，可以继续修改或进入赛场。');
    }
  } catch (error) { toast(error.message, true); }
  finally { event.target.value = ''; }
});

async function unlockAudio() {
  if (!config.sound) return;
  try { const Audio = window.AudioContext || window.webkitAudioContext; if (!Audio) throw new Error('Audio unavailable'); audioContext ||= new Audio(); if (audioContext.state === 'suspended') await audioContext.resume(); }
  catch { if (!audioUnavailable) toast('浏览器无法播放提示音，请留意屏幕上的时间提醒。', true); audioUnavailable = true; }
}
function beep(end = false) {
  if (!config.sound || !audioContext || audioContext.state !== 'running') return;
  try {
    for (let index = 0; index < (end ? 3 : 1); index++) {
      const oscillator = audioContext.createOscillator(), gain = audioContext.createGain(), start = audioContext.currentTime + index * .29;
      oscillator.type = 'sine'; oscillator.frequency.value = end ? 660 : 880; gain.gain.setValueAtTime(0, start); gain.gain.linearRampToValueAtTime(.18, start + .02); gain.gain.exponentialRampToValueAtTime(.001, start + .23);
      oscillator.connect(gain); gain.connect(audioContext.destination); oscillator.start(start); oscillator.stop(start + .25);
    }
  } catch { /* Visual time warnings remain available. */ }
}

$('debate-form').addEventListener('submit', event => {
  event.preventDefault();
  if (!$('debate-form').reportValidity()) return;
  try { config = validateConfig(config, { requireTopic: true }); } catch (error) { toast(error.message, true); return; }
  saveSettings(); unlockAudio(); session = new DebateTimer(config); notice = ''; enterArena();
});

function enterArena() {
  $('setup-view').hidden = true; $('arena-view').hidden = false; $('complete-view').hidden = true; document.body.classList.add('in-arena');
  $('arena-event').textContent = config.eventName || '中文课堂辩论'; $('arena-topic').textContent = config.topic;
  for (const side of ['pro', 'con']) { $(`arena-${side}-name`).textContent = config[`${side}Name`] || SIDE_LABELS[side]; $(`arena-${side}-stance`).textContent = config[`${side}Stance`]; }
  for (const side of ['pro', 'con']) {
    if (!$(`arena-${side}-speaker`)) { const label = document.createElement('span'); label.id = `arena-${side}-speaker`; label.className = 'arena-speaker'; $(`arena-${side}-name`).after(label); }
  }
  $('agenda-total').textContent = `${config.rounds.length} 个环节`;
  const fragment = document.createDocumentFragment();
  config.rounds.forEach((round, index) => {
    const button = document.createElement('button'); button.type = 'button'; button.className = 'agenda-item'; button.dataset.round = index;
    button.innerHTML = '<span class="agenda-number"></span><span><strong></strong><small></small></span><span class="agenda-side"></span>';
    button.querySelector('.agenda-number').textContent = String(index + 1).padStart(2, '0'); button.querySelector('strong').textContent = round.name;
    const speaker = round.side === 'both' ? '双方' : debaterLabel(config, round.side, round[`${round.side}Speaker`]);
    button.querySelector('small').textContent = `${clockText(round.seconds)}${round.side === 'both' ? ' / 每方' : ''} · ${speaker}`;
    const badge = button.querySelector('.agenda-side'); badge.textContent = SIDE_LABELS[round.side]; badge.classList.add(round.side);
    button.setAttribute('aria-label', `进入第 ${index + 1} 环节：${round.name}，${SIDE_LABELS[round.side]}`);
    fragment.append(button);
  });
  $('arena-agenda').replaceChildren(fragment); updateSoundButton(); updateArena(); window.scrollTo(0, 0); $('toggle-timer').focus({ preventScroll: true });
}

function handleTimerEvents(events) {
  if (events.warning) { beep(); notice = `${SIDE_LABELS[events.warning]}还剩 30 秒，请留意时间。`; }
  if (events.endedSide) {
    beep(true); notice = `${SIDE_LABELS[events.endedSide]}发言时间已结束。`;
    if (events.roundEnded) {
      if (config.autoNext && session.index < config.rounds.length - 1) { const name = session.round.name; session.select(session.index + 1, performance.now()); notice = `「${name}」已结束，已进入下一环节，等待开始。`; }
      else notice += session.index === config.rounds.length - 1 ? '最后一个环节已结束，点击「结束辩论」完成本场。' : '请由主持人切换下一环节。';
    } else notice += '请切换到另一方继续，点击开始计时。';
  }
}

function updateArena() {
  if (!session || session.finished) return;
  const round = session.round, state = session.state, active = state.active;
  $('arena-progress').textContent = `${String(session.index + 1).padStart(2, '0')} / ${String(config.rounds.length).padStart(2, '0')}`;
  $('current-round-name').textContent = round.name;
  const status = session.complete ? '本环节结束' : state.remaining[active] <= 0 ? '请换方' : session.running ? '正在发言' : '等待开始';
  $('round-status').textContent = status; $('round-status').classList.toggle('running', session.running);
  for (const side of ['pro', 'con']) {
    const card = $(`${side}-timer`), remaining = state.remaining[side], isActive = side === active, available = remaining !== null;
    const speakerText = available ? debaterLabel(config, side, round[`${side}Speaker`]) : `${SIDE_LABELS[side]} ${config[`${side}Debaters`].length} 位辩友`;
    const speakerLabel = $(`arena-${side}-speaker`); if (speakerLabel.textContent !== speakerText) speakerLabel.textContent = speakerText;
    const shown = available ? clockText(remaining / 1000) : '— —'; if ($(`${side}-time`).textContent !== shown) $(`${side}-time`).textContent = shown;
    card.classList.toggle('active', isActive); card.classList.toggle('warning', available && remaining > 0 && remaining <= 30000); card.classList.toggle('expired', available && remaining <= 0);
    card.disabled = round.side !== 'both' || !available || remaining <= 0;
    card.setAttribute('aria-pressed', String(isActive)); card.setAttribute('aria-label', `${SIDE_LABELS[side]}：${config[`${side}Name`] || SIDE_LABELS[side]}，${available ? '剩余 ' + shown : '本环节未发言'}${round.side === 'both' ? '，点击切换发言方' : ''}`);
    card.querySelector('.active-indicator').textContent = session.running ? '当前发言' : '待发言';
    $(`${side}-timer-hint`).textContent = !available ? '本环节未发言' : remaining <= 0 ? '时间已到' : isActive ? (session.running ? (round.side === 'both' ? '点击另一方切换计时' : '正在计时') : '等待开始') : '点击切换至此方';
  }
  $('toggle-timer').querySelector('span').textContent = session.running ? '暂停计时' : '开始计时';
  $('toggle-timer').querySelector('use').setAttribute('href', session.running ? '#i-pause' : '#i-play');
  $('toggle-timer').disabled = state.remaining[active] <= 0;
  $('previous-round').disabled = session.index === 0;
  const nextLabel = session.index === config.rounds.length - 1 ? '结束辩论' : '下一环节';
  if ($('next-round').firstChild.textContent !== nextLabel) $('next-round').firstChild.textContent = nextLabel;
  const fill = $('time-progress-fill'); fill.style.width = `${Math.max(0, Math.min(100, state.remaining[active] / (round.seconds * 1000) * 100))}%`;
  fill.classList.toggle('con', active === 'con'); fill.classList.toggle('warning', state.remaining[active] <= 30000);
  document.querySelectorAll('.agenda-item').forEach((button, index) => {
    button.classList.toggle('active', index === session.index); button.setAttribute('aria-current', index === session.index ? 'step' : 'false');
    const complete = Object.values(session.states[index].remaining).every(value => value === null || value <= 0);
    button.querySelector('.agenda-number').textContent = complete ? '✓' : String(index + 1).padStart(2, '0');
  });
  if ($('arena-notice').textContent !== notice) $('arena-notice').textContent = notice;
}

function tick() { if (session && !session.finished && !$('arena-view').hidden) { handleTimerEvents(session.update(performance.now())); updateArena(); } }
setInterval(tick, 100); document.addEventListener('visibilitychange', tick);

function toggleTimer() {
  if (!session || session.finished || resolveConfirmation) return;
  if (session.running) { handleTimerEvents(session.pause(performance.now())); notice = '计时已暂停，剩余时间保留。'; }
  else { unlockAudio(); if (session.start(performance.now())) notice = session.round.side === 'both' ? '自由辩论中，点击另一方卡片或按 A / D 切换。' : ''; }
  updateArena();
}
$('toggle-timer').addEventListener('click', toggleTimer);
for (const side of ['pro', 'con']) $(`${side}-timer`).addEventListener('click', () => { switchSide(side); });
function switchSide(side) { if (session?.switchSide(side, performance.now())) { notice = `已切换至${SIDE_LABELS[side]}${session.running ? '，继续计时。' : '，点击开始计时。'}`; updateArena(); } }

function selectRound(index) { if (session && index !== session.index && session.select(index, performance.now())) { notice = '已切换环节，点击开始计时。之前的剩余时间已保留。'; updateArena(); } }
$('previous-round').addEventListener('click', () => selectRound(session.index - 1));
$('arena-agenda').addEventListener('click', event => { const button = event.target.closest('[data-round]'); if (button) selectRound(Number(button.dataset.round)); });
$('reset-round').addEventListener('click', async () => {
  if (!session) return; session.pause(performance.now()); updateArena();
  if (await confirmAction('重置本环节？', '本环节正反方计时将恢复为设置的时长。其他环节会保留，重置后等待开始。')) { session.reset(performance.now()); notice = '本环节已重置。'; updateArena(); }
});
$('next-round').addEventListener('click', async () => {
  if (session.index < config.rounds.length - 1) { selectRound(session.index + 1); return; }
  session.pause(performance.now()); updateArena();
  if (!session.states.every(state => Object.values(state.remaining).every(value => value === null || value <= 0)) && !(await confirmAction('结束本场辩论？', '还有环节尚未用完时间。确认后将结束本场，辩题和环节设置会保留。'))) return;
  finishDebate();
});

async function returnToSetup() {
  if (!session) return;
  const spent = session.states.some((state, index) => Object.values(state.remaining).some(value => value !== null && value < config.rounds[index].seconds * 1000));
  if (!session.finished) { session.pause(performance.now()); updateArena(); if (spent && !(await confirmAction('返回设置？', '当前计时进度将重置，辩题、队伍和环节设置会保留。'))) return; }
  session = null; $('setup-view').hidden = false; $('arena-view').hidden = true; $('complete-view').hidden = true; document.body.classList.remove('in-arena', 'projection-mode'); updateProjectionButton();
  if (document.fullscreenElement) try { await document.exitFullscreen(); } catch {}
  renderSetup(); window.scrollTo(0, 0);
}
$('back-to-setup').addEventListener('click', returnToSetup);

function updateSoundButton() { $('arena-sound').setAttribute('aria-pressed', String(config.sound)); $('arena-sound').querySelector('span').textContent = config.sound ? '提示音开' : '提示音关'; }
$('arena-sound').addEventListener('click', () => { config.sound = !config.sound; $('sound-enabled').checked = config.sound; updateSoundButton(); saveSettings(); if (config.sound) unlockAudio(); });
async function toggleFullscreen() {
  const entering = !document.body.classList.contains('projection-mode');
  document.body.classList.toggle('projection-mode', entering); updateProjectionButton();
  try {
    if (!entering && document.fullscreenElement) await document.exitFullscreen();
    else if (entering && document.documentElement.requestFullscreen) await document.documentElement.requestFullscreen();
  } catch { if (entering) toast('已开启大屏模式。需要隐藏浏览器边框时，可使用浏览器自身的全屏功能。'); }
}
function updateProjectionButton() { $('fullscreen').querySelector('span').textContent = document.body.classList.contains('projection-mode') ? '退出投屏' : '全屏投影'; }
$('fullscreen').addEventListener('click', toggleFullscreen);
document.addEventListener('fullscreenchange', () => {
  if (document.fullscreenElement) nativeFullscreenActive = true;
  else if (nativeFullscreenActive) { nativeFullscreenActive = false; document.body.classList.remove('projection-mode'); }
  updateProjectionButton();
});

const completeView = document.createElement('main'); completeView.id = 'complete-view'; completeView.hidden = true; completeView.className = 'complete-view';
completeView.innerHTML = '<span class="completion-symbol">辩</span><div class="eyebrow">每一次表达，都是思考的成长</div><h1>观点有不同，<br>思考有回声。</h1><p class="complete-topic"></p><div class="complete-stat"><div><strong id="complete-rounds"></strong><span>已用尽时长的环节</span></div><div><strong id="complete-time"></strong><span>实际发言时间</span></div></div><p class="complete-note">谢谢每一位认真表达，也认真倾听的同学。</p><div class="complete-actions"><button type="button" class="secondary-button" id="complete-edit">返回设置</button><button type="button" class="primary-button" id="complete-restart">同一设置，再辩一场 →</button></div>';
document.body.insertBefore(completeView, $('help-dialog'));
function finishDebate() {
  session.finish(performance.now());
  $('arena-view').hidden = true; $('complete-view').hidden = false;
  const completed = session.states.filter(state => Object.values(state.remaining).every(value => value === null || value <= 0)).length;
  const remaining = session.states.reduce((sum, state) => sum + Object.values(state.remaining).reduce((value, time) => value + (time ?? 0), 0), 0);
  $('complete-rounds').textContent = `${completed} / ${config.rounds.length}`;
  $('complete-time').textContent = clockText(Math.max(0, Math.floor((totalSeconds(config) * 1000 - remaining) / 1000)));
  completeView.querySelector('.complete-topic').textContent = config.topic; window.scrollTo(0, 0); $('complete-restart').focus();
}
$('complete-edit').addEventListener('click', returnToSetup);
$('complete-restart').addEventListener('click', () => { session = new DebateTimer(config); notice = ''; enterArena(); });

document.addEventListener('keydown', event => {
  if (!session || session.finished || document.querySelector('dialog[open]') || event.ctrlKey || event.metaKey || event.altKey) return;
  if (event.target.closest('input, textarea, select, [contenteditable=true]')) return;
  if ((event.code === 'Space' || event.key === ' ') && event.target.closest('button') && event.target !== $('toggle-timer')) return;
  if (event.repeat) { if (event.code === 'Space') event.preventDefault(); return; }
  const key = event.key.toLowerCase();
  if (event.code === 'Space') { event.preventDefault(); toggleTimer(); }
  else if (event.key === 'ArrowLeft') { event.preventDefault(); selectRound(session.index - 1); }
  else if (event.key === 'ArrowRight') { event.preventDefault(); if (session.index < config.rounds.length - 1) selectRound(session.index + 1); }
  else if (key === 'a') { event.preventDefault(); switchSide('pro'); }
  else if (key === 'd') { event.preventDefault(); switchSide('con'); }
  else if (key === 'f') { event.preventDefault(); toggleFullscreen(); }
});
window.addEventListener('beforeunload', event => { if (session?.running) { event.preventDefault(); event.returnValue = ''; } });
renderSetup(); if (loadNotice) toast(loadNotice, true);
