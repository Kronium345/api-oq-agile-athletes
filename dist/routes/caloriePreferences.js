import express from 'express';
import { getCaloriePreferences, upsertCaloriePreferences, } from "../models/caloriePreferences.js";
import { routeParam } from "../utils/routeParams.js";
const router = express.Router();
router.post('/preferences', async (req, res) => {
    const { userId, currentWeight, goalWeight, dailyCalorieIntake, activityLevel, mealPreferences, } = req.body;
    if (!userId || currentWeight === undefined || !activityLevel) {
        return res.status(400).json({
            message: 'userId, currentWeight, and activityLevel are required',
        });
    }
    try {
        const preferences = await upsertCaloriePreferences({
            userId,
            currentWeight: Number(currentWeight),
            goalWeight: goalWeight !== undefined ? Number(goalWeight) : undefined,
            dailyCalorieIntake: Number(dailyCalorieIntake ?? 0),
            activityLevel,
            mealPreferences,
        });
        return res.status(201).send(preferences);
    }
    catch (error) {
        const err = error;
        return res.status(400).json({ message: 'Failed to save preferences', error: err.message });
    }
});
router.get('/preferences/:userId', async (req, res) => {
    try {
        const preferences = await getCaloriePreferences(routeParam(req.params.userId));
        if (!preferences) {
            return res.status(404).send();
        }
        return res.send(preferences);
    }
    catch (error) {
        const err = error;
        return res.status(500).json({ message: 'Failed to fetch preferences', error: err.message });
    }
});
export default router;
