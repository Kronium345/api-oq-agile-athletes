import { getMongoClient, getMongoDbName } from "../config/mongoClient.js";
const QUIZ_QUESTIONS_TABLE = process.env.MONGO_QUIZ_QUESTIONS_COLLECTION || 'quiz_questions';
const QUIZ_CATEGORIES_TABLE = process.env.MONGO_QUIZ_CATEGORIES_COLLECTION || 'quiz_categories';
function getQuestionsCollection() {
    const client = getMongoClient();
    const db = client.db(getMongoDbName());
    return db.collection(QUIZ_QUESTIONS_TABLE);
}
function getCategoriesCollection() {
    const client = getMongoClient();
    const db = client.db(getMongoDbName());
    return db.collection(QUIZ_CATEGORIES_TABLE);
}
async function getAllQuestions() {
    return getQuestionsCollection().find({}).toArray();
}
async function countQuestions() {
    return getQuestionsCollection().countDocuments();
}
async function insertQuestions(questions) {
    if (!questions.length)
        return [];
    const result = await getQuestionsCollection().insertMany(questions);
    return questions.map((q, i) => ({ ...q, _id: result.insertedIds[i] }));
}
async function insertCategories(categories) {
    if (!categories.length)
        return [];
    const result = await getCategoriesCollection().insertMany(categories);
    return categories.map((c, i) => ({ ...c, _id: result.insertedIds[i] }));
}
async function getCategoryByName(category) {
    return getCategoriesCollection().findOne({ category });
}
export { countQuestions, getAllQuestions, getCategoriesCollection, getCategoryByName, insertCategories, insertQuestions, };
