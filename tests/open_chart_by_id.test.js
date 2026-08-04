/**
 * openChartById unit tests — every dependency (CDP, /json/list, sleep) is
 * injected, so nothing here touches a running TradingView.
 *
 * Run: node --test tests/open_chart_by_id.test.js
 */

import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { openChartById, assertValidChartId, matchChartTargets } from '../src/core/tab.js';

const CHART = 'abc123';
const chartUrl = (id) => `https://www.tradingview.com/chart/${id}/`;

const STATE = { symbol: 'BINANCE:BTCUSDT.P', resolution: '15', studies: 3 };

/**
 * Fake CDP client. `ready` decides whether the chart API answers; when it is a
 * number, that many evaluate() calls return null before the state appears.
 */
function fakeClient({ readyAfter = 0, onNavigate } = {}) {
  let evals = 0;
  const calls = { navigate: [], closed: 0, pageEnabled: 0, runtimeEnabled: 0 };
  return {
    calls,
    Page: {
      enable: async () => { calls.pageEnabled++; },
      navigate: async ({ url }) => { calls.navigate.push(url); if (onNavigate) onNavigate(url); },
    },
    Runtime: {
      enable: async () => { calls.runtimeEnabled++; },
      evaluate: async () => ({
        result: { value: evals++ < readyAfter ? null : JSON.stringify(STATE) },
      }),
    },
    close: async () => { calls.closed++; },
  };
}

/** Build a dep bundle over a mutable target list. */
function makeDeps(targets, { readyAfter = 0, landing = null, clientFactory } = {}) {
  const state = {
    targets: [...targets],
    newTabCalls: 0,
    closed: [],
    clients: [],
    landing,
  };
  const deps = {
    listTargets: async () => [...state.targets],
    findLandingTarget: async () => state.landing,
    newTab: async () => {
      state.newTabCalls++;
      state.landing = { id: 'LANDING', type: 'page', title: 'New tab', url: 'file:///landing.html' };
      return { success: true };
    },
    closeTargetById: async ({ targetId }) => {
      state.closed.push(targetId);
      state.targets = state.targets.filter(t => t.id !== targetId);
      return { success: true };
    },
    connect: async (targetId) => {
      const c = (clientFactory || fakeClient)({
        readyAfter,
        onNavigate: () => {
          // Navigation swaps the landing target's URL to the chart URL.
          const t = state.targets.find(x => x.id === targetId);
          if (t) t.url = chartUrl(CHART);
          else state.targets.push({ id: targetId, type: 'page', url: chartUrl(CHART) });
        },
      });
      c.targetId = targetId;
      state.clients.push(c);
      return c;
    },
    sleep: async () => {},
  };
  return { deps, state };
}

describe('assertValidChartId', () => {
  it('accepts letters, digits, underscore and dash', () => {
    assert.equal(assertValidChartId('aB9_-x'), 'aB9_-x');
  });

  it('rejects a missing id', () => {
    assert.throws(() => assertValidChartId(undefined), /chartId required/);
    assert.throws(() => assertValidChartId(''), /chartId required/);
  });

  it('rejects path traversal and query injection', () => {
    for (const bad of ['../evil', 'a/b', 'abc?x=1', 'ab c', 'abc/../../json/close/X', 'ab%2F']) {
      assert.throws(() => assertValidChartId(bad), /Invalid chartId/, `should reject ${bad}`);
    }
  });
});

describe('matchChartTargets', () => {
  const targets = [
    { id: 'AAA', type: 'page', url: chartUrl('abc123') + '?symbol=BTC' },
    { id: 'BBB', type: 'page', url: chartUrl('xyz789') },
    { id: 'CCC', type: 'worker', url: chartUrl('abc123') },
    { id: 'DDD', type: 'page', title: 'New tab', url: 'file:///landing.html' },
  ];

  it('matches only page targets on that chart id', () => {
    assert.deepEqual(matchChartTargets(targets, 'abc123').map(t => t.id), ['AAA']);
  });

  it('does not match a chart id that is a prefix of another', () => {
    assert.deepEqual(matchChartTargets(targets, 'abc'), []);
  });

  it('returns an empty list for no targets', () => {
    assert.deepEqual(matchChartTargets(undefined, 'abc123'), []);
    assert.deepEqual(matchChartTargets([], 'abc123'), []);
  });
});

describe('openChartById — validation', () => {
  it('rejects a bad chart id before doing any I/O', async () => {
    const { deps, state } = makeDeps([]);
    await assert.rejects(() => openChartById({ chartId: '../json/close/X' }, deps), /Invalid chartId/);
    assert.equal(state.newTabCalls, 0);
    assert.equal(state.clients.length, 0);
  });

  it('rejects a missing chart id', async () => {
    const { deps } = makeDeps([]);
    await assert.rejects(() => openChartById({}, deps), /chartId required/);
  });
});

describe('openChartById — already open', () => {
  it('returns the existing tab without opening another', async () => {
    const { deps, state } = makeDeps([
      { id: 'AAA', type: 'page', url: chartUrl(CHART) },
      { id: 'BBB', type: 'page', url: chartUrl('other') },
    ]);
    const out = await openChartById({ chartId: CHART }, deps);
    assert.equal(out.success, true);
    assert.equal(out.action, 'already_open');
    assert.equal(out.already_open, true);
    assert.equal(out.chart_id, CHART);
    assert.equal(out.target_id, 'AAA');
    assert.equal(state.newTabCalls, 0);
    assert.deepEqual(state.closed, []);
  });

  it('reads symbol/resolution/studies from the open tab', async () => {
    const { deps } = makeDeps([{ id: 'AAA', type: 'page', url: chartUrl(CHART) }]);
    const out = await openChartById({ chartId: CHART }, deps);
    assert.equal(out.symbol, STATE.symbol);
    assert.equal(out.resolution, STATE.resolution);
    assert.equal(out.studies, STATE.studies);
  });

  it('reports nulls (not a throw) when the chart API is unreadable', async () => {
    const { deps } = makeDeps([{ id: 'AAA', type: 'page', url: chartUrl(CHART) }], {
      clientFactory: () => { throw new Error('connect refused'); },
    });
    const out = await openChartById({ chartId: CHART }, deps);
    assert.equal(out.action, 'already_open');
    assert.equal(out.symbol, null);
    assert.equal(out.resolution, null);
    assert.equal(out.studies, null);
  });

  it('ignores a non-page target on the same chart id', async () => {
    const { deps, state } = makeDeps([{ id: 'WORKER', type: 'worker', url: chartUrl(CHART) }]);
    const out = await openChartById({ chartId: CHART }, deps);
    assert.equal(out.action, 'chart_opened');
    assert.equal(state.newTabCalls, 1);
  });

  it('closes duplicates so exactly one tab survives', async () => {
    const { deps, state } = makeDeps([
      { id: 'AAA', type: 'page', url: chartUrl(CHART) },
      { id: 'BBB', type: 'page', url: chartUrl(CHART) },
      { id: 'CCC', type: 'page', url: chartUrl(CHART) },
    ]);
    const out = await openChartById({ chartId: CHART }, deps);
    assert.equal(out.target_id, 'AAA');
    assert.deepEqual(state.closed, ['BBB', 'CCC']);
    assert.equal(matchChartTargets(state.targets, CHART).length, 1);
  });
});

describe('openChartById — opening', () => {
  it('opens a landing tab, navigates it to the chart URL and reports state', async () => {
    const { deps, state } = makeDeps([]);
    const out = await openChartById({ chartId: CHART }, deps);
    assert.equal(state.newTabCalls, 1);
    assert.equal(out.action, 'chart_opened');
    assert.equal(out.already_open, false);
    assert.equal(out.success, true);
    assert.equal(out.chart_id, CHART);
    assert.equal(out.target_id, 'LANDING');
    assert.equal(out.symbol, STATE.symbol);
    assert.equal(out.resolution, STATE.resolution);
    assert.equal(out.studies, STATE.studies);
    const client = state.clients[0];
    assert.deepEqual(client.calls.navigate, [chartUrl(CHART)]);
    assert.equal(client.calls.pageEnabled, 1);
    assert.equal(client.calls.runtimeEnabled, 1);
    assert.equal(client.calls.closed, 1, 'CDP client must be closed');
  });

  it('reuses an already-open landing tab instead of opening another', async () => {
    const { deps, state } = makeDeps([], {
      landing: { id: 'EXISTING_LANDING', type: 'page', title: 'New tab', url: 'file:///landing.html' },
    });
    const out = await openChartById({ chartId: CHART }, deps);
    assert.equal(state.newTabCalls, 0);
    assert.equal(out.target_id, 'EXISTING_LANDING');
  });

  it('keeps polling while the chart API is still booting', async () => {
    const { deps } = makeDeps([], { readyAfter: 5 });
    const out = await openChartById({ chartId: CHART }, deps);
    assert.equal(out.action, 'chart_opened');
  });

  it('throws (and closes the client) when the chart API never appears', async () => {
    const { deps, state } = makeDeps([], { readyAfter: Infinity });
    await assert.rejects(
      () => openChartById({ chartId: CHART, timeoutMs: 3000 }, deps),
      /never became ready within 3s/
    );
    assert.equal(state.clients[0].calls.closed, 1);
  });

  it('throws when no target ends up serving the chart id', async () => {
    const { deps } = makeDeps([], { clientFactory: () => fakeClient({}) }); // no onNavigate side effect
    await assert.rejects(() => openChartById({ chartId: CHART }, deps), /no page target with \/chart\/abc123\/ is listed/);
  });

  it('prunes a duplicate created during the open', async () => {
    const { deps, state } = makeDeps([]);
    const inner = deps.connect;
    deps.connect = async (targetId) => {
      const c = await inner(targetId);
      state.targets.push({ id: 'STRAY', type: 'page', url: chartUrl(CHART) });
      return c;
    };
    const out = await openChartById({ chartId: CHART }, deps);
    assert.equal(out.target_id, 'LANDING');
    assert.deepEqual(state.closed, ['STRAY']);
  });
});
