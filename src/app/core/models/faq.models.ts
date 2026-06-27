export type FaqRow = Record<string, string>;

export interface FaqDataset {
  rows: FaqRow[];
  headers: string[];
  fileName: string;
  sheetName: string;
}

export interface FaqAnswer {
  title: string;
  text: string;
  score: number;
}

export interface ChatMessage {
  role: 'user' | 'assistant';
  text: string;
  matches?: FaqAnswer[];
  feedback?: 'helpful' | 'unhelpful';
}

export interface FaqRecord {
  id: number;
  question: string;
  answer: string;
  category: string;
  keywords: string;
  updatedAt: string;
}

export interface ConversationRecord {
  id: number;
  question: string;
  answer: string;
  matchedFaqId: number | null;
  createdAt: string;
  userFullName: string;
  username: string;
}
