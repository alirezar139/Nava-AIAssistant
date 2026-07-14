import { Database } from 'arangojs';
import { CollectionType } from 'arangojs/collections';
import { config } from '../config/config.js';

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
    fields: ['username'],
    unique: true
  });
  await database.collection(arangoCollections.faqs).ensureIndex({
    type: 'persistent',
    fields: ['category']
  });
  await database.collection(arangoCollections.diagnosticCases).ensureIndex({
    type: 'persistent',
    fields: ['treeNodeId']
  });
  await database.collection(arangoCollections.externalServices).ensureIndex({
    type: 'persistent',
    fields: ['key'],
    unique: true
  });
  await database.collection(arangoCollections.troubleshootingNodes).ensureIndex({
    type: 'persistent',
    fields: ['nodeId'],
    unique: true
  });
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
