/**
 * resolveChartTarget unit tests — pure function, no TradingView connection.
 * Callers key off the TARGET_NOT_FOUND / TARGET_AMBIGUOUS tokens, so the
 * messages are part of the contract.
 *
 * Run: node --test tests/resolve_chart_target.test.js
 */

import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { resolveChartTarget } from '../src/connection.js';

const targets = [
  { id: 'AAA', type: 'page', url: 'https://www.tradingview.com/chart/abc123/?symbol=BTCUSDT' },
  { id: 'BBB', type: 'page', url: 'https://www.tradingview.com/chart/xyz789/' },
  { id: 'CCC', type: 'worker', url: 'https://www.tradingview.com/chart/abc123/' },
];

describe('resolveChartTarget', () => {
  it('returns the single matching page target', () => {
    assert.equal(resolveChartTarget(targets, 'abc123').id, 'AAA');
  });

  it('ignores non-page targets with the same chart id', () => {
    const only = resolveChartTarget(targets, 'abc123');
    assert.equal(only.type, 'page');
  });

  it('throws TARGET_NOT_FOUND when nothing matches', () => {
    assert.throws(() => resolveChartTarget(targets, 'nope'), /TARGET_NOT_FOUND/);
  });

  it('throws TARGET_NOT_FOUND on an empty target list', () => {
    assert.throws(() => resolveChartTarget([], 'abc123'), /TARGET_NOT_FOUND/);
  });

  it('throws TARGET_AMBIGUOUS listing every matching target id', () => {
    const dup = [...targets, { id: 'DDD', type: 'page', url: 'https://www.tradingview.com/chart/abc123/' }];
    assert.throws(() => resolveChartTarget(dup, 'abc123'), (err) => {
      assert.match(err.message, /TARGET_AMBIGUOUS/);
      assert.match(err.message, /AAA/);
      assert.match(err.message, /DDD/);
      return true;
    });
  });

  it('does not match a chart id that is only a prefix of another', () => {
    assert.throws(() => resolveChartTarget(targets, 'abc'), /TARGET_NOT_FOUND/);
  });
});
