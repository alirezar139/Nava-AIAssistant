import type {
  Conversation,
  DiagnosticCase,
  ExternalService,
  Faq,
  TicketRequestTypeMapping,
  TicketServiceSettings,
  User
} from '../generated/prisma/client.js';
import { prisma } from './prisma-client.js';
import { UserRole } from '../common/types.js';
import {
  ConversationRecord,
  DashboardMetricLogRecord,
  DiagnosticCaseRecord,
  ExternalServiceRecord,
  FaqRecord,
  TicketServiceSettingsRecord,
  UserRecord
} from './domain-types.js';

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

function toUserRecord(row: User): UserRecord {
  return {
    id: row.id,
    username: row.username,
    passwordHash: row.passwordHash,
    fullName: row.fullName,
    role: row.role,
    createdAt: row.createdAt.toISOString()
  };
}

function toFaqRecord(row: Faq): FaqRecord {
  return {
    id: row.id,
    question: row.question,
    answer: row.answer,
    category: row.category,
    keywords: row.keywords,
    updatedAt: row.updatedAt.toISOString()
  };
}

function toConversationRecord(row: Conversation): ConversationRecord {
  return {
    id: row.id,
    userId: row.userId,
    question: row.question,
    answer: row.answer,
    matchedFaqId: row.matchedFaqId,
    rating: row.rating,
    ratingSubmittedAt: row.ratingSubmittedAt ? row.ratingSubmittedAt.toISOString() : null,
    createdAt: row.createdAt.toISOString()
  };
}

function toDiagnosticCaseRecord(row: DiagnosticCase): DiagnosticCaseRecord {
  return {
    id: row.id,
    userId: row.userId,
    title: row.title,
    problem: row.problem,
    systemName: row.systemName,
    processName: row.processName,
    scenario: row.scenario,
    serialNumber: row.serialNumber,
    errorText: row.errorText,
    evidence: row.evidence,
    treeNodeId: row.treeNodeId,
    treeNodeText: row.treeNodeText,
    status: row.status,
    analysisSummary: row.analysisSummary,
    severity: row.severity,
    recommendation: row.recommendation,
    externalTicketId: row.externalTicketId,
    externalTrackingId: row.externalTrackingId,
    externalTicketStatus: row.externalTicketStatus,
    externalTicketStatusCode: row.externalTicketStatusCode,
    externalTicketError: row.externalTicketError,
    similarIssueCount: row.similarIssueCount,
    similarUserCount: row.similarUserCount,
    duplicateOfDiagnosticId: row.duplicateOfDiagnosticId,
    duplicateNotice: row.duplicateNotice ?? '',
    rating: row.rating,
    ratingComment: row.ratingComment ?? '',
    ratingSubmittedAt: row.ratingSubmittedAt ? row.ratingSubmittedAt.toISOString() : null,
    createdAt: row.createdAt.toISOString(),
    analyzedAt: row.analyzedAt ? row.analyzedAt.toISOString() : null,
    closedAt: row.closedAt ? row.closedAt.toISOString() : null
  };
}

function toExternalServiceRecord(row: ExternalService): ExternalServiceRecord {
  return {
    id: row.id,
    key: row.key,
    title: row.title,
    purpose: row.purpose,
    sectionTitle: row.sectionTitle,
    method: row.method,
    url: row.url,
    authorizationHeader: row.authorizationHeader ?? '',
    authHeader: row.authHeader ?? '',
    headersText: row.headersText ?? '',
    bodyTemplate: row.bodyTemplate ?? '',
    isActive: row.isActive,
    showInAssistant: row.showInAssistant,
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString()
  };
}

function toTicketServiceSettingsRecord(
  row: TicketServiceSettings & { requestTypeMappings: TicketRequestTypeMapping[] }
): TicketServiceSettingsRecord {
  return {
    url: row.url,
    authorizationHeader: row.authorizationHeader ?? '',
    authHeader: row.authHeader ?? '',
    raiseOnBehalfOf: row.raiseOnBehalfOf ?? '',
    serviceDeskId: row.serviceDeskId ?? '',
    requestTypeId: row.requestTypeId ?? '',
    requestTypeMappings: row.requestTypeMappings.map((mapping) => ({
      nodeId: mapping.nodeId,
      nodeLabel: mapping.nodeLabel,
      serviceDeskId: mapping.serviceDeskId,
      requestTypeId: mapping.requestTypeId
    })),
    updatedAt: row.updatedAt ? row.updatedAt.toISOString() : null
  };
}

function normalizeDiagnosticText(value: string | null | undefined): string {
  return (value ?? '')
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

  const sourceTreeNodeId = (source.treeNodeId ?? '').trim();
  const candidateTreeNodeId = (candidate.treeNodeId ?? '').trim();
  if (sourceTreeNodeId && sourceTreeNodeId === candidateTreeNodeId) {
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
    const row = await prisma.user.findUnique({ where: { username } });
    return row ? toUserRecord(row) : undefined;
  },

  async findById(id: number): Promise<UserRecord | undefined> {
    const row = await prisma.user.findUnique({ where: { id } });
    return row ? toUserRecord(row) : undefined;
  },

  async list(): Promise<UserRecord[]> {
    const rows = await prisma.user.findMany({ orderBy: { createdAt: 'desc' } });
    return rows.map(toUserRecord);
  },

  async usernameExists(username: string, exceptId?: number): Promise<boolean> {
    const count = await prisma.user.count({
      where: {
        username,
        ...(exceptId !== undefined ? { id: { not: exceptId } } : {})
      }
    });
    return count > 0;
  },

  async create(input: {
    username: string;
    passwordHash: string;
    fullName: string;
    role: UserRole;
  }): Promise<UserRecord> {
    const row = await prisma.user.create({ data: input });
    return toUserRecord(row);
  },

  async update(
    id: number,
    input: { username: string; fullName: string; role: UserRole; passwordHash?: string }
  ): Promise<UserRecord | null> {
    const existing = await prisma.user.findUnique({ where: { id } });
    if (!existing) return null;

    const row = await prisma.user.update({
      where: { id },
      data: {
        username: input.username,
        fullName: input.fullName,
        role: input.role,
        ...(input.passwordHash ? { passwordHash: input.passwordHash } : {})
      }
    });
    return toUserRecord(row);
  },

  async delete(id: number): Promise<boolean> {
    const result = await prisma.user.deleteMany({ where: { id } });
    return result.count > 0;
  }
};

function normalizePage(value: number): number {
  return Number.isFinite(value) ? Math.max(1, Math.floor(value)) : 1;
}

function normalizePageSize(value: number): number {
  return Number.isFinite(value) ? Math.min(100, Math.max(1, Math.floor(value))) : 10;
}

function normalizeSearch(value: string | undefined): string {
  return (value ?? '').trim().toLocaleLowerCase('fa');
}

export const faqRepository = {
  async list(): Promise<FaqRecord[]> {
    const rows = await prisma.faq.findMany({ orderBy: { updatedAt: 'desc' } });
    return rows.map(toFaqRecord);
  },

  async listPage(options: PaginationOptions): Promise<PaginatedFaqResult> {
    const page = normalizePage(options.page);
    const pageSize = normalizePageSize(options.pageSize);
    const offset = (page - 1) * pageSize;
    const search = normalizeSearch(options.search);
    const category = options.category?.trim() ?? '';

    const where = {
      ...(category ? { category } : {}),
      ...(search
        ? {
            OR: [
              { question: { contains: search } },
              { answer: { contains: search } },
              { category: { contains: search } },
              { keywords: { contains: search } }
            ]
          }
        : {})
    };

    const [total, items, categoryRows] = await Promise.all([
      prisma.faq.count({ where }),
      prisma.faq.findMany({
        where,
        orderBy: [{ updatedAt: 'desc' }, { id: 'desc' }],
        skip: offset,
        take: pageSize
      }),
      prisma.faq.findMany({
        where: { category: { not: '' } },
        select: { category: true },
        distinct: ['category'],
        orderBy: { category: 'asc' }
      })
    ]);

    return {
      items: items.map(toFaqRecord),
      total,
      page,
      pageSize,
      categories: categoryRows.map((row) => row.category)
    };
  },

  async exists(id: number): Promise<boolean> {
    return (await prisma.faq.count({ where: { id } })) > 0;
  },

  async create(input: FaqInput): Promise<FaqRecord> {
    const row = await prisma.faq.create({ data: input });
    return toFaqRecord(row);
  },

  async replaceAll(rows: FaqInput[]): Promise<number> {
    await prisma.faq.deleteMany({});
    if (rows.length) {
      await prisma.faq.createMany({ data: rows });
    }
    return rows.length;
  },

  async deleteMany(ids: number[]): Promise<number> {
    const result = await prisma.faq.deleteMany({ where: { id: { in: ids } } });
    return result.count;
  },

  async update(id: number, input: FaqInput): Promise<FaqRecord | null> {
    const existing = await prisma.faq.findUnique({ where: { id } });
    if (!existing) return null;

    const row = await prisma.faq.update({ where: { id }, data: input });
    return toFaqRecord(row);
  },

  async delete(id: number): Promise<boolean> {
    const result = await prisma.faq.deleteMany({ where: { id } });
    return result.count > 0;
  }
};

function toConversationWithUser(
  row: Conversation & { user: User | null }
): ConversationWithUser {
  return {
    ...toConversationRecord(row),
    userFullName: row.user?.fullName ?? 'کاربر حذف‌شده',
    username: row.user?.username ?? '-'
  };
}

export const conversationRepository = {
  async listWithUsers(): Promise<ConversationWithUser[]> {
    const rows = await prisma.conversation.findMany({
      include: { user: true },
      orderBy: { createdAt: 'desc' }
    });
    return rows.map(toConversationWithUser);
  },

  async listWithUsersPage(options: PaginationOptions): Promise<PaginatedResult<ConversationWithUser>> {
    const page = normalizePage(options.page);
    const pageSize = normalizePageSize(options.pageSize);
    const offset = (page - 1) * pageSize;
    const search = normalizeSearch(options.search);

    const where = search
      ? {
          OR: [
            { question: { contains: search } },
            { answer: { contains: search } },
            { user: { is: { fullName: { contains: search } } } },
            { user: { is: { username: { contains: search } } } }
          ]
        }
      : {};

    const [total, items] = await Promise.all([
      prisma.conversation.count({ where }),
      prisma.conversation.findMany({
        where,
        include: { user: true },
        orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
        skip: offset,
        take: pageSize
      })
    ]);

    return {
      items: items.map(toConversationWithUser),
      total,
      page,
      pageSize
    };
  },

  async findById(id: number): Promise<ConversationRecord | undefined> {
    const row = await prisma.conversation.findUnique({ where: { id } });
    return row ? toConversationRecord(row) : undefined;
  },

  async create(input: {
    userId: number;
    question: string;
    answer: string;
    matchedFaqId: number | null;
  }): Promise<ConversationRecord> {
    const row = await prisma.conversation.create({
      data: {
        userId: input.userId,
        question: input.question,
        answer: input.answer,
        matchedFaqId: input.matchedFaqId,
        rating: null,
        ratingSubmittedAt: null
      }
    });
    return toConversationRecord(row);
  },

  async save(conversation: ConversationRecord): Promise<void> {
    await prisma.conversation.update({
      where: { id: conversation.id },
      data: {
        rating: conversation.rating ?? null,
        ratingSubmittedAt: conversation.ratingSubmittedAt ?? null
      }
    });
  }
};

function toDiagnosticCaseWithUser(
  row: DiagnosticCase & { user: User | null }
): DiagnosticCaseWithUser {
  return {
    ...toDiagnosticCaseRecord(row),
    userFullName: row.user?.fullName ?? 'کاربر حذف‌شده',
    username: row.user?.username ?? '-'
  };
}

export const diagnosticRepository = {
  async listWithUsers(): Promise<DiagnosticCaseWithUser[]> {
    const rows = await prisma.diagnosticCase.findMany({
      include: { user: true },
      orderBy: { createdAt: 'desc' }
    });
    return rows.map(toDiagnosticCaseWithUser);
  },

  async findById(id: number): Promise<DiagnosticCaseRecord | undefined> {
    const row = await prisma.diagnosticCase.findUnique({ where: { id } });
    return row ? toDiagnosticCaseRecord(row) : undefined;
  },

  async findSimilar(input: DiagnosticSimilarityInput, limit = 25): Promise<DiagnosticCaseRecord[]> {
    const rows = await prisma.diagnosticCase.findMany({
      where: {
        id: { not: input.id },
        OR: [
          { treeNodeId: input.treeNodeId },
          { errorText: input.errorText },
          { AND: [{ systemName: input.systemName }, { processName: input.processName }] }
        ]
      },
      orderBy: { createdAt: 'desc' },
      take: Math.max(limit * 3, limit)
    });

    return rows
      .map(toDiagnosticCaseRecord)
      .filter((candidate) => isSimilarDiagnosticCase(input, candidate))
      .slice(0, limit);
  },

  async create(input: Omit<DiagnosticCaseRecord, 'id'>): Promise<DiagnosticCaseRecord> {
    const row = await prisma.diagnosticCase.create({
      data: {
        userId: input.userId,
        title: input.title,
        problem: input.problem,
        systemName: input.systemName,
        processName: input.processName,
        scenario: input.scenario,
        serialNumber: input.serialNumber,
        errorText: input.errorText,
        evidence: input.evidence,
        treeNodeId: input.treeNodeId,
        treeNodeText: input.treeNodeText,
        status: input.status,
        analysisSummary: input.analysisSummary,
        severity: input.severity,
        recommendation: input.recommendation,
        externalTicketId: input.externalTicketId,
        externalTrackingId: input.externalTrackingId,
        externalTicketStatus: input.externalTicketStatus,
        externalTicketStatusCode: input.externalTicketStatusCode,
        externalTicketError: input.externalTicketError,
        similarIssueCount: input.similarIssueCount ?? 1,
        similarUserCount: input.similarUserCount ?? 1,
        duplicateOfDiagnosticId: input.duplicateOfDiagnosticId,
        duplicateNotice: input.duplicateNotice ?? '',
        rating: input.rating,
        ratingComment: input.ratingComment ?? '',
        ratingSubmittedAt: input.ratingSubmittedAt,
        analyzedAt: input.analyzedAt,
        closedAt: input.closedAt
      }
    });
    return toDiagnosticCaseRecord(row);
  },

  async save(input: DiagnosticCaseRecord): Promise<void> {
    await prisma.diagnosticCase.update({
      where: { id: input.id },
      data: {
        status: input.status,
        analysisSummary: input.analysisSummary,
        severity: input.severity,
        recommendation: input.recommendation,
        externalTicketId: input.externalTicketId,
        externalTrackingId: input.externalTrackingId,
        externalTicketStatus: input.externalTicketStatus,
        externalTicketStatusCode: input.externalTicketStatusCode,
        externalTicketError: input.externalTicketError,
        similarIssueCount: input.similarIssueCount ?? 1,
        similarUserCount: input.similarUserCount ?? 1,
        duplicateOfDiagnosticId: input.duplicateOfDiagnosticId,
        duplicateNotice: input.duplicateNotice ?? '',
        rating: input.rating,
        ratingComment: input.ratingComment ?? '',
        ratingSubmittedAt: input.ratingSubmittedAt,
        analyzedAt: input.analyzedAt,
        closedAt: input.closedAt
      }
    });
  }
};

export const settingsRepository = {
  async getTicketServiceSettings(): Promise<TicketServiceSettingsRecord> {
    const row = await prisma.ticketServiceSettings.upsert({
      where: { id: 1 },
      update: {},
      create: { id: 1, url: '' },
      include: { requestTypeMappings: true }
    });
    return toTicketServiceSettingsRecord(row);
  },

  async updateTicketServiceSettings(
    input: TicketServiceSettingsRecord
  ): Promise<TicketServiceSettingsRecord> {
    const row = await prisma.$transaction(async (tx) => {
      await tx.ticketRequestTypeMapping.deleteMany({ where: { ticketServiceSettingsId: 1 } });
      return tx.ticketServiceSettings.upsert({
        where: { id: 1 },
        update: {
          url: input.url,
          authorizationHeader: input.authorizationHeader,
          authHeader: input.authHeader,
          raiseOnBehalfOf: input.raiseOnBehalfOf,
          serviceDeskId: input.serviceDeskId,
          requestTypeId: input.requestTypeId,
          requestTypeMappings: {
            create: input.requestTypeMappings.map((mapping) => ({
              nodeId: mapping.nodeId,
              nodeLabel: mapping.nodeLabel,
              serviceDeskId: mapping.serviceDeskId,
              requestTypeId: mapping.requestTypeId
            }))
          }
        },
        create: {
          id: 1,
          url: input.url,
          authorizationHeader: input.authorizationHeader,
          authHeader: input.authHeader,
          raiseOnBehalfOf: input.raiseOnBehalfOf,
          serviceDeskId: input.serviceDeskId,
          requestTypeId: input.requestTypeId,
          requestTypeMappings: {
            create: input.requestTypeMappings.map((mapping) => ({
              nodeId: mapping.nodeId,
              nodeLabel: mapping.nodeLabel,
              serviceDeskId: mapping.serviceDeskId,
              requestTypeId: mapping.requestTypeId
            }))
          }
        },
        include: { requestTypeMappings: true }
      });
    });
    return toTicketServiceSettingsRecord(row);
  }
};

export const externalServiceRepository = {
  async list(): Promise<ExternalServiceRecord[]> {
    const rows = await prisma.externalService.findMany({ orderBy: { updatedAt: 'desc' } });
    return rows.map(toExternalServiceRecord);
  },

  async listActiveVisible(): Promise<ExternalServiceRecord[]> {
    return (await this.list()).filter((service) => service.isActive && service.showInAssistant);
  },

  async findById(id: number): Promise<ExternalServiceRecord | undefined> {
    const row = await prisma.externalService.findUnique({ where: { id } });
    return row ? toExternalServiceRecord(row) : undefined;
  },

  async keyExists(key: string, exceptId?: number): Promise<boolean> {
    const count = await prisma.externalService.count({
      where: {
        key,
        ...(exceptId !== undefined ? { id: { not: exceptId } } : {})
      }
    });
    return count > 0;
  },

  async create(input: Omit<ExternalServiceRecord, 'id'>): Promise<ExternalServiceRecord> {
    const row = await prisma.externalService.create({ data: input });
    return toExternalServiceRecord(row);
  },

  async update(id: number, input: ExternalServiceRecord): Promise<ExternalServiceRecord | null> {
    const existing = await prisma.externalService.findUnique({ where: { id } });
    if (!existing) return null;

    const row = await prisma.externalService.update({
      where: { id },
      data: {
        key: input.key,
        title: input.title,
        purpose: input.purpose,
        sectionTitle: input.sectionTitle,
        method: input.method,
        url: input.url,
        authorizationHeader: input.authorizationHeader,
        authHeader: input.authHeader,
        headersText: input.headersText,
        bodyTemplate: input.bodyTemplate,
        isActive: input.isActive,
        showInAssistant: input.showInAssistant
      }
    });
    return toExternalServiceRecord(row);
  },

  async delete(id: number): Promise<boolean> {
    const result = await prisma.externalService.deleteMany({ where: { id } });
    return result.count > 0;
  }
};

type DashboardMetricSnapshot = Record<DashboardMetricLogRecord['key'], number>;

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
    const rows = dashboardMetricDefinitions.map((definition) => ({
      ...definition,
      value: normalizeMetricValue(snapshot[definition.key]),
      source: 'mysql',
      updatedAt: timestamp
    }));

    await prisma.$transaction(
      rows.map((row) =>
        prisma.dashboardMetricLog.upsert({
          where: { key: row.key },
          update: { label: row.label, value: row.value, order: row.order, source: row.source },
          create: { key: row.key, label: row.label, value: row.value, order: row.order, source: row.source }
        })
      )
    );

    return rows;
  }
};

async function readDashboardMetricSnapshot(): Promise<DashboardMetricSnapshot> {
  const [
    activeFaqs,
    userRequests,
    matchedConversationCount,
    diagnosticCasesCount,
    treeNodes,
    treeEdges,
    activeServices,
    sahandSubmitted,
    engagedUsersRows
  ] = await Promise.all([
    prisma.faq.count(),
    prisma.conversation.count(),
    prisma.conversation.count({ where: { matchedFaqId: { not: null } } }),
    prisma.diagnosticCase.count(),
    prisma.troubleshootingNode.count({ where: { projectKey: 'default', treeMode: 'active' } }),
    prisma.troubleshootingEdge.count({ where: { projectKey: 'default', treeMode: 'active' } }),
    prisma.externalService.count({ where: { isActive: true } }),
    prisma.diagnosticCase.count({ where: { externalTicketStatus: 'submitted' } }),
    prisma.$queryRaw<Array<{ userId: number }>>`
      SELECT DISTINCT userId FROM (
        SELECT userId FROM conversations
        UNION
        SELECT userId FROM diagnostic_cases
      ) engaged
    `
  ]);

  return {
    activeFaqs,
    userRequests,
    engagedUsers: engagedUsersRows.length,
    faqCoverageRate: userRequests > 0 ? Math.round((matchedConversationCount / userRequests) * 100) : 0,
    diagnosticCases: diagnosticCasesCount,
    treeNodes,
    treeEdges,
    activeServices,
    sahandSubmitted
  };
}

function normalizeMetricValue(value: number): number {
  const numeric = Number(value);
  return Number.isFinite(numeric) ? Math.max(0, Math.round(numeric)) : 0;
}
