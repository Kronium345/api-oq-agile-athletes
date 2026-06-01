import quizCategoriesData from '../data/quizCategories.json' with { type: 'json' };
import quizQuestionsData from '../data/quizQuestions.json' with { type: 'json' };
import { clearCategories, clearQuestions, countCategories, countQuestions, getAllCategories, getAllQuestions, insertCategories, insertQuestions, } from "../models/quiz.js";
import { DEFAULT_QUIZ_CATEGORIES } from "../utils/mentalClassifier.js";
import { QUIZ_KEY_ORDER, REQUIRED_QUIZ_KEYS } from "../utils/quizValidation.js";
const EXPECTED_QUESTION_COUNT = REQUIRED_QUIZ_KEYS.length;
const DEFAULT_QUESTIONS = quizQuestionsData.map((q) => ({
    ...q,
    selected: null,
}));
const DEFAULT_CATEGORIES = quizCategoriesData;
function sortQuestions(questions) {
    return [...questions].sort((a, b) => {
        const ai = QUIZ_KEY_ORDER[a.name] ?? 999;
        const bi = QUIZ_KEY_ORDER[b.name] ?? 999;
        return ai - bi;
    });
}
function categoriesAreValid(categories) {
    if (categories.length !== DEFAULT_QUIZ_CATEGORIES.length)
        return false;
    return DEFAULT_QUIZ_CATEGORIES.every((expected) => categories.some((c) => c.label === expected.label && c.category === expected.category));
}
function questionsAreValid(questions) {
    if (questions.length !== EXPECTED_QUESTION_COUNT)
        return false;
    const names = new Set(questions.map((q) => q.name));
    return REQUIRED_QUIZ_KEYS.every((key) => names.has(key));
}
export async function ensureQuizCategoriesSeeded() {
    const existing = await getAllCategories();
    if (categoriesAreValid(existing)) {
        return { seeded: false, count: existing.length, repaired: false };
    }
    if (existing.length > 0) {
        console.warn('[quiz] outcome categories invalid or legacy (e.g. Low Anxiety) — replacing with 4-class matrix');
        await clearCategories();
    }
    const toInsert = DEFAULT_CATEGORIES.length > 0 ? DEFAULT_CATEGORIES : [...DEFAULT_QUIZ_CATEGORIES];
    await insertCategories(toInsert);
    const count = await countCategories();
    console.log(`[quiz] seeded ${count} outcome categories`);
    return { seeded: true, count, repaired: existing.length > 0 };
}
export async function ensureQuizQuestionsSeeded() {
    const all = sortQuestions(await getAllQuestions());
    if (questionsAreValid(all)) {
        return { seeded: false, count: all.length, repaired: false };
    }
    if (all.length > 0) {
        console.warn(`[quiz] questions invalid (expected ${EXPECTED_QUESTION_COUNT}, got ${all.length}) — reseeding from data/quizQuestions.json`);
        await clearQuestions();
    }
    await insertQuestions(DEFAULT_QUESTIONS);
    const count = await countQuestions();
    console.log(`[quiz] seeded ${count} assessment questions`);
    return { seeded: true, count, repaired: all.length > 0 };
}
/** Seed categories and questions when missing or legacy data detected. */
export async function ensureQuizDataSeeded() {
    await ensureQuizCategoriesSeeded();
    await ensureQuizQuestionsSeeded();
}
export async function getQuizBootstrapStatus() {
    const questions = sortQuestions(await getAllQuestions());
    const categories = await getAllCategories();
    return {
        questionsCount: questions.length,
        categoriesCount: categories.length,
        expectedQuestions: EXPECTED_QUESTION_COUNT,
        expectedCategories: DEFAULT_QUIZ_CATEGORIES.length,
        readyForPredict: categoriesAreValid(categories),
        readyForQuizUi: questionsAreValid(questions),
        classifier: 'mental-4class-v1 (anger s12–s18, anxiety s19–s25, risk s3–s11 adjusts thresholds)',
        outcomeLabels: DEFAULT_QUIZ_CATEGORIES.map((c) => c.category),
    };
}
