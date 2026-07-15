import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { normalizeFoodLabel } from "../services/foodLabelMap.js";
import { pickBestFitveteFood } from "../services/fitveteClient.js";
describe('foodLabelMap.normalizeFoodLabel', () => {
    it('maps common aliases', () => {
        assert.equal(normalizeFoodLabel('Rotisserie Chicken'), 'grilled chicken breast');
        assert.equal(normalizeFoodLabel('grilled chicken'), 'grilled chicken breast');
        assert.equal(normalizeFoodLabel('pizza'), 'pizza');
    });
    it('passes through unknown labels in softened form', () => {
        assert.equal(normalizeFoodLabel('  Homemade Lentil Soup '), 'lentil soup');
    });
});
describe('fitveteClient.pickBestFitveteFood', () => {
    it('picks highest confidence', () => {
        const foods = [
            {
                name: 'A',
                calories: 100,
                protein_g: 10,
                carbs_g: 0,
                fat_g: 1,
                confidence: 40,
            },
            {
                name: 'B',
                calories: 165,
                protein_g: 31,
                carbs_g: 0,
                fat_g: 3,
                confidence: 95,
            },
        ];
        assert.equal(pickBestFitveteFood(foods)?.name, 'B');
    });
    it('returns null for empty list', () => {
        assert.equal(pickBestFitveteFood([]), null);
    });
});
