import { aql } from 'arangojs/aql';
import {
  ConversationRecord,
  DashboardMetricLogRecord,
  database,
  DiagnosticCaseRecord,
  ExternalServiceRecord,
  FaqRecord,
  nextId,
  TicketServiceSettingsRecord,
  troubleshootingTreeVersionKey,
  UserRecord
} from './database.js';
import { arangoCollections, getArangoDatabase, isArangoEnabled } from './arango.js';

export type FaqInput = Pick<FaqRecord, 'question' | 'answer' | 'category' | 'keywords'>;

export interface ConversationWithUser extends ConversationRecord {
  userFullName: string;
  username: string;
}

export interface DiagnosticCaseWithUser extends DiagnosticCaseRecord {
  userFullName: string;
  username: string;
}

export interface PaginationOptions {
  page: number;
  pageSize: number;
  search?: string;
  category?: string;
}

export interface PaginatedResult<T> {
  items: T[];
  total: number;
  page: number;
  pageSize: number;
}

export interface PaginatedFaqResult extends PaginatedResult<FaqRecord> {
  categories: string[];
}

type DiagnosticSimilarityInput = Pick<
  DiagnosticCaseRecord,
  | 'id'
  | 'userId'
  | 'systemName'
  | 'processName'
  | 'treeNodeId'
  | 'treeNodeText'
  | 'title'
  | 'problem'
  | 'errorText'
>;

type ArangoRecord<T> = T & {
  _key?: string;
  _id?: string;
  _rev?: string;
};

const ticketServiceSettingsKey = 'ticket_service';

function normalizeDiagnosticText(value: string): string {
  return value
    .toLowerCase()
    .replace(/[^\p{L}\p{N}]+/gu, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function hasMeaningfulMatch(left: string, right: string, minimumLength = 8): boolean {
  const normalizedLeft = normalizeDiagnosticText(left);
  const normalizedRight = normalizeDiagnosticText(right);
  return (
    normalizedLeft.length >= minimumLength &&
    normalizedRight.length >= minimumLength &&
    normalizedLeft === normalizedRight
  );
}

function isSimilarDiagnosticCase(
  source: DiagnosticSimilarityInput,
  candidate: DiagnosticCaseRecord
): boolean {
  if (source.id === candidate.id) return false;

  if (source.treeNodeId.trim() && source.treeNodeId.trim() === candidate.treeNodeId.trim()) {
    return true;
  }

  if (hasMeaningfulMatch(source.errorText, candidate.errorText)) {
    return true;
  }

  const sourcePath = `${source.systemName} ${source.processName} ${source.treeNodeText}`;
  const candidatePath = `${candidate.systemName} ${candidate.processName} ${candidate.treeNodeText}`;
  if (hasMeaningfulMatch(sourcePath, candidatePath, 12)) {
    return true;
  }

  const sourceSummary = `${source.title} ${source.problem}`;
  const candidateSummary = `${candidate.title} ${candidate.problem}`;
  return hasMeaningfulMatch(sourceSummary, candidateSummary, 24);
}

export const userRepository = {
  async findByUsername(username: string): Promise<UserRecord | undefined> {
    if (!isArangoEnabled()) {
      return database.data.users.find((user) => user.username === username);
    }

    const arangoDatabase = getArangoDatabase();
    const users = arangoDatabase.collection<UserRecord>(arangoCollections.users);
    const cursor = await arangoDatabase.query<ArangoRecord<UserRecord>>(aql`
      FOR user IN ${users}
        FILTER user.username == ${username}
        LIMIT 1
        RETURN user
    `);
    return stripArangoMeta(await cursor.next());
  },

  async findById(id: number): Promise<UserRecord | undefined> {
    if (!isArangoEnabled()) {
      return database.data.users.find((user) => user.id === id);
    }

    const arangoDatabase = getArangoDatabase();
    const users = arangoDatabase.collection<UserRecord>(arangoCollections.users);
    const cursor = await arangoDatabase.query<ArangoRecord<UserRecord>>(aql`
      FOR user IN ${users}
        FILTER user.id == ${id}
        LIMIT 1
        RETURN user
    `);
    return stripArangoMeta(await cursor.next());
  }
};

export const faqRepository = {
  async list(): Promise<FaqRecord[]> {
    if (!isArangoEnabled()) {
      return [...database.data.faqs].sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));
    }

    const arangoDatabase = getArangoDatabase();
    const faqs = arangoDatabase.collection<FaqRecord>(arangoCollections.faqs);
    const cursor = await arangoDatabase.query<ArangoRecord<FaqRecord>>(aql`
      FOR faq IN ${faqs}
        SORT faq.updatedAt DESC
        RETURN faq
    `);
    return (await cursor.all()).map((faq) => stripArangoMeta(faq)!);
  },

  async listPage(options: PaginationOptions): Promise<PaginatedFaqResult> {
    const page = normalizePage(options.page);
    const pageSize = normalizePageSize(options.pageSize);
    const offset = (page - 1) * pageSize;
    const search = normalizeSearch(options.search);
    const category = options.category?.trim() ?? '';

    if (!isArangoEnabled()) {
      const categories = [...new Set(database.data.faqs.map((faq) => faq.category).filter(Boolean))].sort();
      const filtered = database.data.faqs
        .filter((faq) => {
          const matchesCategory = !category || faq.category === category;
          const searchable =
            `${faq.question} ${faq.answer} ${faq.category} ${faq.keywords}`.toLocaleLowerCase('fa');
          return matchesCategory && (!search || searchable.includes(search));
        })
        .sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));

      return {
        items: filtered.slice(offset, offset + pageSize),
        total: filtered.length,
        page,
        pageSize,
        categories
      };
    }

    const arangoDatabase = getArangoDatabase();
    const faqs = arangoDatabase.collection<FaqRecord>(arangoCollections.faqs);
    const cursor = await arangoDatabase.query<{
      items: Array<ArangoRecord<FaqRecord>>;
      total: number;
      categories: string[];
    }>(aql`
      LET total = LENGTH(
        FOR faq IN ${faqs}
          LET searchable = LOWER(CONCAT_SEPARATOR(" ", faq.question, faq.answer, faq.category, faq.keywords))
          FILTER (${category} == "" OR faq.category == ${category})
          FILTER (${search} == "" OR CONTAINS(searchable, ${search}))
          RETURN 1
      )
      LET items = (
        FOR faq IN ${faqs}
          LET searchable = LOWER(CONCAT_SEPARATOR(" ", faq.question, faq.answer, faq.category, faq.keywords))
          FILTER (${category} == "" OR faq.category == ${category})
          FILTER (${search} == "" OR CONTAINS(searchable, ${search}))
          SORT faq.updatedAt DESC, faq.id DESC
          LIMIT ${offset}, ${pageSize}
          RETURN faq
      )
      LET categories = (
        FOR faq IN ${faqs}
          FILTER faq.category != null AND faq.category != ""
          COLLECT categoryName = faq.category
          SORT categoryName ASC
          RETURN categoryName
      )
      RETURN {
        items,
        total,
        categories
      }
    `);
    const result = await cursor.next();
    return {
      items: (result?.items ?? []).map((faq) => stripArangoMeta(faq)!),
      total: result?.total ?? 0,
      page,
      pageSize,
      categories: result?.categories ?? []
    };
  },

  async exists(id: number): Promise<boolean> {
    if (!isArangoEnabled()) {
      return database.data.faqs.some((faq) => faq.id === id);
    }

    const arangoDatabase = getArangoDatabase();
    const faqs = arangoDatabase.collection<FaqRecord>(arangoCollections.faqs);
    const cursor = await arangoDatabase.query<number>(aql`
      RETURN LENGTH(
        FOR faq IN ${faqs}
          FILTER faq.id == ${id}
          LIMIT 1
          RETURN faq
      )
    `);
    return ((await cursor.next()) ?? 0) > 0;
  },

  async create(input: FaqInput): Promise<FaqRecord> {
    const faq: FaqRecord = {
      id: await nextRepositoryId(arangoCollections.faqs, database.data.faqs),
      ...input,
      updatedAt: new Date().toISOString()
    };

    if (!isArangoEnabled()) {
      database.data.faqs.push(faq);
      await database.write();
      return faq;
    }

    await saveArangoRecord(arangoCollections.faqs, faq);
    return faq;
  },

  async replaceAll(rows: FaqInput[]): Promise<number> {
    const timestamp = new Date().toISOString();
    const faqs = rows.map((faq, index) => ({ id: index + 1, ...faq, updatedAt: timestamp }));

    if (!isArangoEnabled()) {
      database.data.faqs = faqs;
      await database.write();
      return rows.length;
    }

    const arangoDatabase = getArangoDatabase();
    const collection = arangoDatabase.collection<FaqRecord>(arangoCollections.faqs);
    await arangoDatabase.query(aql`
      FOR faq IN ${collection}
        REMOVE faq IN ${collection}
    `);
    if (faqs.length) {
      await collection.saveAll(
        faqs.map((faq) => ({ _key: String(faq.id), ...faq })),
        { overwriteMode: 'replace' }
      );
    }
    return rows.length;
  },

  async deleteMany(ids: number[]): Promise<number> {
    const selectedIds = new Set(ids);

    if (!isArangoEnabled()) {
      const previousCount = database.data.faqs.length;
      database.data.faqs = database.data.faqs.filter((faq) => !selectedIds.has(faq.id));
      await database.write();
      return previousCount - database.data.faqs.length;
    }

    const arangoDatabase = getArangoDatabase();
    const collection = arangoDatabase.collection<FaqRecord>(arangoCollections.faqs);
    const cursor = await arangoDatabase.query<number>(aql`
      LET removed = (
        FOR faq IN ${collection}
          FILTER faq.id IN ${ids}
          REMOVE faq IN ${collection}
          RETURN OLD
      )
      RETURN LENGTH(removed)
    `);
    return (await cursor.next()) ?? 0;
  },

  async update(id: number, input: FaqInput): Promise<FaqRecord | null> {
    if (!isArangoEnabled()) {
      const faq = database.data.faqs.find((item) => item.id === id);
      if (!faq) return null;
      Object.assign(faq, input, { updatedAt: new Date().toISOString() });
      await database.write();
      return faq;
    }

    const existing = await findArangoById<FaqRecord>(arangoCollections.faqs, id);
    if (!existing) return null;

    const updated: FaqRecord = {
      ...existing,
      ...input,
      updatedAt: new Date().toISOString()
    };
    await saveArangoRecord(arangoCollections.faqs, updated);
    return updated;
  },

  async delete(id: number): Promise<boolean> {
    if (!isArangoEnabled()) {
      const exists = await this.exists(id);
      if (!exists) return false;
      database.data.faqs = database.data.faqs.filter((faq) => faq.id !== id);
      await database.write();
      return true;
    }

    return deleteArangoById(arangoCollections.faqs, id);
  }
};

export const conversationRepository = {
  async listWithUsers(): Promise<ConversationWithUser[]> {
    if (!isArangoEnabled()) {
      return database.data.conversations
        .map((conversation) => {
          const user = database.data.users.find((candidate) => candidate.id === conversation.userId);
          return {
            ...conversation,
            userFullName: user?.fullName ?? 'کاربر حذف‌شده',
            username: user?.username ?? '-'
          };
        })
        .sort((a, b) => b.createdAt.localeCompare(a.createdAt));
    }

    const arangoDatabase = getArangoDatabase();
    const conversations = arangoDatabase.collection<ConversationRecord>(arangoCollections.conversations);
    const users = arangoDatabase.collection<UserRecord>(arangoCollections.users);
    const cursor = await arangoDatabase.query<ArangoRecord<ConversationWithUser>>(aql`
      FOR conversation IN ${conversations}
        LET user = FIRST(
          FOR user IN ${users}
            FILTER user.id == conversation.userId
            RETURN user
        )
        SORT conversation.createdAt DESC
        RETURN MERGE(conversation, {
          userFullName: user.fullName || "کاربر حذف‌شده",
          username: user.username || "-"
        })
    `);
    return (await cursor.all()).map((conversation) => stripArangoMeta(conversation)!);
  },

  async listWithUsersPage(options: PaginationOptions): Promise<PaginatedResult<ConversationWithUser>> {
    const page = normalizePage(options.page);
    const pageSize = normalizePageSize(options.pageSize);
    const offset = (page - 1) * pageSize;
    const search = normalizeSearch(options.search);

    if (!isArangoEnabled()) {
      const filtered = database.data.conversations
        .map((conversation) => {
          const user = database.data.users.find((candidate) => candidate.id === conversation.userId);
          return {
            ...conversation,
            userFullName: user?.fullName ?? 'کاربر حذف‌شده',
            username: user?.username ?? '-'
          };
        })
        .filter((conversation) => {
          const searchable =
            `${conversation.userFullName} ${conversation.username} ${conversation.question} ${conversation.answer}`.toLocaleLowerCase(
              'fa'
            );
          return !search || searchable.includes(search);
        })
        .sort((a, b) => b.createdAt.localeCompare(a.createdAt));

      return {
        items: filtered.slice(offset, offset + pageSize),
        total: filtered.length,
        page,
        pageSize
      };
    }

    const arangoDatabase = getArangoDatabase();
    const conversations = arangoDatabase.collection<ConversationRecord>(arangoCollections.conversations);
    const users = arangoDatabase.collection<UserRecord>(arangoCollections.users);
    const cursor = await arangoDatabase.query<{
      items: Array<ArangoRecord<ConversationWithUser>>;
      total: number;
    }>(aql`
      LET total = LENGTH(
        FOR conversation IN ${conversations}
          LET user = FIRST(
            FOR user IN ${users}
              FILTER user.id == conversation.userId
              RETURN user
          )
          LET searchable = LOWER(CONCAT_SEPARATOR(" ", user.fullName || "کاربر حذف‌شده", user.username || "-", conversation.question, conversation.answer))
          FILTER (${search} == "" OR CONTAINS(searchable, ${search}))
          RETURN 1
      )
      LET items = (
        FOR conversation IN ${conversations}
          LET user = FIRST(
            FOR user IN ${users}
              FILTER user.id == conversation.userId
              RETURN user
          )
          LET enriched = MERGE(conversation, {
            userFullName: user.fullName || "کاربر حذف‌شده",
            username: user.username || "-"
          })
          LET searchable = LOWER(CONCAT_SEPARATOR(" ", enriched.userFullName, enriched.username, enriched.question, enriched.answer))
          FILTER (${search} == "" OR CONTAINS(searchable, ${search}))
          SORT conversation.createdAt DESC, conversation.id DESC
          LIMIT ${offset}, ${pageSize}
          RETURN enriched
      )
      RETURN {
        items,
        total
      }
    `);
    const result = await cursor.next();
    return {
      items: (result?.items ?? []).map((conversation) => stripArangoMeta(conversation)!),
      total: result?.total ?? 0,
      page,
      pageSize
    };
  },

  async findById(id: number): Promise<ConversationRecord | undefined> {
    if (!isArangoEnabled()) {
      return database.data.conversations.find((candidate) => candidate.id === id);
    }
    return findArangoById<ConversationRecord>(arangoCollections.conversations, id);
  },

  async create(input: {
    userId: number;
    question: string;
    answer: string;
    matchedFaqId: number | null;
  }): Promise<ConversationRecord> {
    const conversation: ConversationRecord = {
      id: await nextRepositoryId(arangoCollections.conversations, database.data.conversations),
      userId: input.userId,
      question: input.question,
      answer: input.answer,
      matchedFaqId: input.matchedFaqId,
      rating: null,
      ratingSubmittedAt: null,
      createdAt: new Date().toISOString()
    };

    if (!isArangoEnabled()) {
      database.data.conversations.push(conversation);
      await database.write();
      return conversation;
    }

    await saveArangoRecord(arangoCollections.conversations, conversation);
    return conversation;
  },

  async save(conversation: ConversationRecord): Promise<void> {
    if (!isArangoEnabled()) {
      const index = database.data.conversations.findIndex((item) => item.id === conversation.id);
      if (index >= 0) database.data.conversations[index] = conversation;
      await database.write();
      return;
    }

    await saveArangoRecord(arangoCollections.conversations, conversation);
  }
};

export const diagnosticRepository = {
  async nextId(): Promise<number> {
    return nextRepositoryId(arangoCollections.diagnosticCases, database.data.diagnosticCases);
  },

  async listWithUsers(): Promise<DiagnosticCaseWithUser[]> {
    if (!isArangoEnabled()) {
      return database.data.diagnosticCases
        .map((item) => {
          const user = database.data.users.find((candidate) => candidate.id === item.userId);
          return {
            ...item,
            userFullName: user?.fullName ?? 'کاربر حذف‌شده',
            username: user?.username ?? '-'
          };
        })
        .sort((a, b) => b.createdAt.localeCompare(a.createdAt));
    }

    const arangoDatabase = getArangoDatabase();
    const cases = arangoDatabase.collection<DiagnosticCaseRecord>(arangoCollections.diagnosticCases);
    const users = arangoDatabase.collection<UserRecord>(arangoCollections.users);
    const cursor = await arangoDatabase.query<ArangoRecord<DiagnosticCaseWithUser>>(aql`
      FOR item IN ${cases}
        LET user = FIRST(
          FOR user IN ${users}
            FILTER user.id == item.userId
            RETURN user
        )
        SORT item.createdAt DESC
        RETURN MERGE(item, {
          userFullName: user.fullName || "کاربر حذف‌شده",
          username: user.username || "-"
        })
    `);
    return (await cursor.all()).map((item) => stripArangoMeta(item)!);
  },

  async findById(id: number): Promise<DiagnosticCaseRecord | undefined> {
    if (!isArangoEnabled()) {
      return database.data.diagnosticCases.find((candidate) => candidate.id === id);
    }
    return findArangoById<DiagnosticCaseRecord>(arangoCollections.diagnosticCases, id);
  },

  async findSimilar(input: DiagnosticSimilarityInput, limit = 25): Promise<DiagnosticCaseRecord[]> {
    if (!isArangoEnabled()) {
      return database.data.diagnosticCases
        .filter((candidate) => isSimilarDiagnosticCase(input, candidate))
        .sort((a, b) => b.createdAt.localeCompare(a.createdAt))
        .slice(0, limit);
    }

    const arangoDatabase = getArangoDatabase();
    const cases = arangoDatabase.collection<DiagnosticCaseRecord>(arangoCollections.diagnosticCases);
    const cursor = await arangoDatabase.query<ArangoRecord<DiagnosticCaseRecord>>(aql`
      FOR item IN ${cases}
        FILTER item.id != ${input.id}
        FILTER item.treeNodeId == ${input.treeNodeId}
          OR item.errorText == ${input.errorText}
          OR (item.systemName == ${input.systemName} AND item.processName == ${input.processName})
        SORT item.createdAt DESC
        LIMIT ${Math.max(limit * 3, limit)}
        RETURN item
    `);
    return (await cursor.all())
      .map((item) => stripArangoMeta(item)!)
      .filter((candidate) => isSimilarDiagnosticCase(input, candidate))
      .slice(0, limit);
  },

  async create(input: DiagnosticCaseRecord): Promise<DiagnosticCaseRecord> {
    if (!isArangoEnabled()) {
      database.data.diagnosticCases.push(input);
      await database.write();
      return input;
    }

    await saveArangoRecord(arangoCollections.diagnosticCases, input);
    return input;
  },

  async save(input: DiagnosticCaseRecord): Promise<void> {
    if (!isArangoEnabled()) {
      const index = database.data.diagnosticCases.findIndex((item) => item.id === input.id);
      if (index >= 0) database.data.diagnosticCases[index] = input;
      await database.write();
      return;
    }

    await saveArangoRecord(arangoCollections.diagnosticCases, input);
  }
};

const emptyTicketServiceSettings = (): TicketServiceSettingsRecord => ({
  url: '',
  authorizationHeader: '',
  authHeader: '',
  raiseOnBehalfOf: '',
  serviceDeskId: '',
  requestTypeId: '',
  requestTypeMappings: [],
  updatedAt: null
});

export const settingsRepository = {
  async getTicketServiceSettings(): Promise<TicketServiceSettingsRecord> {
    if (!isArangoEnabled()) {
      database.data.settings ??= { ticketService: emptyTicketServiceSettings() };
      database.data.settings.ticketService ??= emptyTicketServiceSettings();
      return normalizeTicketServiceSettings(database.data.settings.ticketService);
    }

    const arangoDatabase = getArangoDatabase();
    const settings = arangoDatabase.collection<TicketServiceSettingsRecord>(arangoCollections.settings);
    const cursor = await arangoDatabase.query<ArangoRecord<TicketServiceSettingsRecord>>(aql`
      FOR setting IN ${settings}
        FILTER setting._key == ${ticketServiceSettingsKey}
        LIMIT 1
        RETURN setting
    `);
    const stored = stripArangoMeta(await cursor.next());
    if (stored) return normalizeTicketServiceSettings(stored);

    const fallback = normalizeTicketServiceSettings(database.data.settings.ticketService);
    await settings.save({ _key: ticketServiceSettingsKey, ...fallback }, { overwriteMode: 'replace' });
    return fallback;
  },

  async updateTicketServiceSettings(
    input: TicketServiceSettingsRecord
  ): Promise<TicketServiceSettingsRecord> {
    const normalized = normalizeTicketServiceSettings(input);

    if (!isArangoEnabled()) {
      database.data.settings ??= { ticketService: emptyTicketServiceSettings() };
      database.data.settings.ticketService = normalized;
      await database.write();
      return normalized;
    }

    await getArangoDatabase()
      .collection(arangoCollections.settings)
      .save({ _key: ticketServiceSettingsKey, ...normalized }, { overwriteMode: 'replace' });
    return normalized;
  }
};

export const externalServiceRepository = {
  async list(): Promise<ExternalServiceRecord[]> {
    if (!isArangoEnabled()) {
      database.data.externalServices ??= [];
      return database.data.externalServices;
    }

    const arangoDatabase = getArangoDatabase();
    const services = arangoDatabase.collection<ExternalServiceRecord>(arangoCollections.externalServices);
    const cursor = await arangoDatabase.query<ArangoRecord<ExternalServiceRecord>>(aql`
      FOR service IN ${services}
        SORT service.updatedAt DESC
        RETURN service
    `);
    return (await cursor.all()).map((service) => stripArangoMeta(service)!);
  },

  async listActiveVisible(): Promise<ExternalServiceRecord[]> {
    return (await this.list()).filter((service) => service.isActive && service.showInAssistant);
  },

  async findById(id: number): Promise<ExternalServiceRecord | undefined> {
    if (!isArangoEnabled()) {
      return database.data.externalServices.find((service) => service.id === id);
    }
    return findArangoById<ExternalServiceRecord>(arangoCollections.externalServices, id);
  },

  async keyExists(key: string, exceptId?: number): Promise<boolean> {
    if (!isArangoEnabled()) {
      return database.data.externalServices.some((service) => service.key === key && service.id !== exceptId);
    }

    const arangoDatabase = getArangoDatabase();
    const services = arangoDatabase.collection<ExternalServiceRecord>(arangoCollections.externalServices);
    const cursor = await arangoDatabase.query<number>(aql`
      RETURN LENGTH(
        FOR service IN ${services}
          FILTER service.key == ${key} AND service.id != ${exceptId ?? -1}
          LIMIT 1
          RETURN service
      )
    `);
    return ((await cursor.next()) ?? 0) > 0;
  },

  async create(input: Omit<ExternalServiceRecord, 'id'>): Promise<ExternalServiceRecord> {
    const record: ExternalServiceRecord = {
      id: await nextRepositoryId(arangoCollections.externalServices, database.data.externalServices),
      ...input
    };

    if (!isArangoEnabled()) {
      database.data.externalServices ??= [];
      database.data.externalServices.push(record);
      await database.write();
      return record;
    }

    await saveArangoRecord(arangoCollections.externalServices, record);
    return record;
  },

  async update(id: number, input: ExternalServiceRecord): Promise<ExternalServiceRecord | null> {
    if (!isArangoEnabled()) {
      if (!(await this.findById(id))) return null;
      database.data.externalServices = database.data.externalServices.map((service) =>
        service.id === id ? input : service
      );
      await database.write();
      return input;
    }

    if (!(await this.findById(id))) return null;
    await saveArangoRecord(arangoCollections.externalServices, input);
    return input;
  },

  async delete(id: number): Promise<boolean> {
    if (!isArangoEnabled()) {
      const existing = await this.findById(id);
      if (!existing) return false;
      database.data.externalServices = database.data.externalServices.filter((service) => service.id !== id);
      await database.write();
      return true;
    }

    return deleteArangoById(arangoCollections.externalServices, id);
  }
};

type DashboardMetricSnapshot = Record<DashboardMetricLogRecord['key'], number>;

const emptyDashboardMetricSnapshot = (): DashboardMetricSnapshot => ({
  activeFaqs: 0,
  userRequests: 0,
  engagedUsers: 0,
  faqCoverageRate: 0,
  diagnosticCases: 0,
  treeNodes: 0,
  treeEdges: 0,
  activeServices: 0,
  sahandSubmitted: 0
});

const dashboardMetricDefinitions: Array<{
  key: DashboardMetricLogRecord['key'];
  label: string;
  order: number;
}> = [
  { key: 'activeFaqs', label: 'FAQ فعال', order: 10 },
  { key: 'userRequests', label: 'درخواست کاربران', order: 20 },
  { key: 'engagedUsers', label: 'کاربران درگیر', order: 30 },
  { key: 'faqCoverageRate', label: 'پوشش FAQ', order: 40 },
  { key: 'diagnosticCases', label: 'پرونده‌های پشتیبانی', order: 50 },
  { key: 'treeNodes', label: 'نودهای درختواره', order: 60 },
  { key: 'treeEdges', label: 'ارتباط‌های درختواره', order: 70 },
  { key: 'activeServices', label: 'سرویس‌های فعال', order: 80 },
  { key: 'sahandSubmitted', label: 'ارسال موفق سهند', order: 90 }
];

export const dashboardMetricRepository = {
  async list(): Promise<DashboardMetricLogRecord[]> {
    const snapshot = await readDashboardMetricSnapshot();
    const timestamp = new Date().toISOString();
    const source = isArangoEnabled() ? 'arango' : 'local';
    const rows = dashboardMetricDefinitions.map((definition) => ({
      ...definition,
      value: normalizeMetricValue(snapshot[definition.key]),
      source,
      updatedAt: timestamp
    }));

    await writeDashboardMetricLogs(rows);
    return rows;
  }
};

async function readDashboardMetricSnapshot(): Promise<DashboardMetricSnapshot> {
  if (!isArangoEnabled()) {
    return readLocalDashboardMetricSnapshot();
  }

  const arangoDatabase = getArangoDatabase();
  const faqs = arangoDatabase.collection<FaqRecord>(arangoCollections.faqs);
  const conversations = arangoDatabase.collection<ConversationRecord>(arangoCollections.conversations);
  const diagnosticCases = arangoDatabase.collection<DiagnosticCaseRecord>(
    arangoCollections.diagnosticCases
  );
  const externalServices = arangoDatabase.collection<ExternalServiceRecord>(
    arangoCollections.externalServices
  );
  const troubleshootingNodes = arangoDatabase.collection(arangoCollections.troubleshootingNodes);
  const troubleshootingEdges = arangoDatabase.collection(arangoCollections.troubleshootingEdges);

  const cursor = await arangoDatabase.query<DashboardMetricSnapshot>(aql`
    LET activeFaqs = LENGTH(${faqs})
    LET userRequests = LENGTH(${conversations})
    LET matchedConversationCount = LENGTH(
      FOR conversation IN ${conversations}
        FILTER conversation.matchedFaqId != null
        RETURN 1
    )
    LET engagedUsers = LENGTH(UNION_DISTINCT(
      (FOR conversation IN ${conversations} RETURN conversation.userId),
      (FOR item IN ${diagnosticCases} RETURN item.userId)
    ))
    LET diagnosticCasesCount = LENGTH(${diagnosticCases})
    LET treeNodes = LENGTH(
      FOR node IN ${troubleshootingNodes}
        FILTER node.projectKey == "default" AND node.treeMode == "active"
        RETURN 1
    )
    LET treeEdges = LENGTH(
      FOR edge IN ${troubleshootingEdges}
        FILTER edge.projectKey == "default" AND edge.treeMode == "active"
        RETURN 1
    )
    LET activeServices = LENGTH(
      FOR service IN ${externalServices}
        FILTER service.isActive == true
        RETURN 1
    )
    LET sahandSubmitted = LENGTH(
      FOR item IN ${diagnosticCases}
        FILTER item.externalTicketStatus == "submitted"
        RETURN 1
    )
    RETURN {
      activeFaqs,
      userRequests,
      engagedUsers,
      faqCoverageRate: userRequests > 0 ? ROUND((matchedConversationCount / userRequests) * 100) : 0,
      diagnosticCases: diagnosticCasesCount,
      treeNodes,
      treeEdges,
      activeServices,
      sahandSubmitted
    }
  `);

  return {
    ...emptyDashboardMetricSnapshot(),
    ...((await cursor.next()) ?? {})
  };
}

function readLocalDashboardMetricSnapshot(): DashboardMetricSnapshot {
  const conversations = database.data.conversations ?? [];
  const diagnosticCases = database.data.diagnosticCases ?? [];
  const externalServices = database.data.externalServices ?? [];
  const activeTree =
    database.data.troubleshootingTreeVersions?.[troubleshootingTreeVersionKey('default', 'active')] ??
    database.data.troubleshootingTrees?.['default'] ??
    database.data.troubleshootingTree;
  const engagedUsers = new Set([
    ...conversations.map((conversation) => conversation.userId),
    ...diagnosticCases.map((item) => item.userId)
  ]).size;
  const matchedConversationCount = conversations.filter(
    (conversation) => conversation.matchedFaqId !== null
  ).length;

  return {
    activeFaqs: database.data.faqs?.length ?? 0,
    userRequests: conversations.length,
    engagedUsers,
    faqCoverageRate: Math.round(calculateMetricRate(matchedConversationCount, conversations.length)),
    diagnosticCases: diagnosticCases.length,
    treeNodes: activeTree?.nodes?.length ?? 0,
    treeEdges: activeTree?.edges?.length ?? 0,
    activeServices: externalServices.filter((service) => service.isActive).length,
    sahandSubmitted: diagnosticCases.filter((item) => item.externalTicketStatus === 'submitted').length
  };
}

async function writeDashboardMetricLogs(rows: DashboardMetricLogRecord[]): Promise<void> {
  if (!isArangoEnabled()) {
    database.data.dashboardMetricLogs = rows;
    await database.write();
    return;
  }

  await getArangoDatabase()
    .collection(arangoCollections.dashboardMetricLogs)
    .saveAll(
      rows.map((row) => ({ _key: row.key, ...row })),
      { overwriteMode: 'replace' }
    );
}

function calculateMetricRate(count: number, total: number): number {
  return total > 0 ? Math.min(100, Math.max(0, (count / total) * 100)) : 0;
}

function normalizeMetricValue(value: number): number {
  const numeric = Number(value);
  return Number.isFinite(numeric) ? Math.max(0, Math.round(numeric)) : 0;
}

async function nextRepositoryId(
  collectionName: string,
  fallbackRecords: Array<{ id: number }>
): Promise<number> {
  if (!isArangoEnabled()) return nextId(fallbackRecords);

  const arangoDatabase = getArangoDatabase();
  const collection = arangoDatabase.collection(collectionName);
  const cursor = await arangoDatabase.query<number | null>(aql`
    FOR record IN ${collection}
      COLLECT AGGREGATE maxId = MAX(TO_NUMBER(record.id))
      RETURN maxId
  `);
  const currentMax = Number((await cursor.next()) ?? 0);
  return Number.isFinite(currentMax) ? currentMax + 1 : 1;
}

async function findArangoById<T extends { id: number }>(
  collectionName: string,
  id: number
): Promise<T | undefined> {
  const arangoDatabase = getArangoDatabase();
  const collection = arangoDatabase.collection<T>(collectionName);
  const cursor = await arangoDatabase.query<ArangoRecord<T>>(aql`
    FOR record IN ${collection}
      FILTER record.id == ${id}
      LIMIT 1
      RETURN record
  `);
  return stripArangoMeta(await cursor.next());
}

async function saveArangoRecord<T extends { id: number }>(collectionName: string, record: T): Promise<void> {
  await getArangoDatabase()
    .collection(collectionName)
    .save({ _key: String(record.id), ...record }, { overwriteMode: 'replace' });
}

async function deleteArangoById(collectionName: string, id: number): Promise<boolean> {
  const arangoDatabase = getArangoDatabase();
  const collection = arangoDatabase.collection(collectionName);
  const cursor = await arangoDatabase.query<number>(aql`
    LET removed = (
      FOR record IN ${collection}
        FILTER record.id == ${id}
        REMOVE record IN ${collection}
        RETURN OLD
    )
    RETURN LENGTH(removed)
  `);
  return ((await cursor.next()) ?? 0) > 0;
}

function stripArangoMeta<T>(record: ArangoRecord<T> | null | undefined): T | undefined {
  if (!record) return undefined;
  const { _key, _id, _rev, ...clean } = record as ArangoRecord<T> & Record<string, unknown>;
  void _key;
  void _id;
  void _rev;
  return clean as T;
}

function normalizePage(value: number): number {
  return Number.isFinite(value) ? Math.max(1, Math.floor(value)) : 1;
}

function normalizePageSize(value: number): number {
  return Number.isFinite(value) ? Math.min(100, Math.max(1, Math.floor(value))) : 10;
}

function normalizeSearch(value: string | undefined): string {
  return (value ?? '').trim().toLocaleLowerCase('fa');
}

function normalizeTicketServiceSettings(
  input?: Partial<TicketServiceSettingsRecord>
): TicketServiceSettingsRecord {
  return {
    url: input?.url ?? '',
    authorizationHeader: input?.authorizationHeader ?? '',
    authHeader: input?.authHeader ?? '',
    raiseOnBehalfOf: input?.raiseOnBehalfOf ?? '',
    serviceDeskId: input?.serviceDeskId ?? '',
    requestTypeId: input?.requestTypeId ?? '',
    requestTypeMappings: input?.requestTypeMappings ?? [],
    updatedAt: input?.updatedAt ?? null
  };
}
