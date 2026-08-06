/**
 * buildValuesFromRaw unit tests — pure function, no TradingView connection.
 *
 * The raw row is PlotList.valueAt(i): [time, plot_0, plot_1, ...], so the value
 * for plotTitles[i] is raw[i + 1]. Callers (`tv values --at`) drop studies whose
 * mapped value set ends up empty, so the exclusion rules below are contract.
 *
 * Run: node --test tests/study_values_at.test.js
 */

import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { buildValuesFromRaw } from '../src/core/data.js';

// Live-probe sample: MACD on a 4h chart, bar time 1785988800.
// styles.plot_0.title="Histogram", plot_2="MACD", plot_3="Signal line".
const MACD_TITLES = ['Histogram', null, 'MACD', 'Signal line', null, null];
const MACD_RAW = [1785988800, 98.48908976852164, 0, 307.339515726424, 208.85042595790236, 0, 0];

describe('buildValuesFromRaw', () => {
  it('maps the real MACD row onto its three titled plots', () => {
    const values = buildValuesFromRaw({ plotTitles: MACD_TITLES, raw: MACD_RAW });
    assert.deepEqual(Object.keys(values).sort(), ['Histogram', 'MACD', 'Signal line']);
    assert.equal(values.Histogram, 98.48908976852164);
    assert.equal(values.MACD, 307.339515726424);
    assert.equal(values['Signal line'], 208.85042595790236);
    // Sanity: MACD - Signal === Histogram (to float noise).
    assert.ok(Math.abs((values.MACD - values['Signal line']) - values.Histogram) < 1e-9);
  });

  it('keeps raw numbers, not formatted Data Window strings', () => {
    const values = buildValuesFromRaw({ plotTitles: ['MA'], raw: [1785988800, 63830.7] });
    assert.equal(typeof values.MA, 'number');
    assert.equal(values.MA, 63830.7);
  });

  it('maps a single-plot study (SMA) off raw[1]', () => {
    const values = buildValuesFromRaw({
      plotTitles: ['MA', null, null, null, null],
      raw: [1785988800, 30123.5, 0, 0, 0, 0],
    });
    assert.deepEqual(values, { MA: 30123.5 });
  });

  it('excludes plots whose title is null or empty', () => {
    const values = buildValuesFromRaw({ plotTitles: [null, '', 'RSI'], raw: [1, 10, 20, 30] });
    assert.deepEqual(values, { RSI: 30 });
  });

  it('excludes null and undefined values', () => {
    const values = buildValuesFromRaw({ plotTitles: ['a', 'b', 'c'], raw: [1, null, undefined, 3] });
    assert.deepEqual(values, { c: 3 });
  });

  it('excludes non-finite values (NaN, Infinity, -Infinity)', () => {
    const values = buildValuesFromRaw({
      plotTitles: ['nan', 'inf', 'neginf', 'ok'],
      raw: [1, NaN, Infinity, -Infinity, 42],
    });
    assert.deepEqual(values, { ok: 42 });
  });

  it('excludes non-numeric values', () => {
    const values = buildValuesFromRaw({ plotTitles: ['s', 'n'], raw: [1, '63,830.7', 7] });
    assert.deepEqual(values, { n: 7 });
  });

  it('returns an empty object when raw is null (bar not found)', () => {
    assert.deepEqual(buildValuesFromRaw({ plotTitles: MACD_TITLES, raw: null }), {});
  });

  it('returns an empty object for missing/!array inputs', () => {
    assert.deepEqual(buildValuesFromRaw({}), {});
    assert.deepEqual(buildValuesFromRaw(), {});
    assert.deepEqual(buildValuesFromRaw({ plotTitles: null, raw: [1, 2] }), {});
  });

  it('ignores titles with no corresponding value slot', () => {
    const values = buildValuesFromRaw({ plotTitles: ['a', 'b', 'c'], raw: [1, 5] });
    assert.deepEqual(values, { a: 5 });
  });

  it('preserves a zero value (0 is meaningful, not missing)', () => {
    const values = buildValuesFromRaw({ plotTitles: ['Histogram'], raw: [1, 0] });
    assert.deepEqual(values, { Histogram: 0 });
  });
});
