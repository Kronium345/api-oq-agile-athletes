import { Collection, ObjectId } from 'mongodb';
import { getMongoClient, getMongoDbName } from '../config/mongoClient.js';

const AI_CHAT_TABLE = process.env.MONGO_AI_CHAT_COLLECTION || 'ai_chats';

export interface ChatMessage {
  text: string;
  type?: 'user' | 'bot' | string;
  createdAt?: string | Date;
}

export interface AIChatDocument {
  _id?: ObjectId;
  userId: string;
  title: string;
  messages: ChatMessage[];
  savedAt: string | Date;
}

function getChatCollection(): Collection<AIChatDocument> {
  const client = getMongoClient();
  const db = client.db(getMongoDbName());
  return db.collection<AIChatDocument>(AI_CHAT_TABLE);
}

function normalizeMessages(messages: ChatMessage[]): ChatMessage[] {
  const now = new Date().toISOString();
  return (messages || []).map((m) => ({
    text: m.text ?? '',
    ...(m.type ? { type: m.type } : {}),
    createdAt: m.createdAt ? new Date(m.createdAt).toISOString() : now,
  }));
}

async function saveChat(
  userId: string,
  title: string,
  messages: ChatMessage[]
): Promise<AIChatDocument> {
  const collection = getChatCollection();
  const savedAt = new Date().toISOString();
  const normalized = normalizeMessages(messages);

  const existing = await collection.findOne({ userId, title });
  if (!existing) {
    const doc: AIChatDocument = { userId, title, messages: normalized, savedAt };
    const result = await collection.insertOne(doc);
    return { ...doc, _id: result.insertedId };
  }

  await collection.updateOne(
    { userId, title },
    { $set: { messages: normalized, savedAt } }
  );
  const updated = await collection.findOne({ userId, title });
  return updated!;
}

async function getChatsByUserId(userId: string): Promise<AIChatDocument[]> {
  const collection = getChatCollection();
  return collection.find({ userId }).sort({ savedAt: -1 }).toArray();
}

async function getChatById(chatId: string): Promise<AIChatDocument | null> {
  if (!ObjectId.isValid(chatId)) return null;
  const collection = getChatCollection();
  return collection.findOne({ _id: new ObjectId(chatId) });
}

async function deleteChatById(chatId: string): Promise<AIChatDocument | null> {
  if (!ObjectId.isValid(chatId)) return null;
  const collection = getChatCollection();
  const deleted = await collection.findOneAndDelete({ _id: new ObjectId(chatId) });
  return deleted ?? null;
}

async function deleteChatsByUserId(userId: string): Promise<number> {
  const collection = getChatCollection();
  const result = await collection.deleteMany({ userId });
  return result.deletedCount;
}

export {
  deleteChatById,
  deleteChatsByUserId,
  getChatById,
  getChatsByUserId,
  saveChat,
};
