#!/usr/bin/env node
// Public, committed data only. No Birdeye requests or credentials.
import {execFileSync} from 'node:child_process';
import {createHash} from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import {fileURLToPath} from 'node:url';

export const RETENTION_DAYS = 90;
export const FULL_CADENCE_MINUTES = 24 * 60;
export const STALE_AFTER_MINUTES = FULL_CADENCE_MINUTES + 90;
export const isSourceStale = age => age == null || age > STALE_AFTER_MINUTES;
const DAY = 86400000;
const PERIODS = ['today', 'week'];
const METRICS = ['pnl', 'realized', 'unrealized', 'volume', 'trades'];
const FILE = /^(\d{4}-\d{2}-\d{2}T\d{2}-\d{2}-\d{2}(?:\.\d{3})?Z)--([a-f0-9]{12})\.json$/;
const sha256 = value => createHash('sha256').update(value).digest('hex');
const iso = value => new Date(value).toISOString();
function git(repo, args, encoding = 'utf8') {
  return execFileSync('git', args, {cwd: repo, encoding, maxBuffer: 32 * 1024 * 1024});
}

export function validateData(data) {
  if (!data || data.source !== 'Birdeye' || data.chain !== 'solana' ||
      typeof data.updated_at !== 'string' ||
      !/T.*(?:Z|[+-]\d{2}:\d{2})$/.test(data.updated_at) ||
      !Number.isFinite(Date.parse(data.updated_at))) throw new Error('Invalid data metadata');
  for (const period of PERIODS) {
    if (!Array.isArray(data[period])) throw new Error(`Missing ${period} array`);
    const seen = new Set();
    for (const row of data[period]) {
      if (!row || typeof row.address !== 'string' ||
          !/^[1-9A-HJ-NP-Za-km-z]{32,44}$/.test(row.address) || seen.has(row.address)) {
        throw new Error(`Invalid or duplicate address in ${period}`);
      }
      seen.add(row.address);
      for (const field of METRICS) {
        if (row[field] != null && (typeof row[field] !== 'number' || !Number.isFinite(row[field]))) {
          throw new Error(`Invalid ${field}`);
        }
      }
      if (row.trades != null && (!Number.isSafeInteger(row.trades) || row.trades < 0)) {
        throw new Error('Invalid trade count');
      }
      if (row.volume != null && row.volume < 0) throw new Error('Invalid volume');
    }
  }
  return data;
}

// Same ordering as app.js sorted(): primary desc, secondary desc, address tie-break.
// Store the result explicitly so future code/locale changes cannot rewrite history.
export function rankedIndices(rows, key) {
  const secondary = key === 'realized' ? 'pnl' : 'realized';
  const compare = (a, b, field) => {
    const x = a[field], y = b[field];
    if (x == null) return y == null ? 0 : 1;
    if (y == null) return -1;
    return y - x;
  };
  return rows.map((_, i) => i).sort((a, b) =>
    compare(rows[a], rows[b], key) || compare(rows[a], rows[b], secondary) ||
    rows[a].address.localeCompare(rows[b].address));
}

export function makeSnapshot(raw, commit, blob, now = new Date()) {
  const data = validateData(JSON.parse(raw));
  if (Date.parse(data.updated_at) > +now + 5 * 60000) throw new Error('Future data timestamp');
  const ranks = {};
  for (const period of PERIODS) {
    const byPnl = new Map(rankedIndices(data[period], 'pnl').map((index, i) => [index, i + 1]));
    ranks[period] = rankedIndices(data[period], 'realized').map((index, i) => ({
      rank: i + 1, source_index: index, pnl_rank: byPnl.get(index),
    }));
  }
  return {
    schema_version: 1,
    data_updated_at: iso(data.updated_at),
    archived_at: iso(now),
    source_commit: commit,
    source_blob: blob,
    source_sha256: sha256(raw),
    ranking: {default: 'realized', secondary: 'pnl', tie_break: 'address.localeCompare',
      locale: Intl.DateTimeFormat().resolvedOptions().locale, scope: 'unfiltered source sample'},
    data, ranks,
  };
}

export function filename(snapshot) {
  const stamp = snapshot.data_updated_at.replace(/\.000Z$/, 'Z').replaceAll(':', '-');
  return `${stamp}--${snapshot.source_sha256.slice(0, 12)}.json`;
}

export function restore(snapshot, period = 'today', sort = 'realized', limit = 10) {
  if (!PERIODS.includes(period) || !['realized', 'pnl'].includes(sort)) throw new Error('Invalid view');
  const key = sort === 'realized' ? 'rank' : 'pnl_rank';
  return [...snapshot.ranks[period]].sort((a, b) => a[key] - b[key]).slice(0, limit)
    .map(entry => ({...snapshot.data[period][entry.source_index], rank: entry[key]}));
}

function readSnapshot(file) {
  if (fs.lstatSync(file).isSymbolicLink()) throw new Error('Snapshot symlinks are not supported');
  const value = JSON.parse(fs.readFileSync(file, 'utf8'));
  validateData(value.data);
  if (value.schema_version !== 1 || !Number.isFinite(Date.parse(value.archived_at)) ||
      value.data_updated_at !== iso(value.data.updated_at) ||
      !/^[a-f0-9]{40}$/.test(value.source_commit) || !/^[a-f0-9]{40}$/.test(value.source_blob) ||
      !/^[a-f0-9]{64}$/.test(value.source_sha256) || filename(value) !== path.basename(file)) {
    throw new Error(`Invalid snapshot metadata: ${path.basename(file)}`);
  }
  return value;
}

export function archiveRepo(repo, now = new Date()) {
  repo = fs.realpathSync(repo);
  const dir = path.join(repo, 'snapshots');
  fs.mkdirSync(dir, {recursive: true});
  if (fs.realpathSync(dir) !== dir || fs.lstatSync(dir).isSymbolicLink()) throw new Error('Unsafe snapshots directory');
  const cutoff = +now - RETENTION_DAYS * DAY;
  const existing = new Map();
  for (const name of fs.readdirSync(dir).filter(name => FILE.test(name))) {
    existing.set(name, readSnapshot(path.join(dir, name)));
  }
  // Walk main's published history, including intermediate commits in a batched push.
  // A seven-day margin tolerates late commits; retention uses data time, not commit time.
  const commits = git(repo, ['log', '--first-parent', '--reverse', '--format=%H',
    `--since=${iso(cutoff - 7 * DAY)}`, 'HEAD', '--', 'data.json']).trim().split('\n').filter(Boolean);
  const created = [], expired = [], skipped = [], seen = new Set();
  for (const commit of commits) {
    const blob = git(repo, ['rev-parse', `${commit}:data.json`]).trim();
    if (seen.has(blob)) continue;
    seen.add(blob);
    const raw = git(repo, ['cat-file', 'blob', blob], null);
    let snapshot;
    try { snapshot = makeSnapshot(raw, commit, blob, now); }
    catch (error) { skipped.push({commit, reason: error.message}); continue; }
    if (Date.parse(snapshot.data_updated_at) < cutoff) continue;
    const name = filename(snapshot), previous = existing.get(name);
    if (previous) {
      if (previous.source_sha256 !== snapshot.source_sha256 ||
          JSON.stringify(previous.data) !== JSON.stringify(snapshot.data)) throw new Error(`Snapshot conflict: ${name}`);
      continue;
    }
    // Exclusive creation: a timestamp correction receives a different hash suffix.
    fs.writeFileSync(path.join(dir, name), JSON.stringify(snapshot) + '\n', {flag: 'wx'});
    existing.set(name, snapshot);
    created.push(name);
  }
  // Only recognized, validated files inside this directory can expire. No recursive deletion.
  for (const [name, snapshot] of existing) {
    if (Date.parse(snapshot.data_updated_at) < cutoff) {
      fs.unlinkSync(path.join(dir, name));
      expired.push(name);
    }
  }
  const current = validateData(JSON.parse(git(repo, ['show', 'HEAD:data.json'])));
  const currentStamp = iso(current.updated_at);
  const currentHash = sha256(git(repo, ['show', 'HEAD:data.json'], null));
  const currentArchived = [...existing].some(([name, value]) =>
    !expired.includes(name) && value.source_sha256 === currentHash);
  const result = {created, expired, skipped, latest_data_at: currentStamp,
    latest_data_age_minutes: Math.round((+now - Date.parse(currentStamp)) / 60000),
    current_archived: currentArchived, retention_days: RETENTION_DAYS};
  if (!currentArchived && Date.parse(currentStamp) >= cutoff) throw new Error('Current data was not archived');
  return result;
}

export function auditRepo(repo, now = new Date()) {
  const dir = path.join(repo, 'snapshots');
  const files = fs.existsSync(dir) ? fs.readdirSync(dir).filter(name => FILE.test(name)).sort() : [];
  const snapshots = files.map(name => ({name, snapshot: readSnapshot(path.join(dir, name)),
    bytes: fs.statSync(path.join(dir, name)).size}));
  for (const {name, snapshot} of snapshots) {
    const raw = git(repo, ['show', `${snapshot.source_commit}:data.json`], null);
    const blob = git(repo, ['rev-parse', `${snapshot.source_commit}:data.json`]).trim();
    const expected = makeSnapshot(raw, snapshot.source_commit, blob, new Date(snapshot.archived_at));
    if (sha256(raw) !== snapshot.source_sha256 || blob !== snapshot.source_blob ||
        JSON.stringify(expected.data) !== JSON.stringify(snapshot.data) ||
        JSON.stringify(expected.ranks) !== JSON.stringify(snapshot.ranks)) {
      throw new Error(`Source or ranking mismatch: ${name}`);
    }
  }
  const recent = snapshots.filter(({snapshot}) => Date.parse(snapshot.data_updated_at) >= +now - DAY);
  const uniqueTimes = [...new Set(recent.map(({snapshot}) => snapshot.data_updated_at))].sort();
  const gaps = uniqueTimes.slice(1).map((time, i) => ({from: uniqueTimes[i], to: time,
    minutes: (Date.parse(time) - Date.parse(uniqueTimes[i])) / 60000})).filter(gap => gap.minutes > STALE_AFTER_MINUTES);
  const currentHash = sha256(git(repo, ['show', 'HEAD:data.json'], null));
  const latest = snapshots.find(({snapshot}) => snapshot.source_sha256 === currentHash) ?? snapshots.at(-1);
  const report = {
    checked_at: iso(now), total_snapshots: snapshots.length, verified_snapshots: snapshots.length,
    retention_days: RETENTION_DAYS, total_bytes: snapshots.reduce((sum, row) => sum + row.bytes, 0),
    newest_data_at: latest?.snapshot.data_updated_at ?? null,
    newest_data_age_minutes: latest ? Math.round((+now - Date.parse(latest.snapshot.data_updated_at)) / 60000) : null,
    last_24h: {snapshots: recent.length, distinct_data_times: uniqueTimes.length, expected_per_day: 1,
      cadence_minutes: FULL_CADENCE_MINUTES, stale_after_minutes: STALE_AFTER_MINUTES,
      first_data_at: uniqueTimes[0] ?? null, last_data_at: uniqueTimes.at(-1) ?? null, gaps_over_expected_interval: gaps},
    files: snapshots.map(({name, bytes, snapshot}) => ({name, bytes, data_updated_at: snapshot.data_updated_at,
      archived_at: snapshot.archived_at, source_commit: snapshot.source_commit,
      today_rows: snapshot.data.today.length, week_rows: snapshot.data.week.length})),
    sample_top10: latest ? {file: latest.name, today: restore(latest.snapshot), week: restore(latest.snapshot, 'week')} : null,
  };
  const summary = process.env.GITHUB_STEP_SUMMARY;
  if (summary) {
    const lines = ['## 排行榜快照封存', '', `已驗證 ${report.verified_snapshots} 份；近 24 小時 ${recent.length} 份（新制每日 08:00 台北全量一份）。`,
      `最新資料時間：${report.newest_data_at ?? '無'}；資料年齡：${report.newest_data_age_minutes ?? '無'} 分鐘。`, '',
      '快照日期依來源資料時間；補存歷史提交不計為今天的新資料。', '', '| 檔案 | 今日 / 近週筆數 | bytes |', '|---|---:|---:|',
      ...report.files.slice(-60).map(row => `| ${row.name} | ${row.today_rows} / ${row.week_rows} | ${row.bytes} |`),
      '', '摘要最多列出最後 60 份，完整列表與前十名在本次 snapshot-audit.json artifact。', ''];
    fs.appendFileSync(summary, lines.join('\n'));
  }
  return report;
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  try {
    const mode = process.argv[2] ?? 'capture';
    if (!['capture', 'audit'].includes(mode)) throw new Error('Usage: node archive.mjs [capture|audit] [repo]');
    const repo = path.resolve(process.argv[3] ?? '.');
    const report = mode === 'capture' ? archiveRepo(repo) : auditRepo(repo);
    console.log(JSON.stringify(report, null, 2));
    const age = report.latest_data_age_minutes ?? report.newest_data_age_minutes;
    if (process.env.GITHUB_ACTIONS && isSourceStale(age)) {
      console.error('::warning::Leaderboard source is stale; archived history does not imply new upstream data.');
    }
    if (report.skipped?.length) process.exitCode = 1;
  } catch (error) { console.error(error.message); process.exitCode = 1; }
}
