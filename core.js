export const SIDE_LABELS = { pro: '正方', con: '反方', both: '双方' };
export const STORAGE_KEY = 'youli-debate-settings-v1';
const TIMES = { short: [90, 60, 60, 90], classroom: [180, 120, 180, 120], full: [240, 180, 300, 180] };
export const MAX_DEBATERS = 6;
const CHINESE_NUMBERS = ['一', '二', '三', '四', '五', '六'];
export const TOPIC_BANK = Object.freeze([
  '学生是否应该在学校使用手机？', '学校是否应该取消统一校服？',
  '学校是否应该减少课后作业？', '考试成绩能否全面反映学生的能力？',
  '小组学习是否比独立学习更有效？', '电子课本是否应该取代纸质课本？',
  '学生是否应该自己选择学习的科目？', '学校是否应该每天安排体育课？',
  '学校图书馆是否应该允许学生边吃东西边阅读？', '学校是否应该推迟每天的上课时间？',
  '学生使用人工智能完成作业，是利大于弊吗？', '课堂学习是否应该更多地使用游戏？',
  '网络交流是否能够增进人与人之间的关系？', '短视频对青少年的影响，是利大于弊吗？',
  '科技发展是否让生活变得更简单？', '机器人是否适合担任课堂助教？',
  '保护环境是否应该从限制一次性用品开始？', '学校食堂是否应该设置每周一天的素食日？',
  '旅游景点是否应该限制游客数量？', '城市是否应该鼓励更多人骑自行车出行？',
  '旅行中，详细计划是否比随性探索更好？', '了解一种文化，旅行是否比阅读更有效？',
  '博物馆是否应该向所有人免费开放？', '传统节日是否应该采用更现代的庆祝方式？',
  '学习中文时，表达流利是否比语法准确更重要？', '学会一门外语，沉浸体验是否比课堂学习更重要？',
  '成长过程中，合作是否比竞争更重要？', '面对困难，坚持是否总比及时调整更好？',
  '选择未来职业，兴趣是否比收入更重要？', '成功主要来自努力，而不是天赋吗？',
  '善意的谎言是否可以被接受？', '与朋友相处，坦率是否比委婉更重要？',
  '养宠物是否有助于培养学生的责任感？', '青少年是否应该自己管理零花钱？',
  '课余时间参加社团，是否比参加补习更有价值？', '阅读虚构故事是否与阅读实用知识同样重要？',
]);

export function randomTopic(current = '', used = [], random = Math.random) {
  const candidates = TOPIC_BANK.filter(topic => topic !== current.trim() && !used.includes(topic));
  const pool = candidates.length ? candidates : TOPIC_BANK.filter(topic => topic !== current.trim());
  return pool[Math.min(pool.length - 1, Math.max(0, Math.floor(random() * pool.length)))];
}

export function debaterRole(side, position) {
  return position === 0 ? `${SIDE_LABELS[side]}全队` : `${SIDE_LABELS[side]}${CHINESE_NUMBERS[position - 1]}辩`;
}

export function debaterLabel(config, side, position) {
  const role = debaterRole(side, position), name = position > 0 ? config[`${side}Debaters`][position - 1] : '';
  return name ? `${role} · ${name}` : role;
}

export function presetRounds(name = 'classroom') {
  const [opening, attack, free, closing] = TIMES[name] || TIMES.classroom;
  return [
    { name: '开篇立论', side: 'pro', seconds: opening },
    { name: '开篇立论', side: 'con', seconds: opening },
    { name: '攻辩环节', side: 'pro', seconds: attack },
    { name: '攻辩环节', side: 'con', seconds: attack },
    { name: '自由辩论', side: 'both', seconds: free },
    { name: '总结陈词', side: 'con', seconds: closing },
    { name: '总结陈词', side: 'pro', seconds: closing },
  ].map((round, index) => ({ ...round, proSpeaker: round.side === 'pro' ? ({ 0: 1, 2: 2, 6: 3 }[index] || 0) : 0, conSpeaker: round.side === 'con' ? ({ 1: 1, 3: 2, 5: 3 }[index] || 0) : 0 }));
}

export function defaultConfig() {
  return { version: 1, eventName: '', topic: '', proName: '', conName: '', proStance: '', conStance: '',
    proDebaters: ['', '', ''], conDebaters: ['', '', ''],
    preset: 'classroom', rounds: presetRounds(), sound: true, autoNext: false };
}

export function validateConfig(input, { requireTopic = false } = {}) {
  if (!input || typeof input !== 'object' || Array.isArray(input)) throw new Error('设置文件格式不正确，请导入从有理导出的 JSON 文件。');
  if (input.version !== 1) throw new Error('不支持这个设置文件版本。');
  const limits = { eventName: 60, topic: 180, proName: 32, conName: 32, proStance: 120, conStance: 120 };
  const clean = { version: 1 };
  for (const [key, limit] of Object.entries(limits)) {
    if (typeof input[key] !== 'string' || input[key].length > limit) throw new Error('设置中的名称或辩题格式不正确，或文字过长。');
    clean[key] = input[key].trim();
  }
  if (requireTopic && !clean.topic) throw new Error('请先填写今天的辩论题目。');
  for (const side of ['pro', 'con']) {
    const key = `${side}Debaters`, debaters = input[key] === undefined ? ['', '', ''] : input[key];
    if (!Array.isArray(debaters) || debaters.length < 1 || debaters.length > MAX_DEBATERS || debaters.some(name => typeof name !== 'string' || name.length > 32)) throw new Error(`${SIDE_LABELS[side]}请设置 1 至 ${MAX_DEBATERS} 位辩友，每个姓名不超过 32 字。`);
    clean[key] = Array.from(debaters, name => name.trim());
  }
  if (!Array.isArray(input.rounds) || input.rounds.length < 1 || input.rounds.length > 30) throw new Error('请设置 1 至 30 个辩论环节。');
  clean.rounds = input.rounds.map((round, index) => {
    if (!round || typeof round !== 'object' || typeof round.name !== 'string' || !round.name.trim() || round.name.length > 40) throw new Error(`第 ${index + 1} 个环节需要一个不超过 40 字的名称。`);
    if (!Object.hasOwn(SIDE_LABELS, round.side)) throw new Error(`第 ${index + 1} 个环节的发言方无效。`);
    if (!Number.isInteger(round.seconds) || round.seconds < 1 || round.seconds > 3599) throw new Error(`第 ${index + 1} 个环节时长应为 1 秒至 59 分 59 秒。`);
    const speakers = {};
    for (const side of ['pro', 'con']) {
      const key = `${side}Speaker`;
      const template = Object.hasOwn(TIMES, input.preset) ? presetRounds(input.preset)[index] : null;
      const fallback = template?.name === round.name && template?.side === round.side ? Math.min(template[key], clean[`${side}Debaters`].length) : 0;
      const value = round[key] === undefined ? fallback : round[key];
      if (!Number.isInteger(value) || value < 0 || value > clean[`${side}Debaters`].length) throw new Error(`第 ${index + 1} 个环节指定的${SIDE_LABELS[side]}辩友不存在。`);
      speakers[key] = value;
    }
    return { name: round.name.trim(), side: round.side, seconds: round.seconds, ...speakers };
  });
  if (typeof input.sound !== 'boolean' || typeof input.autoNext !== 'boolean') throw new Error('提示音或自动切换设置格式不正确。');
  clean.sound = input.sound; clean.autoNext = input.autoNext;
  const timing = rounds => rounds.map(({ name, side, seconds }) => ({ name, side, seconds }));
  clean.preset = Object.hasOwn(TIMES, input.preset) && JSON.stringify(timing(clean.rounds)) === JSON.stringify(timing(presetRounds(input.preset))) ? input.preset : 'custom';
  return clean;
}

export function totalSeconds(config) {
  return config.rounds.reduce((sum, round) => sum + round.seconds * (round.side === 'both' ? 2 : 1), 0);
}

export function clockText(seconds) {
  const value = Math.max(0, Math.ceil(seconds));
  return `${String(Math.floor(value / 60)).padStart(2, '0')}:${String(value % 60).padStart(2, '0')}`;
}

export function totalMinutes(config) {
  const minutes = totalSeconds(config) / 60;
  return Number.isInteger(minutes) ? String(minutes) : String(Math.round(minutes * 10) / 10);
}

export class DebateTimer {
  constructor(config) {
    this.config = config; this.index = 0; this.running = false; this.deadline = null; this.finished = false;
    this.states = config.rounds.map(round => this.freshState(round));
  }
  freshState(round) {
    return { active: round.side === 'con' ? 'con' : 'pro',
      remaining: { pro: round.side === 'con' ? null : round.seconds * 1000, con: round.side === 'pro' ? null : round.seconds * 1000 },
      warned: { pro: false, con: false } };
  }
  get round() { return this.config.rounds[this.index]; }
  get state() { return this.states[this.index]; }
  get complete() { return Object.values(this.state.remaining).every(value => value === null || value <= 0); }
  update(now) {
    if (!this.running) return {};
    const side = this.state.active;
    const previous = this.state.remaining[side];
    const remaining = Math.max(0, this.deadline - now);
    this.state.remaining[side] = remaining;
    const events = {};
    if (previous > 30000 && remaining <= 30000 && remaining > 0 && !this.state.warned[side]) {
      this.state.warned[side] = true; events.warning = side;
    }
    if (remaining === 0) { this.running = false; this.deadline = null; events.endedSide = side; events.roundEnded = this.complete; }
    return events;
  }
  start(now) {
    if (this.running || this.finished || this.state.remaining[this.state.active] <= 0) return false;
    this.deadline = now + this.state.remaining[this.state.active]; this.running = true; return true;
  }
  pause(now) { const events = this.update(now); this.running = false; this.deadline = null; return events; }
  switchSide(side, now) {
    if (this.round.side !== 'both' || !['pro', 'con'].includes(side) || this.finished) return false;
    this.update(now);
    if (side === this.state.active || this.state.remaining[side] <= 0) return false;
    const wasRunning = this.running;
    this.state.active = side; this.deadline = wasRunning ? now + this.state.remaining[side] : null; return true;
  }
  select(index, now) {
    if (!Number.isInteger(index) || index < 0 || index >= this.states.length || this.finished) return false;
    this.pause(now); this.index = index; return true;
  }
  reset(now) { this.pause(now); this.states[this.index] = this.freshState(this.round); }
  finish(now) { this.pause(now); this.finished = true; }
}
