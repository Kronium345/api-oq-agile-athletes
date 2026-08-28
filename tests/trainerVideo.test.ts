import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { buildTrainerVideoStorageKey } from '../services/trainerVideoStorage.ts';
import {
  canMemberPlayVideo,
  parseAssignedMemberIds,
  validateTrainerVideoDescription,
  validateTrainerVideoTitle,
} from '../utils/trainerVideoValidation.ts';

describe('trainerVideoValidation', () => {
  it('parses assignedMemberIds from JSON string', () => {
    const parsed = parseAssignedMemberIds('["64f1a2b3c4d5e6f7a8b9c0d1","550e8400-e29b-41d4-a716-446655440000"]');
    assert.equal(parsed.ok, true);
    if (parsed.ok) {
      assert.equal(parsed.ids.length, 2);
    }
  });

  it('rejects invalid assignedMemberIds JSON', () => {
    const parsed = parseAssignedMemberIds('not-json');
    assert.equal(parsed.ok, false);
  });

  it('validates title and description', () => {
    assert.equal(validateTrainerVideoTitle('').ok, false);
    assert.equal(validateTrainerVideoTitle('RDL cues').ok, true);
    assert.equal(validateTrainerVideoDescription(undefined).ok, true);
  });

  it('checks member assignment access', () => {
    const video = { assignedMemberIds: ['user-a'] };
    assert.equal(canMemberPlayVideo(video, 'user-a'), true);
    assert.equal(canMemberPlayVideo(video, 'user-b'), false);
  });
});

describe('trainerVideoStorage', () => {
  it('builds stable object keys', () => {
    assert.equal(
      buildTrainerVideoStorageKey('trainer-1', 'video-1'),
      'trainer-videos/trainer-1/video-1.mp4'
    );
  });
});
