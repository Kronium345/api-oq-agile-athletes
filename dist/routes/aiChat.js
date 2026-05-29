import axios from 'axios';
import express from 'express';
import { ObjectId } from 'mongodb';
import { deleteChatById, getChatById, getChatsByUserId, saveChat, } from "../models/aiChat.js";
import { routeParam } from "../utils/routeParams.js";
const router = express.Router();
function serializeChat(doc) {
    if (!doc)
        return null;
    return {
        ...doc,
        _id: doc._id?.toString(),
    };
}
router.post('/save-chat', async (req, res) => {
    const { userId, title, messages } = req.body;
    if (!userId || !title) {
        return res.status(400).json({ message: 'userId and title are required' });
    }
    try {
        await saveChat(userId, title, messages || []);
        return res.status(200).json({ message: 'Chat saved successfully!' });
    }
    catch (error) {
        console.error('Error saving chat:', error);
        return res.status(500).json({ message: 'Error saving chat' });
    }
});
router.get('/get-chat/:userId', async (req, res) => {
    const userId = routeParam(req.params.userId);
    try {
        const chats = await getChatsByUserId(userId);
        const serialized = chats.map((c) => serializeChat(c));
        return res.status(200).json(serialized);
    }
    catch (error) {
        console.error('Error loading chat history:', error);
        return res.status(500).json({ message: 'Error retrieving chat history' });
    }
});
router.delete('/delete-chat/:chatId', async (req, res) => {
    try {
        const chatId = routeParam(req.params.chatId);
        if (!ObjectId.isValid(chatId)) {
            return res.status(400).json({ error: 'Invalid chat ID format' });
        }
        const deletedChat = await deleteChatById(chatId);
        if (!deletedChat) {
            return res.status(404).json({ error: 'Chat not found' });
        }
        return res.status(200).json({
            message: 'Chat deleted successfully',
            deletedChat: serializeChat(deletedChat),
        });
    }
    catch (error) {
        const err = error;
        console.error('Error deleting chat:', error);
        return res.status(500).json({
            error: 'Error deleting chat',
            details: err.message,
        });
    }
});
router.post('/generate', async (req, res) => {
    const { prompt } = req.body;
    if (!prompt || typeof prompt !== 'string') {
        return res.status(400).json({ error: 'prompt is required' });
    }
    const apiKey = process.env.COHERE_API_KEY;
    if (!apiKey) {
        return res.status(503).json({
            error: 'AI service is not configured',
            details: 'COHERE_API_KEY is missing',
        });
    }
    try {
        const response = await axios.post('https://api.cohere.ai/v1/chat', {
            message: prompt,
            model: process.env.COHERE_MODEL || 'command',
            temperature: 0.7,
            chat_history: [],
            prompt_truncation: 'AUTO',
            stream: false,
            citation_quality: 'accurate',
            connectors: [],
            documents: [],
        }, {
            headers: {
                Authorization: `Bearer ${apiKey}`,
                'Content-Type': 'application/json',
            },
        });
        const text = response.data?.text ??
            response.data?.message ??
            response.data?.generations?.[0]?.text ??
            '';
        return res.json({
            generations: [{ text }],
        });
    }
    catch (error) {
        const axiosErr = error;
        console.error('AI chat error:', axiosErr.response?.data || error);
        return res.status(500).json({
            error: 'Failed to generate response',
            details: axiosErr.response?.data || axiosErr.message,
        });
    }
});
router.get('/get-chat-by-id/:chatId', async (req, res) => {
    const chatId = routeParam(req.params.chatId);
    try {
        if (!ObjectId.isValid(chatId)) {
            return res.status(400).json({ error: 'Invalid chat ID format' });
        }
        const chat = await getChatById(chatId);
        if (!chat) {
            return res.status(404).json({ error: 'Chat not found' });
        }
        return res.status(200).json(serializeChat(chat));
    }
    catch (error) {
        const err = error;
        console.error('Error fetching chat by ID:', error);
        return res.status(500).json({
            error: 'Error fetching chat',
            details: err.message,
        });
    }
});
export default router;
