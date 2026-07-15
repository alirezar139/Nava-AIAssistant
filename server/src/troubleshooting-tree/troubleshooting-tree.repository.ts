import { aql } from 'arangojs/aql';
import { readFile } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { arangoCollections, getArangoDatabase, isArangoEnabled } from '../database/arango.js';
import { database as localDatabase } from '../database/database.js';

export interface TroubleshootingTreeNode {
  id: string;
  text: string;
  shape?: TreeNodeShape;
  x?: number | null;
  y?: number | null;
}

type TreeNodeShape =
  | 'process'
  | 'decision'
  | 'terminator'
  | 'data'
  | 'document'
  | 'erd-entity'
  | 'erd-weak-entity'
  | 'erd-relationship'
  | 'erd-identifying-relationship'
  | 'erd-attribute'
  | 'erd-multivalued-attribute'
  | 'erd-table'
  | 'erd-lookup-table'
  | 'erd-associative-entity'
  | 'erd-subtype';

const treeNodeShapes = new Set<TreeNodeShape>([
  'process',
  'decision',
  'terminator',
  'data',
  'document',
  'erd-entity',
  'erd-weak-entity',
  'erd-relationship',
  'erd-identifying-relationship',
  'erd-attribute',
  'erd-multivalued-attribute',
  'erd-table',
  'erd-lookup-table',
  'erd-associative-entity',
  'erd-subtype'
]);

export interface TroubleshootingTreeEdge {
  from: string;
  to: string;
  label?: string;
}

export interface TroubleshootingTree {
  projectKey?: string;
  startNodeId: string;
  introNodeIds: string[];
  nodes: TroubleshootingTreeNode[];
  edges: TroubleshootingTreeEdge[];
}

interface TroubleshootingNodeDocument extends TroubleshootingTreeNode {
  _key: string;
  projectKey: string;
  nodeId: string;
  sortOrder: number;
}

interface TroubleshootingEdgeDocument extends TroubleshootingTreeEdge {
  _key: string;
  _from: string;
  _to: string;
  projectKey: string;
  sortOrder: number;
}

interface TroubleshootingTreeSettingsDocument {
  _key: string;
  projectKey: string;
  startNodeId: string;
  introNodeIds: string[];
  updatedAt: string;
}

const defaultProjectKey = 'default';

export async function getTroubleshootingTree(
  projectKeyInput = defaultProjectKey
): Promise<TroubleshootingTree> {
  const projectKey = normalizeProjectKey(projectKeyInput);
  if (!isArangoEnabled()) {
    return loadLocalTree(projectKey);
  }

  await seedArangoTreeIfEmpty(projectKey);
  const tree = await readArangoTree(projectKey);
  return tree.nodes.length ? tree : withProjectKey(await loadFallbackTree(), projectKey);
}

export async function saveTroubleshootingTree(
  tree: TroubleshootingTree,
  projectKeyInput = defaultProjectKey
): Promise<TroubleshootingTree> {
  const projectKey = normalizeProjectKey(projectKeyInput);
  const normalizedTree = normalizeTroubleshootingTree(tree);

  if (!isArangoEnabled()) {
    await writeLocalTree(projectKey, normalizedTree);
    return withProjectKey(normalizedTree, projectKey);
  }

  await replaceArangoTree(projectKey, normalizedTree);
  return withProjectKey(normalizedTree, projectKey);
}

async function readArangoTree(projectKey: string): Promise<TroubleshootingTree> {
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

  const includeLegacyDefault = projectKey === defaultProjectKey;
  const settingsCursor = await database.query<TroubleshootingTreeSettingsDocument>(aql`
    FOR settings IN ${settingsCollection}
      FILTER settings._key == ${treeSettingsKey(projectKey)}
      LIMIT 1
      RETURN settings
  `);
  const settings = await settingsCursor.next();

  const nodesCursor = await database.query<TroubleshootingNodeDocument>(aql`
    FOR node IN ${nodeCollection}
      FILTER node.projectKey == ${projectKey} OR (${includeLegacyDefault} AND !HAS(node, "projectKey"))
      SORT node.sortOrder ASC, node.id ASC
      RETURN node
  `);
  const edgeCursor = await database.query<TroubleshootingEdgeDocument>(aql`
    FOR edge IN ${edgeCollection}
      FILTER edge.projectKey == ${projectKey} OR (${includeLegacyDefault} AND !HAS(edge, "projectKey"))
      SORT edge.sortOrder ASC, edge.from ASC, edge.to ASC
      RETURN edge
  `);

  const nodes = (await nodesCursor.all()).map(({ id, text, shape, x, y }) => ({
    id,
    text,
    shape,
    x: x ?? null,
    y: y ?? null
  }));
  const edges = (await edgeCursor.all()).map(({ from, to, label }) => ({
    from,
    to,
    ...(label ? { label } : {})
  }));

  return {
    projectKey,
    startNodeId: settings?.startNodeId ?? nodes[0]?.id ?? '',
    introNodeIds: settings?.introNodeIds ?? [],
    nodes,
    edges
  };
}

async function replaceArangoTree(projectKey: string, tree: TroubleshootingTree): Promise<void> {
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

  const includeLegacyDefault = projectKey === defaultProjectKey;
  await database.query(aql`
    FOR edge IN ${edgeCollection}
      FILTER edge.projectKey == ${projectKey} OR (${includeLegacyDefault} AND !HAS(edge, "projectKey"))
      REMOVE edge IN ${edgeCollection}
  `);
  await database.query(aql`
    FOR node IN ${nodeCollection}
      FILTER node.projectKey == ${projectKey} OR (${includeLegacyDefault} AND !HAS(node, "projectKey"))
      REMOVE node IN ${nodeCollection}
  `);

  await nodeCollection.saveAll(
    tree.nodes.map((node, index) => ({
      _key: nodeDocumentKey(projectKey, node.id),
      projectKey,
      nodeId: node.id,
      id: node.id,
      text: node.text,
      shape: node.shape ?? 'process',
      x: node.x ?? null,
      y: node.y ?? null,
      sortOrder: index
    })),
    { overwriteMode: 'replace' }
  );

  if (tree.edges.length) {
    await edgeCollection.saveAll(
      tree.edges.map((edge, index) => ({
        _key: toDocumentKey(`${projectKey}_${edge.from}_${edge.to}_${index}`),
        _from: `${arangoCollections.troubleshootingNodes}/${nodeDocumentKey(projectKey, edge.from)}`,
        _to: `${arangoCollections.troubleshootingNodes}/${nodeDocumentKey(projectKey, edge.to)}`,
        projectKey,
        from: edge.from,
        to: edge.to,
        label: edge.label ?? '',
        sortOrder: index
      })),
      { overwriteMode: 'replace' }
    );
  }

  await settingsCollection.save(
    {
      _key: treeSettingsKey(projectKey),
      projectKey,
      startNodeId: tree.startNodeId,
      introNodeIds: tree.introNodeIds,
      updatedAt: new Date().toISOString()
    },
    { overwriteMode: 'replace' }
  );
}

async function seedArangoTreeIfEmpty(projectKey: string): Promise<void> {
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

  const includeLegacyDefault = projectKey === defaultProjectKey;
  const countCursor = await database.query<number>(aql`
    RETURN LENGTH((
      FOR node IN ${nodeCollection}
        FILTER node.projectKey == ${projectKey} OR (${includeLegacyDefault} AND !HAS(node, "projectKey"))
        RETURN node
    ))
  `);
  const nodeCount = (await countCursor.next()) ?? 0;
  if (nodeCount > 0) return;

  const tree = await loadLocalTree(projectKey);
  await nodeCollection.saveAll(
    tree.nodes.map((node, index) => ({
      _key: nodeDocumentKey(projectKey, node.id),
      projectKey,
      nodeId: node.id,
      id: node.id,
      text: node.text,
      shape: node.shape ?? 'process',
      x: node.x ?? null,
      y: node.y ?? null,
      sortOrder: index
    })),
    { overwriteMode: 'replace' }
  );

  await edgeCollection.saveAll(
    tree.edges.map((edge, index) => ({
      _key: toDocumentKey(`${projectKey}_${edge.from}_${edge.to}_${index}`),
      _from: `${arangoCollections.troubleshootingNodes}/${nodeDocumentKey(projectKey, edge.from)}`,
      _to: `${arangoCollections.troubleshootingNodes}/${nodeDocumentKey(projectKey, edge.to)}`,
      projectKey,
      from: edge.from,
      to: edge.to,
      label: edge.label ?? '',
      sortOrder: index
    })),
    { overwriteMode: 'replace' }
  );

  await settingsCollection.save(
    {
      _key: treeSettingsKey(projectKey),
      projectKey,
      startNodeId: tree.startNodeId,
      introNodeIds: tree.introNodeIds,
      updatedAt: new Date().toISOString()
    },
    { overwriteMode: 'replace' }
  );
}

function normalizeTroubleshootingTree(tree: TroubleshootingTree): TroubleshootingTree {
  const nodeIds = new Set<string>();
  const nodes = tree.nodes
    .map((node) => ({
      id: String(node.id ?? '').trim(),
      text: String(node.text ?? '').trim(),
      shape: normalizeTreeNodeShape(node.shape),
      x: typeof node.x === 'number' && Number.isFinite(node.x) ? node.x : null,
      y: typeof node.y === 'number' && Number.isFinite(node.y) ? node.y : null
    }))
    .filter((node) => node.id && node.text)
    .filter((node) => {
      if (nodeIds.has(node.id)) return false;
      nodeIds.add(node.id);
      return true;
    });

  if (!nodes.length) {
    throw new Error('Troubleshooting tree must include at least one node.');
  }

  const edges = tree.edges
    .map((edge) => ({
      from: String(edge.from ?? '').trim(),
      to: String(edge.to ?? '').trim(),
      label: String(edge.label ?? '').trim()
    }))
    .filter((edge) => edge.from && edge.to && nodeIds.has(edge.from) && nodeIds.has(edge.to))
    .map((edge) => ({
      from: edge.from,
      to: edge.to,
      ...(edge.label ? { label: edge.label } : {})
    }));

  const startNodeId = nodeIds.has(tree.startNodeId) ? tree.startNodeId : nodes[0]!.id;
  const introNodeIds = [...new Set(tree.introNodeIds ?? [])]
    .map((id) => String(id).trim())
    .filter((id) => nodeIds.has(id));

  return {
    projectKey: tree.projectKey,
    startNodeId,
    introNodeIds,
    nodes,
    edges
  };
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

async function loadLocalTree(projectKey = defaultProjectKey): Promise<TroubleshootingTree> {
  localDatabase.data.troubleshootingTrees ??= {};
  const storedTree =
    localDatabase.data.troubleshootingTrees[projectKey] ??
    (projectKey === defaultProjectKey ? localDatabase.data.troubleshootingTree : null);
  if (storedTree?.nodes?.length) {
    return withProjectKey(normalizeTroubleshootingTree(storedTree), projectKey);
  }

  const fallbackTree = withProjectKey(normalizeTroubleshootingTree(await loadFallbackTree()), projectKey);
  localDatabase.data.troubleshootingTrees[projectKey] = fallbackTree;
  if (projectKey === defaultProjectKey) {
    localDatabase.data.troubleshootingTree = fallbackTree;
  }
  await localDatabase.write();
  return fallbackTree;
}

async function writeLocalTree(projectKey: string, tree: TroubleshootingTree): Promise<void> {
  localDatabase.data.troubleshootingTrees ??= {};
  const treeWithProject = withProjectKey(tree, projectKey);
  localDatabase.data.troubleshootingTrees[projectKey] = treeWithProject;
  if (projectKey === defaultProjectKey) {
    localDatabase.data.troubleshootingTree = treeWithProject;
  }
  await localDatabase.write();
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

function normalizeProjectKey(value: unknown): string {
  const key = String(value ?? '')
    .trim()
    .replace(/\s+/g, '-')
    .slice(0, 80);
  return key || defaultProjectKey;
}

function normalizeTreeNodeShape(value: unknown): TreeNodeShape {
  return treeNodeShapes.has(value as TreeNodeShape) ? (value as TreeNodeShape) : 'process';
}

function treeSettingsKey(projectKey: string): string {
  return projectKey === defaultProjectKey
    ? 'troubleshooting_tree'
    : `troubleshooting_tree_${toDocumentKey(projectKey)}`;
}

function nodeDocumentKey(projectKey: string, nodeId: string): string {
  return projectKey === defaultProjectKey ? toDocumentKey(nodeId) : toDocumentKey(`${projectKey}_${nodeId}`);
}

function withProjectKey(tree: TroubleshootingTree, projectKey: string): TroubleshootingTree {
  return { ...tree, projectKey };
}
