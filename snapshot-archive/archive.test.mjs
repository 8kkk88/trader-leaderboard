import {test} from 'node:test';
import assert from 'node:assert/strict';
import {execFileSync} from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import vm from 'node:vm';
import {archiveRepo, auditRepo, filename, isSourceStale, makeSnapshot, rankedIndices, restore, validateData} from './archive.mjs';

const NOW = new Date('2026-10-15T12:00:00Z');
const address = char => char.repeat(32);
const row = (char, realized, pnl) => ({address: address(char), realized, pnl,
  unrealized: realized == null || pnl == null ? null : pnl - realized, volume: 100, trades: 3});
const sample = (stamp = '2026-10-15T11:00:00Z') => ({updated_at: stamp, source: 'Birdeye', chain: 'solana',
  insight: {today: '保存原文', week: '原始說明'}, today: [row('Z', 10, 40), row('a', 20, 30),
    row('B', 20, 30), row('b', 20, 30), row('c', null, 100), row('d', 0, null)],
  week: [row('e', 99, 101), row('f', 100, 200)]});
function temporary(t) {
  const repo = fs.mkdtempSync(path.join(os.tmpdir(), 'leaderboard-archive-test-'));
  t.after(() => {
    const resolved = fs.realpathSync(repo);
    assert.equal(path.dirname(resolved), fs.realpathSync(os.tmpdir()));
    assert.ok(path.basename(resolved).startsWith('leaderboard-archive-test-'));
    fs.rmSync(resolved, {recursive: true, force: true});
  });
  const run = (...args) => execFileSync('git', args, {cwd: repo, encoding: 'utf8',
    env: {...process.env, GIT_AUTHOR_DATE: NOW.toISOString(), GIT_COMMITTER_DATE: NOW.toISOString()}}).trim();
  run('init', '-q');
  run('config', 'user.email', 'archive-test@example.invalid');
  run('config', 'user.name', 'Archive Test');
  const commit = data => {
    fs.writeFileSync(path.join(repo, 'data.json'), JSON.stringify(data));
    run('add', 'data.json'); run('commit', '-qm', 'Source update');
    return run('rev-parse', 'HEAD');
  };
  return {repo, run, commit};
}

test('persisted ranks match the actual frontend sort, including nulls and mixed-case ties', () => {
  const app = fs.readFileSync(new URL('../app.js', import.meta.url), 'utf8');
  const sort = app.slice(app.indexOf('function sorted('), app.indexOf('\nfunction ', app.indexOf('function sorted(') + 1));
  const metric = app.match(/(?:const metric =[^\n]+|function metric\([^]*?\n})/)[0];
  const data = sample();
  const context = vm.createContext({DATA: data, SORT: 'realized', TAB: 'today', sortedCache: new Map()});
  vm.runInContext(`${metric}\n${sort}`, context);
  for (const period of ['today', 'week']) for (const key of ['realized', 'pnl']) {
    const expected = vm.runInContext(`sorted('${key}', '${period}').map(row => row.address)`, context);
    assert.deepEqual(rankedIndices(data[period], key).map(i => data[period][i].address), Array.from(expected));
  }
});

test('full source content and both top-ten views survive serialization', () => {
  const data = sample();
  data.extra = {futureField: 'retain this too'};
  const snapshot = JSON.parse(JSON.stringify(makeSnapshot(Buffer.from(JSON.stringify(data)), 'a'.repeat(40), 'b'.repeat(40), NOW)));
  assert.deepEqual(snapshot.data, data);
  assert.equal(restore(snapshot)[0].rank, 1);
  assert.equal(restore(snapshot, 'today', 'pnl')[0].address, address('c'));
  assert.equal(restore(snapshot, 'week')[0].address, address('f'));
  assert.equal(snapshot.data.today[4].realized, null);
});

test('UTC filename uses data time, and same-time corrections have distinct names', () => {
  const data = sample('2026-10-15T19:00:00+08:00');
  const first = makeSnapshot(Buffer.from(JSON.stringify(data)), 'a'.repeat(40), 'b'.repeat(40), NOW);
  assert.match(filename(first), /^2026-10-15T11-00-00Z--[a-f0-9]{12}\.json$/);
  data.today[0].realized++;
  const second = makeSnapshot(Buffer.from(JSON.stringify(data)), 'a'.repeat(40), 'c'.repeat(40), NOW);
  assert.notEqual(filename(first), filename(second));
});

test('batched push recovers every version; retries and unrelated commits do not duplicate history', t => {
  const {repo, commit, run} = temporary(t);
  const first = commit(sample('2026-10-15T10:00:00Z'));
  commit(sample('2026-10-15T10:30:00Z'));
  commit(sample('2026-10-15T11:00:00Z'));
  const original = fs.readFileSync(path.join(repo, 'data.json'));
  assert.equal(archiveRepo(repo, NOW).created.length, 3);
  const firstName = fs.readdirSync(path.join(repo, 'snapshots')).sort()[0];
  assert.equal(JSON.parse(fs.readFileSync(path.join(repo, 'snapshots', firstName))).source_commit, first);
  const bytes = fs.readFileSync(path.join(repo, 'snapshots', firstName));
  run('commit', '--allow-empty', '-qm', 'Unrelated bot update');
  assert.equal(archiveRepo(repo, new Date(+NOW + 60000)).created.length, 0);
  assert.deepEqual(fs.readFileSync(path.join(repo, 'data.json')), original);
  assert.deepEqual(fs.readFileSync(path.join(repo, 'snapshots', firstName)), bytes);
  assert.equal(auditRepo(repo, NOW).verified_snapshots, 3);
});

test('same-timestamp corrected data is retained as a second immutable version', t => {
  const {repo, commit} = temporary(t);
  const data = sample(); commit(data);
  archiveRepo(repo, NOW);
  data.today[0].realized = 42; commit(data);
  assert.equal(archiveRepo(repo, NOW).created.length, 1);
  const report = auditRepo(repo, NOW);
  assert.equal(report.total_snapshots, 2);
  assert.equal(report.last_24h.distinct_data_times, 1);
});

test('exactly 90-day boundary survives; older snapshots expire without touching other files', t => {
  const {repo, commit} = temporary(t);
  const boundary = new Date(+NOW - 90 * 86400000);
  commit(sample(new Date(+boundary - 1000).toISOString()));
  commit(sample(boundary.toISOString()));
  commit(sample());
  archiveRepo(repo, new Date(+NOW - 2000));
  fs.writeFileSync(path.join(repo, 'snapshots', 'keep.txt'), 'manual evidence');
  const result = archiveRepo(repo, NOW);
  assert.equal(result.expired.length, 1);
  assert.equal(fs.readFileSync(path.join(repo, 'snapshots', 'keep.txt'), 'utf8'), 'manual evidence');
  assert.equal(auditRepo(repo, NOW).total_snapshots, 2);
});

test('malformed input and future timestamps fail without fabricated metrics', () => {
  for (const mutate of [data => data.today.push(data.today[0]), data => data.today[0].realized = '9',
    data => data.today[0].volume = -1, data => data.today[0].trades = 0.5,
    data => data.updated_at = '2026-10-15T11:00:00', data => data.week = null]) {
    const data = sample(); mutate(data); assert.throws(() => validateData(data));
  }
  assert.throws(() => makeSnapshot(Buffer.from(JSON.stringify(sample('2026-10-16T11:00:00Z'))), 'a'.repeat(40), 'b'.repeat(40), NOW));
});

test('audit detects tampered rank or source values', t => {
  const {repo, commit} = temporary(t); commit(sample()); archiveRepo(repo, NOW);
  const name = fs.readdirSync(path.join(repo, 'snapshots'))[0];
  const file = path.join(repo, 'snapshots', name);
  const value = JSON.parse(fs.readFileSync(file)); value.ranks.today[0].rank = 999;
  fs.writeFileSync(file, JSON.stringify(value));
  assert.throws(() => auditRepo(repo, NOW), /mismatch/);
});

test('stale source remains old and does not manufacture 48 fresh observations', t => {
  const {repo, commit} = temporary(t); commit(sample('2026-10-13T11:00:00Z'));
  const first = archiveRepo(repo, NOW);
  assert.equal(first.created.length, 1);
  assert.ok(first.latest_data_age_minutes > 1440);
  const second = archiveRepo(repo, new Date(+NOW + 3600000));
  assert.equal(second.created.length, 0);
  assert.equal(auditRepo(repo, NOW).last_24h.snapshots, 0);
});

test('daily full data remains fresh through one interval plus schedule grace', t => {
  assert.equal(isSourceStale(1440), false);
  assert.equal(isSourceStale(1530), false);
  assert.equal(isSourceStale(1531), true);
  assert.equal(isSourceStale(null), true);
  const {repo, commit} = temporary(t); commit(sample('2026-10-15T00:00:00Z'));
  archiveRepo(repo, NOW);
  const report = auditRepo(repo, NOW);
  assert.equal(report.last_24h.expected_per_day, 1);
  assert.equal(report.last_24h.cadence_minutes, 1440);
});
