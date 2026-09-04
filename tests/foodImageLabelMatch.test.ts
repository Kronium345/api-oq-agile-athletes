import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { scoreLabelMatch } from '../services/foodImageProviders/labelMatch.ts';

describe('foodImageLabelMatch', () => {
  it('scores close labels highly', () => {
    assert.ok(scoreLabelMatch('chicken breast', 'Chicken Breast') >= 0.9);
    assert.ok(scoreLabelMatch('tomato soup', 'Tomato Soup') >= 0.9);
  });

  it('rejects unrelated labels', () => {
    assert.ok(scoreLabelMatch('tomato soup', 'Chocolate Cake') < 0.45);
    assert.ok(scoreLabelMatch('chicken breast', 'Apple') < 0.45);
  });
});
