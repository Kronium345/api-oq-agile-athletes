import axios, { type AxiosError } from 'axios';
import type { ChatMessage } from '../models/aiChat.ts';

export class CohereChatError extends Error {
  statusCode: number;
  details?: unknown;

  constructor(message: string, statusCode: number, details?: unknown) {
    super(message);
    this.name = 'CohereChatError';
    this.statusCode = statusCode;
    this.details = details;
  }
}

function getApiKey(): string {
  const key = process.env.COHERE_API_KEY?.trim();
  if (!key) {
    throw new CohereChatError(
      'AI service is not configured. Set COHERE_API_KEY on Render.',
      503
    );
  }
  return key;
}

function getModel(): string {
  return process.env.COHERE_MODEL?.trim() || 'command';
}

function getTimeoutMs(): number {
  return Number(process.env.COHERE_TIMEOUT_MS || 60_000);
}

/** Map app messages to Cohere chat_history (USER / CHATBOT). */
export function toCohereChatHistory(
  messages: ChatMessage[]
): Array<{ role: 'USER' | 'CHATBOT'; message: string }> {
  return (messages || [])
    .filter((m) => typeof m.text === 'string' && m.text.trim())
    .map((m) => {
      const role =
        m.type === 'user' || m.type === 'USER' ? ('USER' as const) : ('CHATBOT' as const);
      return { role, message: m.text.trim() };
    });
}

export interface GenerateChatOptions {
  prompt: string;
  chatHistory?: ChatMessage[];
}

export async function generateCohereReply(
  options: GenerateChatOptions
): Promise<{ text: string; model: string }> {
  const { prompt, chatHistory = [] } = options;
  const trimmedPrompt = prompt.trim();
  if (!trimmedPrompt) {
    throw new CohereChatError('prompt is required', 400);
  }

  const history = toCohereChatHistory(chatHistory);

  try {
    const response = await axios.post<{
      text?: string;
      message?: string;
      generations?: Array<{ text?: string }>;
    }>(
      'https://api.cohere.ai/v1/chat',
      {
        message: trimmedPrompt,
        model: getModel(),
        temperature: Number(process.env.COHERE_TEMPERATURE || 0.7),
        chat_history: history,
        prompt_truncation: 'AUTO',
        stream: false,
        citation_quality: 'accurate',
        connectors: [],
        documents: [],
      },
      {
        headers: {
          Authorization: `Bearer ${getApiKey()}`,
          'Content-Type': 'application/json',
        },
        timeout: getTimeoutMs(),
      }
    );

    const text =
      response.data?.text ??
      response.data?.message ??
      response.data?.generations?.[0]?.text ??
      '';

    if (!text) {
      throw new CohereChatError('Cohere returned an empty response', 502, response.data);
    }

    return { text, model: getModel() };
  } catch (error: unknown) {
    if (error instanceof CohereChatError) {
      throw error;
    }

    if (axios.isAxiosError(error)) {
      const axiosErr = error as AxiosError<{ message?: string }>;
      const status = axiosErr.response?.status;
      const detail = axiosErr.response?.data;

      if (status === 401 || status === 403) {
        throw new CohereChatError('Cohere authentication failed. Check COHERE_API_KEY.', status, detail);
      }
      if (status === 429) {
        throw new CohereChatError('Cohere rate limit exceeded. Try again shortly.', 429, detail);
      }
      if (axiosErr.code === 'ECONNABORTED') {
        throw new CohereChatError('AI request timed out. Try again.', 504);
      }

      throw new CohereChatError(
        'Failed to generate response from Cohere',
        status || 502,
        detail
      );
    }

    const err = error as Error;
    throw new CohereChatError(err.message || 'Failed to generate response', 502);
  }
}

/** Legacy mobile shape: { generations: [{ text }] } */
export function toGenerationsResponse(text: string) {
  return {
    generations: [{ text }],
  };
}
