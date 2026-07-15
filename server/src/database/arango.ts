import bcrypt from 'bcryptjs';
import { aql } from 'arangojs/aql';
import { Database } from 'arangojs';
import { CollectionType } from 'arangojs/collections';
import { config } from '../config/config.js';
import { database as localDatabase } from './database.js';

export const arangoCollections = {
  users: 'users',
  faqs: 'faqs',
  conversations: 'conversations',
  diagnosticCases: 'diagnostic_cases',
  externalServices: 'external_services',
  settings: 'settings',
  troubleshootingNodes: 'troubleshooting_nodes',
  troubleshootingEdges: 'troubleshooting_edges'
} as const;

let cachedDatabase: Database | null = null;

export function isArangoEnabled(): boolean {
  return config.databaseProvider === 'arango';
}

export function getArangoDatabase(): Database {
  if (!cachedDatabase) {
    cachedDatabase = new Database({
      url: config.arangoUrl,
      databaseName: config.arangoDatabase,
      auth: {
        username: config.arangoUsername,
        password: config.arangoPassword
      }
    });
  }
  return cachedDatabase;
}

export async function ensureArangoSchema(): Promise<void> {
  if (!isArangoEnabled()) return;

  await ensureArangoDatabaseExists();
  const database = getArangoDatabase();
  await ensureDocumentCollection(database, arangoCollections.users);
  await ensureDocumentCollection(database, arangoCollections.faqs);
  await ensureDocumentCollection(database, arangoCollections.conversations);
  await ensureDocumentCollection(database, arangoCollections.diagnosticCases);
  await ensureDocumentCollection(database, arangoCollections.externalServices);
  await ensureDocumentCollection(database, arangoCollections.settings);
  await ensureDocumentCollection(database, arangoCollections.troubleshootingNodes);
  await ensureEdgeCollection(database, arangoCollections.troubleshootingEdges);

  await database.collection(arangoCollections.users).ensureIndex({
    type: 'persistent',
    fields: ['id'],
    unique: true
  });
  await database.collection(arangoCollections.users).ensureIndex({
    type: 'persistent',
    fields: ['username'],
    unique: true
  });
  await database.collection(arangoCollections.faqs).ensureIndex({
    type: 'persistent',
    fields: ['id'],
    unique: true
  });
  await database.collection(arangoCollections.faqs).ensureIndex({
    type: 'persistent',
    fields: ['category']
  });
  await database.collection(arangoCollections.faqs).ensureIndex({
    type: 'persistent',
    fields: ['updatedAt']
  });
  await database.collection(arangoCollections.conversations).ensureIndex({
    type: 'persistent',
    fields: ['id'],
    unique: true
  });
  await database.collection(arangoCollections.conversations).ensureIndex({
    type: 'persistent',
    fields: ['userId', 'createdAt']
  });
  await database.collection(arangoCollections.diagnosticCases).ensureIndex({
    type: 'persistent',
    fields: ['id'],
    unique: true
  });
  await database.collection(arangoCollections.diagnosticCases).ensureIndex({
    type: 'persistent',
    fields: ['userId', 'createdAt']
  });
  await database.collection(arangoCollections.diagnosticCases).ensureIndex({
    type: 'persistent',
    fields: ['treeNodeId']
  });
  await database.collection(arangoCollections.diagnosticCases).ensureIndex({
    type: 'persistent',
    fields: ['status', 'createdAt']
  });
  await database.collection(arangoCollections.externalServices).ensureIndex({
    type: 'persistent',
    fields: ['id'],
    unique: true
  });
  await database.collection(arangoCollections.externalServices).ensureIndex({
    type: 'persistent',
    fields: ['key'],
    unique: true
  });
  await dropLegacyTroubleshootingNodeIndex(database);
  await database.collection(arangoCollections.troubleshootingNodes).ensureIndex({
    type: 'persistent',
    fields: ['projectKey', 'nodeId'],
    unique: true
  });
  await database.collection(arangoCollections.troubleshootingNodes).ensureIndex({
    type: 'persistent',
    fields: ['projectKey', 'sortOrder']
  });
  await database.collection(arangoCollections.troubleshootingEdges).ensureIndex({
    type: 'persistent',
    fields: ['projectKey', 'sortOrder']
  });
  await database.collection(arangoCollections.troubleshootingEdges).ensureIndex({
    type: 'persistent',
    fields: ['projectKey', 'from', 'to']
  });

  await seedArangoApplicationData(database);
}

export async function getArangoHealth(): Promise<{ ok: boolean; version?: string; error?: string }> {
  if (!isArangoEnabled()) return { ok: true };

  try {
    const version = await getArangoDatabase().version();
    return { ok: true, version: version.version };
  } catch (error) {
    return {
      ok: false,
      error: error instanceof Error ? error.message : 'ArangoDB connection failed'
    };
  }
}

async function ensureDocumentCollection(database: Database, name: string): Promise<void> {
  const collection = database.collection(name);
  if (!(await collection.exists())) {
    await collection.create();
  }
}

async function ensureEdgeCollection(database: Database, name: string): Promise<void> {
  const collection = database.collection(name);
  if (!(await collection.exists())) {
    await collection.create({ type: CollectionType.EDGE_COLLECTION });
  }
}

async function ensureArangoDatabaseExists(): Promise<void> {
  if (config.arangoDatabase === '_system') return;

  const systemDatabase = new Database({
    url: config.arangoUrl,
    databaseName: '_system',
    auth: {
      username: config.arangoUsername,
      password: config.arangoPassword
    }
  });
  const databases = await systemDatabase.listDatabases();
  if (!databases.includes(config.arangoDatabase)) {
    await systemDatabase.createDatabase(config.arangoDatabase);
  }
}

async function dropLegacyTroubleshootingNodeIndex(database: Database): Promise<void> {
  const collection = database.collection(arangoCollections.troubleshootingNodes);
  const indexes = (await collection.indexes()) as Array<{
    id?: string;
    name?: string;
    type?: string;
    unique?: boolean;
    fields?: string[];
  }>;

  for (const index of indexes) {
    if (
      index.type === 'persistent' &&
      index.unique === true &&
      index.fields?.length === 1 &&
      index.fields[0] === 'nodeId'
    ) {
      await collection.dropIndex(index.id ?? index.name ?? '');
    }
  }
}

async function seedArangoApplicationData(database: Database): Promise<void> {
  const now = new Date().toISOString();
  const users = localDatabase.data.users.length
    ? localDatabase.data.users
    : [
        {
          id: 1,
          username: 'admin',
          passwordHash: bcrypt.hashSync('Admin@123', 12),
          fullName: 'مدیر سامانه',
          role: 'admin' as const,
          createdAt: now
        },
        {
          id: 2,
          username: 'user',
          passwordHash: bcrypt.hashSync('User@123', 12),
          fullName: 'کاربر آزمایشی',
          role: 'user' as const,
          createdAt: now
        }
      ];

  await seedCollectionIfEmpty(database, arangoCollections.users, users, (item) => String(item.id));
  await seedCollectionIfEmpty(database, arangoCollections.faqs, localDatabase.data.faqs, (item) =>
    String(item.id)
  );
  await seedCollectionIfEmpty(
    database,
    arangoCollections.conversations,
    localDatabase.data.conversations,
    (item) => String(item.id)
  );
  await seedCollectionIfEmpty(
    database,
    arangoCollections.diagnosticCases,
    localDatabase.data.diagnosticCases,
    (item) => String(item.id)
  );
  await seedCollectionIfEmpty(
    database,
    arangoCollections.externalServices,
    localDatabase.data.externalServices,
    (item) => String(item.id)
  );

  const settingsCollection = database.collection(arangoCollections.settings);
  const ticketSettingsCursor = await database.query(aql`
    FOR settings IN ${settingsCollection}
      FILTER settings._key == "ticket_service"
      LIMIT 1
      RETURN settings
  `);
  if (!(await ticketSettingsCursor.next())) {
    await settingsCollection.save({
      _key: 'ticket_service',
      ...localDatabase.data.settings.ticketService
    });
  }
}

async function seedCollectionIfEmpty<T extends object>(
  database: Database,
  collectionName: string,
  rows: T[],
  keySelector: (row: T) => string
): Promise<void> {
  if (!rows.length) return;

  const collection = database.collection(collectionName);
  const countCursor = await database.query<number>(aql`
    RETURN LENGTH(${collection})
  `);
  const count = (await countCursor.next()) ?? 0;
  if (count > 0) return;

  await collection.saveAll(
    rows.map((row) => ({
      _key: normalizeDocumentKey(keySelector(row)),
      ...row
    })),
    { overwriteMode: 'replace' }
  );
}

function normalizeDocumentKey(value: string): string {
  const key = value
    .trim()
    .replace(/[^a-zA-Z0-9_:.@()+,=;$!*'%-]/g, '_')
    .slice(0, 254);
  return key || 'record';
}
