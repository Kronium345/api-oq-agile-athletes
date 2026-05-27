import { Collection } from 'mongodb';
import { getMongoClient, getMongoDbName } from '../config/mongoClient.js';

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

export {
  getAllQuestions,
  getCategoryByName,
  insertCategories,
  insertQuestions,
};
