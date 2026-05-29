import express from 'express';
import { ObjectId } from 'mongodb';
import { createFoodScan, deleteFoodScan, findScansInRange, getFoodScanById, getFoodScansByUserId, serializeScan, } from "../models/foodScan.js";
import { analyzeImage, foodKeywords, nutrientsWithAliases, } from "../services/foodService.js";
import { endOfDay, endOfMonth, endOfWeek, formatYyyyMmDd, parseYyyyMmDd, startOfDay, startOfMonth, startOfWeek, } from "../utils/dateRanges.js";
import { routeParam } from "../utils/routeParams.js";
const router = express.Router();
function mapFoodItemsForResponse(items) {
    return items.map((item) => ({
        ...item,
        nutrients: item.nutrients ? nutrientsWithAliases(item.nutrients) : null,
    }));
}
function mapScanForResponse(scan) {
    if (!scan)
        return null;
    const serialized = serializeScan(scan);
    return {
        ...serialized,
        foodItems: mapFoodItemsForResponse(scan.foodItems),
    };
}
function resolveUserIdFilter(req) {
    const fromQuery = req.query.userId;
    if (typeof fromQuery === 'string' && fromQuery.trim())
        return fromQuery.trim();
    return undefined;
}
router.post('/', async (req, res) => {
    const { userId, foodItems } = req.body;
    if (!userId) {
        return res.status(400).json({ message: 'User ID is required' });
    }
    try {
        const saved = await createFoodScan(userId, foodItems || []);
        return res.status(201).json(mapScanForResponse(saved));
    }
    catch (error) {
        const err = error;
        return res.status(500).json({ message: 'Error creating food scan', error: err.message });
    }
});
router.post('/analyze', async (req, res) => {
    const { userId, imagePath } = req.body;
    if (!userId || !imagePath) {
        return res.status(400).json({ message: 'User ID and image path are required' });
    }
    try {
        const imageBase64 = imagePath.replace(/^data:image\/\w+;base64,/, '');
        const foodItems = await analyzeImage(imageBase64);
        const validFoodItems = foodItems.filter((item) => item.nutrients !== null);
        const saved = await createFoodScan(userId, validFoodItems);
        return res.status(201).json(mapScanForResponse(saved));
    }
    catch (error) {
        const err = error;
        console.error('Error analyzing image', err.response?.data || err);
        return res.status(500).json({ message: 'Failed to analyze image', error: err.message });
    }
});
router.get('/scans/month/:year/:month', async (req, res) => {
    try {
        const year = Number(routeParam(req.params.year));
        const month = Number(routeParam(req.params.month));
        if (!year || !month || month < 1 || month > 12) {
            return res.status(400).json({ message: 'Invalid year or month' });
        }
        const userId = resolveUserIdFilter(req);
        const start = startOfMonth(year, month);
        const end = endOfMonth(year, month);
        const scans = await findScansInRange(start, end, userId);
        return res.json({
            totalScans: scans.length,
            scans: scans.map((s) => mapScanForResponse(s)),
        });
    }
    catch (error) {
        const err = error;
        return res.status(500).json({ message: 'Failed to fetch monthly scans', error: err.message });
    }
});
router.get('/scans/week', async (req, res) => {
    try {
        const userId = resolveUserIdFilter(req);
        const scans = await findScansInRange(startOfWeek(), endOfWeek(), userId);
        return res.json({
            totalScans: scans.length,
            scans: scans.map((s) => mapScanForResponse(s)),
        });
    }
    catch (error) {
        const err = error;
        return res.status(500).json({ message: 'Failed to fetch weekly scans', error: err.message });
    }
});
router.get('/scans/today', async (req, res) => {
    try {
        const userId = resolveUserIdFilter(req);
        const today = new Date();
        const scans = await findScansInRange(startOfDay(today), endOfDay(today), userId);
        return res.json({
            totalScans: scans.length,
            scans: scans.map((s) => mapScanForResponse(s)),
        });
    }
    catch (error) {
        const err = error;
        return res.status(500).json({ message: 'Failed to fetch today scans', error: err.message });
    }
});
router.get('/scans/date/:date', async (req, res) => {
    try {
        const day = parseYyyyMmDd(routeParam(req.params.date));
        if (!day) {
            return res.status(400).json({ message: 'Invalid date format. Use YYYY-MM-DD' });
        }
        const userId = resolveUserIdFilter(req);
        const scans = await findScansInRange(startOfDay(day), endOfDay(day), userId);
        return res.json({ scans: scans.map((s) => mapScanForResponse(s)) });
    }
    catch (error) {
        const err = error;
        return res.status(500).json({ message: 'Failed to fetch scans for date', error: err.message });
    }
});
router.get('/scans/last-three-days', async (req, res) => {
    try {
        const userId = resolveUserIdFilter(req);
        const data = [];
        for (let i = 2; i >= 0; i--) {
            const day = new Date();
            day.setDate(day.getDate() - i);
            const start = startOfDay(day);
            const end = endOfDay(day);
            const scans = await findScansInRange(start, end, userId);
            data.push({
                date: formatYyyyMmDd(day),
                scans: scans.map((s) => mapScanForResponse(s)),
            });
        }
        return res.json({ data });
    }
    catch (error) {
        const err = error;
        console.error('Error fetching scans for last three days', err);
        return res.status(500).json({ message: 'Failed to fetch last three days', error: err.message });
    }
});
router.get('/:userId', async (req, res) => {
    try {
        const scans = await getFoodScansByUserId(routeParam(req.params.userId));
        return res.json(scans.map((s) => mapScanForResponse(s)));
    }
    catch (error) {
        const err = error;
        return res.status(500).json({ message: 'Error fetching food scans', error: err.message });
    }
});
router.get('/:userId/:id', async (req, res) => {
    try {
        const userId = routeParam(req.params.userId);
        const id = routeParam(req.params.id);
        if (!ObjectId.isValid(id)) {
            return res.status(400).json({ message: 'Invalid scan ID' });
        }
        const scan = await getFoodScanById(userId, id);
        if (!scan) {
            return res.status(404).json({ message: 'Food scan not found' });
        }
        return res.json(mapScanForResponse(scan));
    }
    catch (error) {
        const err = error;
        return res.status(500).json({ message: 'Error fetching food scan', error: err.message });
    }
});
router.delete('/:userId/:id', async (req, res) => {
    try {
        const userId = routeParam(req.params.userId);
        const id = routeParam(req.params.id);
        if (!ObjectId.isValid(id)) {
            return res.status(400).json({ message: 'Invalid scan ID' });
        }
        const deleted = await deleteFoodScan(userId, id);
        if (!deleted) {
            return res.status(404).json({ message: 'Food scan not found' });
        }
        return res.json({ message: 'Food scan deleted successfully' });
    }
    catch (error) {
        const err = error;
        return res.status(500).json({ message: 'Error deleting food scan', error: err.message });
    }
});
export { foodKeywords };
export default router;
