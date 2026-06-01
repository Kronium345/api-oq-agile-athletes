import { Collection } from 'mongodb';
import { getMongoClient, getMongoDbName } from '../config/mongoClient.ts';

const QUIZ_QUESTIONS_TABLE = process.env.MONGO_QUIZ_QUESTIONS_COLLECTION || 'quiz_questions';
const QUIZ_CATEGORIES_TABLE = process.env.MONGO_QUIZ_CATEGORIES_COLLECTION || 'quiz_categories';

export interface QuizOption {
  text: string;
  value: number;
}

export interface QuizQuestion {
  name: string;
  text: string;
  options: QuizOption[];
  selected?: number | null;
}

export interface QuizCategory {
  label: number;
  category: string;
  description: string;
  suggestion: string;
}

function getQuestionsCollection(): Collection<QuizQuestion> {
  const client = getMongoClient();
  const db = client.db(getMongoDbName());
  return db.collection<QuizQuestion>(QUIZ_QUESTIONS_TABLE);
}

function getCategoriesCollection(): Collection<QuizCategory> {
  const client = getMongoClient();
  const db = client.db(getMongoDbName());
  return db.collection<QuizCategory>(QUIZ_CATEGORIES_TABLE);
}

async function getAllQuestions(): Promise<QuizQuestion[]> {
  return getQuestionsCollection().find({}).toArray();
}

async function countQuestions(): Promise<number> {
  return getQuestionsCollection().countDocuments();
}

async function insertQuestions(questions: QuizQuestion[]): Promise<QuizQuestion[]> {
  if (!questions.length) return [];
  const result = await getQuestionsCollection().insertMany(questions);
  return questions.map((q, i) => ({ ...q, _id: result.insertedIds[i] } as QuizQuestion & { _id: unknown }));
}

async function insertCategories(categories: QuizCategory[]): Promise<QuizCategory[]> {
  if (!categories.length) return [];
  const result = await getCategoriesCollection().insertMany(categories);
  return categories.map((c, i) => ({ ...c, _id: result.insertedIds[i] } as QuizCategory & { _id: unknown }));
}

async function getCategoryByName(category: string): Promise<QuizCategory | null> {
  return getCategoriesCollection().findOne({ category });
}

async function getCategoryByLabel(label: number): Promise<QuizCategory | null> {
  return getCategoriesCollection().findOne({ label });
}

async function getAllCategories(): Promise<QuizCategory[]> {
  return getCategoriesCollection().find({}).sort({ label: 1 }).toArray();
}

async function countCategories(): Promise<number> {
  return getCategoriesCollection().countDocuments();
}

async function clearQuestions(): Promise<void> {
  await getQuestionsCollection().deleteMany({});
}

async function clearCategories(): Promise<void> {
  await getCategoriesCollection().deleteMany({});
}

/** Shape expected by Mind Center Quiz.jsx (selected cleared per session). */
function normalizeQuestionForApi(question: QuizQuestion): QuizQuestion {
  return {
    name: question.name,
    text: question.text,
    options: question.options,
    selected: question.selected ?? null,
  };
}

export {
  clearCategories,
  clearQuestions,
  countCategories,
  countQuestions,
  getAllCategories,
  getAllQuestions,
  getCategoriesCollection,
  getCategoryByLabel,
  getCategoryByName,
  insertCategories,
  insertQuestions,
  normalizeQuestionForApi,
};
