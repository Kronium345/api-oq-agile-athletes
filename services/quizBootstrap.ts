import quizCategoriesData from '../data/quizCategories.json' with { type: 'json' };
import quizQuestionsData from '../data/quizQuestions.json' with { type: 'json' };
import {
  countQuestions,
  getAllQuestions,
  getCategoriesCollection,
  insertCategories,
  insertQuestions,
  type QuizCategory,
  type QuizQuestion,
} from '../models/quiz.ts';
import { DEFAULT_QUIZ_CATEGORIES } from '../utils/mentalClassifier.ts';

const DEFAULT_QUESTIONS = quizQuestionsData as QuizQuestion[];
const DEFAULT_CATEGORIES = quizCategoriesData as QuizCategory[];

export async function ensureQuizCategoriesSeeded(): Promise<{ seeded: boolean; count: number }> {
  const collection = getCategoriesCollection();
  const existing = await collection.countDocuments();
  if (existing > 0) {
    return { seeded: false, count: existing };
  }

  const toInsert =
    DEFAULT_CATEGORIES.length > 0 ? DEFAULT_CATEGORIES : [...DEFAULT_QUIZ_CATEGORIES];
  await insertCategories(toInsert);
  const count = await collection.countDocuments();
  console.log(`[quiz] seeded ${count} outcome categories`);
  return { seeded: true, count };
}

export async function ensureQuizQuestionsSeeded(): Promise<{ seeded: boolean; count: number }> {
  const existing = await countQuestions();
  if (existing > 0) {
    return { seeded: false, count: existing };
  }

  await insertQuestions(DEFAULT_QUESTIONS);
  const count = await countQuestions();
  console.log(`[quiz] seeded ${count} assessment questions`);
  return { seeded: true, count };
}

/** Seed categories and questions when collections are empty (Mind Center). */
export async function ensureQuizDataSeeded(): Promise<void> {
  await ensureQuizCategoriesSeeded();
  await ensureQuizQuestionsSeeded();
}

export async function getQuizBootstrapStatus(): Promise<{
  questionsCount: number;
  categoriesCount: number;
  readyForPredict: boolean;
  readyForQuizUi: boolean;
}> {
  const questions = await getAllQuestions();
  const categoriesCount = await getCategoriesCollection().countDocuments();
  return {
    questionsCount: questions.length,
    categoriesCount,
    readyForPredict: categoriesCount > 0,
    readyForQuizUi: questions.length > 0,
  };
}
