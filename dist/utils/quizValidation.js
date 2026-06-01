/** All assessment item keys (s3–s25). No s1/s2 in Mind Center dataset. */
export const REQUIRED_QUIZ_KEYS = [
    's3', 's4', 's5', 's6', 's7', 's8', 's9', 's10', 's11',
    's12', 's13', 's14', 's15', 's16', 's17', 's18',
    's19', 's20', 's21', 's22', 's23', 's24', 's25',
];
export const QUIZ_KEY_ORDER = Object.fromEntries(REQUIRED_QUIZ_KEYS.map((k, i) => [k, i]));
export function validateQuizFeatures(features) {
    const missing = [];
    const invalid = [];
    for (const key of REQUIRED_QUIZ_KEYS) {
        const raw = features[key];
        if (raw === null || raw === undefined || raw === '') {
            missing.push(key);
            continue;
        }
        const n = Number(raw);
        if (!Number.isFinite(n)) {
            invalid.push(key);
        }
    }
    return {
        valid: missing.length === 0 && invalid.length === 0,
        missing,
        invalid,
    };
}
