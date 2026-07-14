import { aql } from 'arangojs/aql';
import { readFile } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { arangoCollections, getArangoDatabase, isArangoEnabled } from '../database/arango.js';

export interface TroubleshootingTreeNode {
  id: string;
  text: string;
  x?: number | null;
  y?: number | null;
}

export interface TroubleshootingTreeEdge {
  from: string;
  to: string;
  label?: string;
}

export interface TroubleshootingTree {
  startNodeId: string;
  introNodeIds: string[];
  nodes: TroubleshootingTreeNode[];
  edges: TroubleshootingTreeEdge[];
}

interface TroubleshootingNodeDocument extends TroubleshootingTreeNode {
  _key: string;
  nodeId: string;
  sortOrder: number;
}

interface TroubleshootingEdgeDocument extends TroubleshootingTreeEdge {
  _key: string;
  _from: string;
  _to: string;
  sortOrder: number;
}

interface TroubleshootingTreeSettingsDocument {
  _key: string;
  startNodeId: string;
  introNodeIds: string[];
  updatedAt: string;
}

const treeSettingsKey = 'troubleshooting_tree';

export async function getTroubleshootingTree(): Promise<TroubleshootingTree> {
  if (!isArangoEnabled()) {
    return loadFallbackTree();
  }

  await seedArangoTreeIfEmpty();
  const tree = await readArangoTree();
  return tree.nodes.length ? tree : loadFallbackTree();
}

async function readArangoTree(): Promise<TroubleshootingTree> {
  const database = getArangoDatabase();
  const nodeCollection = database.collection<TroubleshootingNodeDocument>(
    arangoCollections.troubleshootingNodes
  );
  const edgeCollection = database.collection<TroubleshootingEdgeDocument>(
    arangoCollections.troubleshootingEdges
  );
  const settingsCollection = database.collection<TroubleshootingTreeSettingsDocument>(
    arangoCollections.settings
  );

  const settingsCursor = await database.query<TroubleshootingTreeSettingsDocument>(aql`
    FOR settings IN ${settingsCollection}
      FILTER settings._key == ${treeSettingsKey}
      LIMIT 1
      RETURN settings
  `);
  const settings = await settingsCursor.next();

  const nodesCursor = await database.query<TroubleshootingNodeDocument>(aql`
    FOR node IN ${nodeCollection}
      SORT node.sortOrder ASC, node.id ASC
      RETURN node
  `);
  const edgeCursor = await database.query<TroubleshootingEdgeDocument>(aql`
    FOR edge IN ${edgeCollection}
      SORT edge.sortOrder ASC, edge.from ASC, edge.to ASC
      RETURN edge
  `);

  const nodes = (await nodesCursor.all()).map(({ id, text, x, y }) => ({
    id,
    text,
    x: x ?? null,
    y: y ?? null
  }));
  const edges = (await edgeCursor.all()).map(({ from, to, label }) => ({
    from,
    to,
    ...(label ? { label } : {})
  }));

  return {
    startNodeId: settings?.startNodeId ?? nodes[0]?.id ?? '',
    introNodeIds: settings?.introNodeIds ?? [],
    nodes,
    edges
  };
}

async function seedArangoTreeIfEmpty(): Promise<void> {
  const database = getArangoDatabase();
  const nodeCollection = database.collection<TroubleshootingNodeDocument>(
    arangoCollections.troubleshootingNodes
  );
  const edgeCollection = database.collection<TroubleshootingEdgeDocument>(
    arangoCollections.troubleshootingEdges
  );
  const settingsCollection = database.collection<TroubleshootingTreeSettingsDocument>(
    arangoCollections.settings
  );

  const countCursor = await database.query<number>(aql`
    RETURN LENGTH(${nodeCollection})
  `);
  const nodeCount = (await countCursor.next()) ?? 0;
  if (nodeCount > 0) return;

  const tree = await loadFallbackTree();
  await nodeCollection.saveAll(
    tree.nodes.map((node, index) => ({
      _key: toDocumentKey(node.id),
      nodeId: node.id,
      id: node.id,
      text: node.text,
      x: node.x ?? null,
      y: node.y ?? null,
      sortOrder: index
    })),
    { overwriteMode: 'replace' }
  );

  await edgeCollection.saveAll(
    tree.edges.map((edge, index) => ({
      _key: toDocumentKey(`${edge.from}_${edge.to}_${index}`),
      _from: `${arangoCollections.troubleshootingNodes}/${toDocumentKey(edge.from)}`,
      _to: `${arangoCollections.troubleshootingNodes}/${toDocumentKey(edge.to)}`,
      from: edge.from,
      to: edge.to,
      label: edge.label ?? '',
      sortOrder: index
    })),
    { overwriteMode: 'replace' }
  );

  await settingsCollection.save(
    {
      _key: treeSettingsKey,
      startNodeId: tree.startNodeId,
      introNodeIds: tree.introNodeIds,
      updatedAt: new Date().toISOString()
    },
    { overwriteMode: 'replace' }
  );
}

async function loadFallbackTree(): Promise<TroubleshootingTree> {
  const content = await readFirstExistingFile([
    resolve(process.cwd(), 'src/assets/troubleshooting-tree.json'),
    resolve(process.cwd(), '../src/assets/troubleshooting-tree.json'),
    resolve(process.cwd(), 'dist/nava-ai-assistant/assets/troubleshooting-tree.json'),
    resolve(process.cwd(), '../dist/nava-ai-assistant/assets/troubleshooting-tree.json'),
    resolve(dirname(fileURLToPath(import.meta.url)), '../../../src/assets/troubleshooting-tree.json'),
    resolve(
      dirname(fileURLToPath(import.meta.url)),
      '../../../dist/nava-ai-assistant/assets/troubleshooting-tree.json'
    )
  ]);
  const parsed = JSON.parse(content) as Partial<TroubleshootingTree>;
  if (!parsed.startNodeId || !Array.isArray(parsed.nodes) || !Array.isArray(parsed.edges)) {
    throw new Error('Troubleshooting tree fallback file is invalid.');
  }
  return {
    startNodeId: parsed.startNodeId,
    introNodeIds: Array.isArray(parsed.introNodeIds) ? parsed.introNodeIds : [],
    nodes: parsed.nodes,
    edges: parsed.edges
  };
}

async function readFirstExistingFile(paths: string[]): Promise<string> {
  const errors: string[] = [];
  for (const path of paths) {
    try {
      return await readFile(path, 'utf8');
    } catch (error) {
      errors.push(error instanceof Error ? error.message : String(error));
    }
  }
  throw new Error(`Troubleshooting tree file was not found. ${errors.join(' | ')}`);
}

function toDocumentKey(value: string): string {
  const key = value
    .trim()
    .replace(/[^a-zA-Z0-9_:.@()+,=;$!*'%-]/g, '_')
    .slice(0, 254);
  return key || 'node';
}
