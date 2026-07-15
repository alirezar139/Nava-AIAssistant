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
  treeOptions?: Array<{ label: string; targetId: string }>;
  quickReplies?: string[];
  feedback?: 'helpful' | 'unhelpful';
  conversationId?: number;
  rating?: number;
  ratingSubmitted?: boolean;
  ratingSubmitting?: boolean;
  ratingMessage?: string;
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
  rating?: number | null;
  ratingSubmittedAt?: string | null;
  createdAt: string;
  userFullName: string;
  username: string;
}
