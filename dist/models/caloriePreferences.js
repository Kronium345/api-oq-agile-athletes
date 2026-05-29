import { getMongoClient, getMongoDbName } from "../config/mongoClient.js";
const CALORIE_PREFERENCES_TABLE = process.env.MONGO_CALORIE_PREFERENCES_COLLECTION || 'calorie_preferences';
const defaultMealPreferences = () => ({
    breakfast: false,
    morningSnack: false,
    lunch: false,
    afternoonSnack: false,
    dinner: false,
    eveningSnack: false,
});
function getCaloriePreferencesCollection() {
    const client = getMongoClient();
    return client.db(getMongoDbName()).collection(CALORIE_PREFERENCES_TABLE);
}
async function getCaloriePreferences(userId) {
    return getCaloriePreferencesCollection().findOne({ userId });
}
async function upsertCaloriePreferences(data) {
    const collection = getCaloriePreferencesCollection();
    const now = new Date().toISOString();
    const existing = await collection.findOne({ userId: data.userId });
    if (existing) {
        const updated = {
            ...existing,
            ...data,
            mealPreferences: data.mealPreferences ?? existing.mealPreferences,
            updatedAt: now,
        };
        await collection.replaceOne({ userId: data.userId }, updated);
        return updated;
    }
    const created = {
        userId: data.userId,
        currentWeight: data.currentWeight,
        goalWeight: data.goalWeight,
        dailyCalorieIntake: data.dailyCalorieIntake ?? 0,
        activityLevel: data.activityLevel,
        mealPreferences: data.mealPreferences ?? defaultMealPreferences(),
        createdAt: now,
        updatedAt: now,
    };
    await collection.insertOne(created);
    return created;
}
async function addCaloriesToDailyIntake(userId, cal) {
    const collection = getCaloriePreferencesCollection();
    const prefs = await collection.findOne({ userId });
    if (!prefs)
        return;
    await collection.updateOne({ userId }, {
        $inc: { dailyCalorieIntake: cal },
        $set: { updatedAt: new Date().toISOString() },
    });
}
async function deleteCaloriePreferencesByUserId(userId) {
    const result = await getCaloriePreferencesCollection().deleteMany({ userId });
    return result.deletedCount;
}
export { addCaloriesToDailyIntake, deleteCaloriePreferencesByUserId, getCaloriePreferences, upsertCaloriePreferences, };
