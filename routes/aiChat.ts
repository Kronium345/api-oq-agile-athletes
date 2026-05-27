import axios from 'axios';
import express, { Request, Response } from 'express';
import { ObjectId } from 'mongodb';
import {
  deleteChatById,
  getChatById,
  getChatsByUserId,
  saveChat,
  type ChatMessage,
} from '../models/aiChat.js';

const router = express.Router();

function serializeChat(doc: Awaited<ReturnType<typeof getChatById>>) {
  if (!doc) return null;
  return {
    ...doc,
    _id: doc._id?.toString(),
  };
}

router.post('/save-chat', async (req: Request, res: Response) => {
  const { userId, title, messages } = req.body as {
    userId?: string;
    title?: string;
    messages?: ChatMessage[];
  };

  if (!userId || !title) {
    return res.status(400).json({ message: 'userId and title are required' });
  }

  try {
    await saveChat(userId, title, messages || []);
    return res.status(200).json({ message: 'Chat saved successfully!' });
  } catch (error: unknown) {
    console.error('Error saving chat:', error);
    return res.status(500).json({ message: 'Error saving chat' });
  }
});

router.get('/get-chat/:userId', async (req: Request, res: Response) => {
  const { userId } = req.params;

  try {
    const chats = await getChatsByUserId(userId);
    const serialized = chats.map((c) => serializeChat(c));
    return res.status(200).json(serialized);
  } catch (error: unknown) {
    console.error('Error loading chat history:', error);
    return res.status(500).json({ message: 'Error retrieving chat history' });
  }
});

router.delete('/delete-chat/:chatId', async (req: Request, res: Response) => {
  try {
    const { chatId } = req.params;

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
  } catch (error: unknown) {
    const err = error as Error;
    console.error('Error deleting chat:', error);
    return res.status(500).json({
      error: 'Error deleting chat',
      details: err.message,
    });
  }
});

router.post('/generate', async (req: Request, res: Response) => {
  const { prompt } = req.body as { prompt?: string };

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
    const response = await axios.post(
      'https://api.cohere.ai/v1/chat',
      {
        message: prompt,
        model: process.env.COHERE_MODEL || 'command',
        temperature: 0.7,
        chat_history: [],
        prompt_truncation: 'AUTO',
        stream: false,
        citation_quality: 'accurate',
        connectors: [],
        documents: [],
      },
      {
        headers: {
          Authorization: `Bearer ${apiKey}`,
          'Content-Type': 'application/json',
        },
      }
    );

    const text =
      response.data?.text ??
      response.data?.message ??
      response.data?.generations?.[0]?.text ??
      '';

    return res.json({
      generations: [{ text }],
    });
  } catch (error: unknown) {
    const axiosErr = error as { response?: { data?: unknown }; message?: string };
    console.error('AI chat error:', axiosErr.response?.data || error);
    return res.status(500).json({
      error: 'Failed to generate response',
      details: axiosErr.response?.data || axiosErr.message,
    });
  }
});

router.get('/get-chat-by-id/:chatId', async (req: Request, res: Response) => {
  const { chatId } = req.params;

  try {
    if (!ObjectId.isValid(chatId)) {
      return res.status(400).json({ error: 'Invalid chat ID format' });
    }

    const chat = await getChatById(chatId);

    if (!chat) {
      return res.status(404).json({ error: 'Chat not found' });
    }

    return res.status(200).json(serializeChat(chat));
  } catch (error: unknown) {
    const err = error as Error;
    console.error('Error fetching chat by ID:', error);
    return res.status(500).json({
      error: 'Error fetching chat',
      details: err.message,
    });
  }
});

export default router;
