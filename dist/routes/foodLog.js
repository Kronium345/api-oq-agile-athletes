import express from 'express';
import { addCaloriesToDailyIntake } from "../models/caloriePreferences.js";
import { createFoodLog, getFoodLogsByUserId, serializeLog } from "../models/foodLog.js";
import { routeParam } from "../utils/routeParams.js";
const router = express.Router();
router.post('/log', async (req, res) => {
    const { userId, label, cal, carbohydrates, fats, proteins, sugars, imageUrl } = req.body;
    if (!userId || !label || cal === undefined) {
        return res.status(400).json({ message: 'userId, label, and cal are required' });
    }
    try {
        const foodLogEntry = await createFoodLog({
            userId,
            label,
            cal: Number(cal),
            carbohydrates: Number(carbohydrates ?? 0),
            fats: Number(fats ?? 0),
            proteins: Number(proteins ?? 0),
            sugars: Number(sugars ?? 0),
            imageUrl: imageUrl || 'N/A',
        });
        await addCaloriesToDailyIntake(userId, Number(cal));
        return res.status(201).send(serializeLog(foodLogEntry));
    }
    catch (error) {
        const err = error;
        return res.status(400).json({ message: 'Failed to log food', error: err.message });
    }
});
router.get('/log/:userId', async (req, res) => {
    try {
        const dateParam = typeof req.query.date === 'string' ? req.query.date : undefined;
        const foodLog = await getFoodLogsByUserId(routeParam(req.params.userId), dateParam);
        return res.send(foodLog.map((entry) => serializeLog(entry)));
    }
    catch (error) {
        const err = error;
        return res.status(500).json({ message: 'Failed to fetch food logs', error: err.message });
    }
});
export default router;
