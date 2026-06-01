import express from 'express';
import { ObjectId } from 'mongodb';
import { deleteChatById, getChatById, getChatsByUserId, saveChat, updateChatById, } from "../models/aiChat.js";
import { CohereChatError, generateCohereReply, toGenerationsResponse, } from "../services/cohereChat.js";
import { chatGenerateRateLimiter } from "../utils/chatRateLimit.js";
import { routeParam } from "../utils/routeParams.js";
const router = express.Router();
function serializeChat(doc) {
    if (!doc)
        return null;
    return {
        ...doc,
        _id: doc._id?.toString(),
        savedAt: doc.savedAt,
    };
}
function validateMessages(messages) {
    if (!Array.isArray(messages))
        return false;
    return messages.every((m) => m &&
        typeof m === 'object' &&
        typeof m.text === 'string' &&
        m.text.trim().length > 0);
}
/** Trainer / AI chat service health (Cohere configured, Mongo reachable). */
router.get('/status', async (_req, res) => {
    const cohereConfigured = Boolean(process.env.COHERE_API_KEY?.trim());
    return res.json({
        success: true,
        service: 'ai-trainer-chat',
        cohereConfigured,
        model: process.env.COHERE_MODEL || 'command',
        rateLimitPerMinute: Number(process.env.CHAT_RATE_LIMIT_PER_MINUTE || 15),
        endpoints: {
            generate: 'POST /chat/generate',
            save: 'POST /chat/save-chat',
            list: 'GET /chat/get-chat/:userId',
            byId: 'GET /chat/get-chat-by-id/:chatId',
            delete: 'DELETE /chat/delete-chat/:chatId',
        },
        hint: cohereConfigured
            ? undefined
            : 'Set COHERE_API_KEY on Render for POST /chat/generate',
    });
});
/**
 * Upsert by userId + title (legacy Fitness One behavior).
 * Optional chatId: update existing document by Mongo _id instead.
 */
router.post('/save-chat', async (req, res) => {
    const { userId, title, messages, chatId } = req.body;
    if (!userId?.trim()) {
        return res.status(400).json({ message: 'userId is required' });
    }
    if (!title?.trim()) {
        return res.status(400).json({ message: 'title is required' });
    }
    if (!validateMessages(messages)) {
        return res.status(400).json({
            message: 'messages must be a non-empty array of { type, text } objects',
        });
    }
    try {
        let saved;
        if (chatId?.trim()) {
            if (!ObjectId.isValid(chatId)) {
                return res.status(400).json({ message: 'Invalid chatId format' });
            }
            saved = await updateChatById(chatId, { title: title.trim(), messages });
            if (!saved) {
                return res.status(404).json({ message: 'Chat not found' });
            }
            if (saved.userId !== userId) {
                return res.status(403).json({ message: 'Chat does not belong to this user' });
            }
        }
        else {
            saved = await saveChat(userId.trim(), title.trim(), messages);
        }
        return res.status(200).json({
            message: 'Chat saved successfully!',
            chat: serializeChat(saved),
        });
    }
    catch (error) {
        console.error('Error saving chat:', error);
        return res.status(500).json({ message: 'Error saving chat' });
    }
});
router.get('/get-chat/:userId', async (req, res) => {
    const userId = routeParam(req.params.userId);
    if (!userId.trim()) {
        return res.status(400).json({ message: 'userId is required' });
    }
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
/**
 * Cohere fitness trainer reply.
 * Body: { prompt: string, chatHistory?: ChatMessage[] }
 * Response (legacy): { generations: [{ text }] }
 */
router.post('/generate', chatGenerateRateLimiter, async (req, res) => {
    const { prompt, chatHistory, messages } = req.body;
    const history = chatHistory ?? messages ?? [];
    try {
        const { text, model } = await generateCohereReply({
            prompt: prompt || '',
            chatHistory: history,
        });
        console.log('[chat] generate ok', { model, promptLength: prompt?.length ?? 0 });
        return res.json(toGenerationsResponse(text));
    }
    catch (error) {
        if (error instanceof CohereChatError) {
            console.error('[chat] generate error:', error.statusCode, error.message);
            return res.status(error.statusCode).json({
                error: error.message,
                details: error.details,
            });
        }
        console.error('[chat] generate error:', error);
        return res.status(500).json({
            error: 'Failed to generate response',
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
