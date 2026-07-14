import {
  ConversationRecord,
  database,
  DiagnosticCaseRecord,
  ExternalServiceRecord,
  FaqRecord,
  nextId,
  TicketServiceSettingsRecord,
  UserRecord
} from './database.js';

export type FaqInput = Pick<FaqRecord, 'question' | 'answer' | 'category' | 'keywords'>;

export interface ConversationWithUser extends ConversationRecord {
  userFullName: string;
  username: string;
}

export interface DiagnosticCaseWithUser extends DiagnosticCaseRecord {
  userFullName: string;
  username: string;
}

export const userRepository = {
  findByUsername(username: string): UserRecord | undefined {
    return database.data.users.find((user) => user.username === username);
  },

  findById(id: number): UserRecord | undefined {
    return database.data.users.find((user) => user.id === id);
  }
};

export const faqRepository = {
  list(): FaqRecord[] {
    return [...database.data.faqs].sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));
  },

  exists(id: number): boolean {
    return database.data.faqs.some((faq) => faq.id === id);
  },

  async create(input: FaqInput): Promise<FaqRecord> {
    const faq: FaqRecord = {
      id: nextId(database.data.faqs),
      ...input,
      updatedAt: new Date().toISOString()
    };
    database.data.faqs.push(faq);
    await database.write();
    return faq;
  },

  async replaceAll(rows: FaqInput[]): Promise<number> {
    const timestamp = new Date().toISOString();
    database.data.faqs = rows.map((faq, index) => ({ id: index + 1, ...faq, updatedAt: timestamp }));
    await database.write();
    return rows.length;
  },

  async deleteMany(ids: number[]): Promise<number> {
    const selectedIds = new Set(ids);
    const previousCount = database.data.faqs.length;
    database.data.faqs = database.data.faqs.filter((faq) => !selectedIds.has(faq.id));
    await database.write();
    return previousCount - database.data.faqs.length;
  },

  async update(id: number, input: FaqInput): Promise<FaqRecord | null> {
    const faq = database.data.faqs.find((item) => item.id === id);
    if (!faq) return null;
    Object.assign(faq, input, { updatedAt: new Date().toISOString() });
    await database.write();
    return faq;
  },

  async delete(id: number): Promise<boolean> {
    const exists = this.exists(id);
    if (!exists) return false;
    database.data.faqs = database.data.faqs.filter((faq) => faq.id !== id);
    await database.write();
    return true;
  }
};

export const conversationRepository = {
  listWithUsers(): ConversationWithUser[] {
    return database.data.conversations
      .map((conversation) => {
        const user = userRepository.findById(conversation.userId);
        return {
          ...conversation,
          userFullName: user?.fullName ?? 'کاربر حذف‌شده',
          username: user?.username ?? '-'
        };
      })
      .sort((a, b) => b.createdAt.localeCompare(a.createdAt));
  },

  async create(input: {
    userId: number;
    question: string;
    answer: string;
    matchedFaqId: number | null;
  }): Promise<ConversationRecord> {
    const conversation: ConversationRecord = {
      id: nextId(database.data.conversations),
      userId: input.userId,
      question: input.question,
      answer: input.answer,
      matchedFaqId: input.matchedFaqId,
      createdAt: new Date().toISOString()
    };
    database.data.conversations.push(conversation);
    await database.write();
    return conversation;
  }
};

export const diagnosticRepository = {
  nextId(): number {
    return nextId(database.data.diagnosticCases);
  },

  listWithUsers(): DiagnosticCaseWithUser[] {
    return database.data.diagnosticCases
      .map((item) => {
        const user = userRepository.findById(item.userId);
        return {
          ...item,
          userFullName: user?.fullName ?? 'کاربر حذف‌شده',
          username: user?.username ?? '-'
        };
      })
      .sort((a, b) => b.createdAt.localeCompare(a.createdAt));
  },

  findById(id: number): DiagnosticCaseRecord | undefined {
    return database.data.diagnosticCases.find((candidate) => candidate.id === id);
  },

  async create(input: DiagnosticCaseRecord): Promise<DiagnosticCaseRecord> {
    database.data.diagnosticCases.push(input);
    await database.write();
    return input;
  },

  async save(): Promise<void> {
    await database.write();
  }
};

const emptyTicketServiceSettings = (): TicketServiceSettingsRecord => ({
  url: '',
  authorizationHeader: '',
  authHeader: '',
  serviceDeskId: '',
  requestTypeId: '',
  requestTypeMappings: [],
  updatedAt: null
});

export const settingsRepository = {
  getTicketServiceSettings(): TicketServiceSettingsRecord {
    database.data.settings ??= { ticketService: emptyTicketServiceSettings() };
    database.data.settings.ticketService ??= emptyTicketServiceSettings();
    const settings = database.data.settings.ticketService;
    settings.url ??= '';
    settings.authorizationHeader ??= '';
    settings.authHeader ??= '';
    settings.serviceDeskId ??= '';
    settings.requestTypeId ??= '';
    settings.requestTypeMappings ??= [];
    settings.updatedAt ??= null;
    return settings;
  },

  async updateTicketServiceSettings(input: TicketServiceSettingsRecord): Promise<TicketServiceSettingsRecord> {
    this.getTicketServiceSettings();
    database.data.settings.ticketService = input;
    await database.write();
    return input;
  }
};

export const externalServiceRepository = {
  list(): ExternalServiceRecord[] {
    database.data.externalServices ??= [];
    return database.data.externalServices;
  },

  listActiveVisible(): ExternalServiceRecord[] {
    return this.list().filter((service) => service.isActive && service.showInAssistant);
  },

  findById(id: number): ExternalServiceRecord | undefined {
    return this.list().find((service) => service.id === id);
  },

  keyExists(key: string, exceptId?: number): boolean {
    return this.list().some((service) => service.key === key && service.id !== exceptId);
  },

  async create(input: Omit<ExternalServiceRecord, 'id'>): Promise<ExternalServiceRecord> {
    const record: ExternalServiceRecord = {
      id: nextId(this.list()),
      ...input
    };
    this.list().push(record);
    await database.write();
    return record;
  },

  async update(id: number, input: ExternalServiceRecord): Promise<ExternalServiceRecord | null> {
    if (!this.findById(id)) return null;
    database.data.externalServices = this.list().map((service) => (service.id === id ? input : service));
    await database.write();
    return input;
  },

  async delete(id: number): Promise<boolean> {
    const existing = this.findById(id);
    if (!existing) return false;
    database.data.externalServices = this.list().filter((service) => service.id !== id);
    await database.write();
    return true;
  }
};
