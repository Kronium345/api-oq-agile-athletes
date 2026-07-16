import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import {
  computeBreathingStreakDays,
  suggestBreathingProtocolId,
} from '../services/recoveryHub.ts';
import { isKnownProtocolId, listBreathingProtocols } from '../services/recoveryProtocols.ts';
import { validateRecoverySessionBody } from '../utils/recoveryValidation.ts';

describe('recoveryProtocols', () => {
  it('ships six MVP protocols', () => {
    assert.equal(listBreathingProtocols().length, 6);
    assert.equal(isKnownProtocolId('stress_reset'), true);
    assert.equal(isKnownProtocolId('unknown_protocol'), false);
  });
});

describe('suggestBreathingProtocolId', () => {
  it('suggests sleep wind-down in evening UTC', () => {
    assert.equal(suggestBreathingProtocolId({ hourUtc: 21 }), 'sleep_wind_down');
  });

  it('suggests stress reset when stress is high', () => {
    assert.equal(suggestBreathingProtocolId({ stress: 8, hourUtc: 14 }), 'stress_reset');
  });

  it('suggests post-workout when already completed today', () => {
    assert.equal(
      suggestBreathingProtocolId({ completedToday: true, stress: 8, hourUtc: 14 }),
      'post_workout_recovery'
    );
  });
});

describe('computeBreathingStreakDays', () => {
  it('counts consecutive days ending today', () => {
    const today = '2026-07-16';
    const completed = [
      '2026-07-16T10:00:00.000Z',
      '2026-07-15T09:00:00.000Z',
      '2026-07-14T08:00:00.000Z',
      '2026-07-12T08:00:00.000Z',
    ];
    assert.equal(computeBreathingStreakDays(completed, today), 3);
  });

  it('returns 0 when today has no session', () => {
    assert.equal(
      computeBreathingStreakDays(['2026-07-14T08:00:00.000Z'], '2026-07-16'),
      0
    );
  });
});

describe('validateRecoverySessionBody', () => {
  it('accepts a completed session payload', () => {
    const parsed = validateRecoverySessionBody({
      protocolId: 'stress_reset',
      status: 'completed',
      startedAt: '2026-07-16T10:00:00.000Z',
      completedAt: '2026-07-16T10:02:00.000Z',
      durationSec: 120,
      plannedDurationSec: 120,
      context: 'mind_center',
      moodBefore: 2,
      moodAfter: 4,
    });
    assert.equal(parsed.ok, true);
    if (parsed.ok) {
      assert.equal(parsed.input.protocolId, 'stress_reset');
      assert.equal(parsed.input.status, 'completed');
    }
  });

  it('rejects completed without completedAt', () => {
    const parsed = validateRecoverySessionBody({
      protocolId: 'box_breathing',
      status: 'completed',
      startedAt: '2026-07-16T10:00:00.000Z',
    });
    assert.equal(parsed.ok, false);
  });

  it('rejects invalid mood range', () => {
    const parsed = validateRecoverySessionBody({
      protocolId: 'box_breathing',
      status: 'started',
      startedAt: '2026-07-16T10:00:00.000Z',
      moodBefore: 9,
    });
    assert.equal(parsed.ok, false);
  });
});
