import { aql } from 'arangojs/aql';
import { readFile } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { arangoCollections, getArangoDatabase, isArangoEnabled } from '../database/arango.js';
import {
  database as localDatabase,
  troubleshootingTreeVersionKey,
  type ProjectRecord,
  type TroubleshootingTreeMode,
  type TroubleshootingTreeVersionRecord
} from '../database/database.js';

export interface TroubleshootingTreeNode {
  id: string;
  text: string;
  shape?: TreeNodeShape;
  x?: number | null;
  y?: number | null;
}

type TreeNodeShape = string;

const treeNodeShapePattern = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;

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
  treeMode: TroubleshootingTreeMode;
  nodeId: string;
  sortOrder: number;
  createdAt: string;
  updatedAt: string;
}

interface TroubleshootingEdgeDocument extends TroubleshootingTreeEdge {
  _key: string;
  _from: string;
  _to: string;
  projectKey: string;
  treeMode: TroubleshootingTreeMode;
  sortOrder: number;
  createdAt: string;
  updatedAt: string;
}

interface TroubleshootingTreeSettingsDocument {
  _key: string;
  projectKey: string;
  mode: TroubleshootingTreeMode;
  startNodeId: string;
  introNodeIds: string[];
  version: number;
  nodeCount: number;
  edgeCount: number;
  createdAt: string;
  updatedAt: string;
  activatedAt: string | null;
}

const defaultProjectKey = 'default';
const treeCacheTtlMs = 60_000;
const treeCache = new Map<
  string,
  {
    expiresAt: number;
    tree: TroubleshootingTree;
  }
>();

export async function getTroubleshootingTree(
  projectKeyInput = defaultProjectKey,
  modeInput: TroubleshootingTreeMode = 'active'
): Promise<TroubleshootingTree> {
  const projectKey = normalizeProjectKey(projectKeyInput);
  const mode = normalizeTreeMode(modeInput);
  const cachedTree = readTreeCache(projectKey, mode);
  if (cachedTree) return cachedTree;

  let tree: TroubleshootingTree;

  if (!isArangoEnabled()) {
    if (mode === 'draft') {
      const draftTree = readLocalTreeVersion(projectKey, 'draft') ?? readLegacyLocalTree(projectKey, 'draft');
      if (draftTree?.nodes.length) {
        tree = withProjectKey(normalizeTroubleshootingTree(draftTree), projectKey);
        writeTreeCache(projectKey, mode, tree);
        return tree;
      }
    }
    tree = await loadLocalTree(projectKey);
    writeTreeCache(projectKey, mode, tree);
    return tree;
  }

  if (mode === 'draft') {
    const draftTree = await readArangoTree(projectKey, 'draft');
    if (draftTree.nodes.length) {
      tree = withProjectKey(draftTree, projectKey);
      writeTreeCache(projectKey, mode, tree);
      return tree;
    }

    const legacyDraftTree = await readArangoTree(treeStorageProjectKey(projectKey, 'draft'), 'active');
    if (legacyDraftTree.nodes.length) {
      tree = withProjectKey(legacyDraftTree, projectKey);
      writeTreeCache(projectKey, mode, tree);
      return tree;
    }
  }

  await seedArangoTreeIfEmpty(projectKey);
  const activeTree = await readArangoTree(projectKey, 'active');
  const result = activeTree.nodes.length ? activeTree : withProjectKey(await loadFallbackTree(), projectKey);
  writeTreeCache(projectKey, mode, result);
  return result;
}

export async function saveTroubleshootingTree(
  tree: TroubleshootingTree,
  projectKeyInput = defaultProjectKey,
  modeInput: TroubleshootingTreeMode = 'active'
): Promise<TroubleshootingTree> {
  const projectKey = normalizeProjectKey(projectKeyInput);
  const mode = normalizeTreeMode(modeInput);
  const normalizedTree = normalizeTroubleshootingTree(tree);
  clearTreeCache(projectKey);

  if (!isArangoEnabled()) {
    await writeLocalTreeVersion(projectKey, mode, normalizedTree);
    if (mode === 'active') {
      await writeLocalTreeVersion(projectKey, 'draft', normalizedTree);
    }
    return withProjectKey(normalizedTree, projectKey);
  }

  await replaceArangoTree(projectKey, mode, normalizedTree);
  if (mode === 'active') {
    await replaceArangoTree(projectKey, 'draft', normalizedTree);
  }
  return withProjectKey(normalizedTree, projectKey);
}

async function readArangoTree(
  projectKey: string,
  mode: TroubleshootingTreeMode
): Promise<TroubleshootingTree> {
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
      FILTER settings._key IN ${treeSettingsKeys(projectKey, mode)}
      LIMIT 1
      RETURN settings
  `);
  const settings = await settingsCursor.next();
  const includeLegacyDefault = projectKey === defaultProjectKey && mode === 'active';
  const includeLegacyProject = mode === 'active';

  const nodesCursor = await database.query<TroubleshootingNodeDocument>(aql`
    FOR node IN ${nodeCollection}
      FILTER (
        node.projectKey == ${projectKey} AND (node.treeMode == ${mode} OR (${includeLegacyProject} AND !HAS(node, "treeMode")))
      ) OR (${includeLegacyDefault} AND !HAS(node, "projectKey"))
      SORT node.sortOrder ASC, node.id ASC
      RETURN node
  `);
  const edgeCursor = await database.query<TroubleshootingEdgeDocument>(aql`
    FOR edge IN ${edgeCollection}
      FILTER (
        edge.projectKey == ${projectKey} AND (edge.treeMode == ${mode} OR (${includeLegacyProject} AND !HAS(edge, "treeMode")))
      ) OR (${includeLegacyDefault} AND !HAS(edge, "projectKey"))
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

async function replaceArangoTree(
  projectKey: string,
  mode: TroubleshootingTreeMode,
  tree: TroubleshootingTree
): Promise<void> {
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
  const versionCollection = database.collection<TroubleshootingTreeSettingsDocument>(
    arangoCollections.troubleshootingTreeVersions
  );

  const now = new Date().toISOString();
  await ensureArangoProject(projectKey, now);

  const includeLegacyDefault = projectKey === defaultProjectKey && mode === 'active';
  const includeLegacyProject = mode === 'active';
  await database.query(aql`
    FOR edge IN ${edgeCollection}
      FILTER (
        edge.projectKey == ${projectKey} AND (edge.treeMode == ${mode} OR (${includeLegacyProject} AND !HAS(edge, "treeMode")))
      ) OR (${includeLegacyDefault} AND !HAS(edge, "projectKey"))
      REMOVE edge IN ${edgeCollection}
  `);
  await database.query(aql`
    FOR node IN ${nodeCollection}
      FILTER (
        node.projectKey == ${projectKey} AND (node.treeMode == ${mode} OR (${includeLegacyProject} AND !HAS(node, "treeMode")))
      ) OR (${includeLegacyDefault} AND !HAS(node, "projectKey"))
      REMOVE node IN ${nodeCollection}
  `);

  await nodeCollection.saveAll(
    tree.nodes.map((node, index) => ({
      _key: nodeDocumentKey(projectKey, mode, node.id),
      projectKey,
      treeMode: mode,
      nodeId: node.id,
      id: node.id,
      text: node.text,
      shape: node.shape ?? 'process',
      x: node.x ?? null,
      y: node.y ?? null,
      sortOrder: index,
      createdAt: now,
      updatedAt: now
    })),
    { overwriteMode: 'replace' }
  );

  if (tree.edges.length) {
    await edgeCollection.saveAll(
      tree.edges.map((edge, index) => ({
        _key: toDocumentKey(`${projectKey}_${mode}_${edge.from}_${edge.to}_${index}`),
        _from: `${arangoCollections.troubleshootingNodes}/${nodeDocumentKey(projectKey, mode, edge.from)}`,
        _to: `${arangoCollections.troubleshootingNodes}/${nodeDocumentKey(projectKey, mode, edge.to)}`,
        projectKey,
        treeMode: mode,
        from: edge.from,
        to: edge.to,
        label: edge.label ?? '',
        sortOrder: index,
        createdAt: now,
        updatedAt: now
      })),
      { overwriteMode: 'replace' }
    );
  }

  const version = await nextArangoTreeVersion(projectKey, mode);
  const settings = buildTreeVersionDocument(projectKey, mode, tree, version, now);

  await settingsCollection.save(
    { ...settings, _key: treeSettingsKey(projectKey, mode) },
    { overwriteMode: 'replace' }
  );
  await versionCollection.save(
    { ...settings, _key: treeVersionDocumentKey(projectKey, mode) },
    { overwriteMode: 'replace' }
  );
}

async function seedArangoTreeIfEmpty(projectKey: string): Promise<void> {
  const existingActiveTree = await readArangoTree(projectKey, 'active');
  if (existingActiveTree.nodes.length) {
    const existingDraftTree = await readArangoTree(projectKey, 'draft');
    const activeVersion = await readArangoTreeVersion(projectKey, 'active');
    const draftVersion = await readArangoTreeVersion(projectKey, 'draft');
    const localFallbackTree = await loadLocalTree(projectKey);
    const activeRepairTree =
      activeVersion?.edgeCount &&
      existingActiveTree.edges.length < activeVersion.edgeCount &&
      existingDraftTree.edges.length === activeVersion.edgeCount
        ? { ...existingActiveTree, edges: existingDraftTree.edges }
        : activeVersion?.edgeCount && existingActiveTree.edges.length < activeVersion.edgeCount
          ? localFallbackTree
          : existingActiveTree;
    const draftRepairTree =
      existingDraftTree.nodes.length &&
      activeRepairTree.edges.length > 0 &&
      existingDraftTree.edges.length < activeRepairTree.edges.length
        ? { ...existingDraftTree, edges: activeRepairTree.edges }
        : existingDraftTree.nodes.length
          ? existingDraftTree
          : activeRepairTree;

    if (
      !activeVersion ||
      activeRepairTree.edges.length !== existingActiveTree.edges.length ||
      activeVersion.nodeCount !== activeRepairTree.nodes.length ||
      activeVersion.edgeCount !== activeRepairTree.edges.length
    ) {
      await replaceArangoTree(projectKey, 'active', activeRepairTree);
    }

    if (
      !existingDraftTree.nodes.length ||
      !draftVersion ||
      draftRepairTree.edges.length !== existingDraftTree.edges.length ||
      draftVersion.nodeCount !== draftRepairTree.nodes.length ||
      draftVersion.edgeCount !== draftRepairTree.edges.length
    ) {
      await replaceArangoTree(projectKey, 'draft', draftRepairTree);
    }
    return;
  }

  const tree = await loadLocalTree(projectKey);
  await replaceArangoTree(projectKey, 'active', tree);
  await replaceArangoTree(projectKey, 'draft', tree);
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
  const storedTree = readLocalTreeVersion(projectKey, 'active') ?? readLegacyLocalTree(projectKey, 'active');
  if (storedTree?.nodes?.length) {
    return withProjectKey(normalizeTroubleshootingTree(storedTree), projectKey);
  }

  const fallbackTree = withProjectKey(normalizeTroubleshootingTree(await loadFallbackTree()), projectKey);
  await writeLocalTreeVersion(projectKey, 'active', fallbackTree);
  await writeLocalTreeVersion(projectKey, 'draft', fallbackTree);
  return fallbackTree;
}

function readLocalTreeVersion(
  projectKey: string,
  mode: TroubleshootingTreeMode
): TroubleshootingTreeVersionRecord | null {
  localDatabase.data.troubleshootingTreeVersions ??= {};
  return (
    localDatabase.data.troubleshootingTreeVersions[troubleshootingTreeVersionKey(projectKey, mode)] ?? null
  );
}

function readLegacyLocalTree(projectKey: string, mode: TroubleshootingTreeMode): TroubleshootingTree | null {
  localDatabase.data.troubleshootingTrees ??= {};
  const storageKey = treeStorageProjectKey(projectKey, mode);
  return (
    localDatabase.data.troubleshootingTrees[storageKey] ??
    (projectKey === defaultProjectKey && mode === 'active' ? localDatabase.data.troubleshootingTree : null)
  );
}

async function writeLocalTreeVersion(
  projectKey: string,
  mode: TroubleshootingTreeMode,
  tree: TroubleshootingTree
): Promise<void> {
  const now = new Date().toISOString();
  localDatabase.data.projects ??= {};
  localDatabase.data.troubleshootingTreeVersions ??= {};
  localDatabase.data.troubleshootingTrees ??= {};
  const previous =
    localDatabase.data.troubleshootingTreeVersions[troubleshootingTreeVersionKey(projectKey, mode)];
  const treeWithProject = withProjectKey(tree, projectKey);
  localDatabase.data.projects[projectKey] = normalizeProjectRecord(
    localDatabase.data.projects[projectKey],
    projectKey,
    now
  );
  localDatabase.data.troubleshootingTreeVersions[troubleshootingTreeVersionKey(projectKey, mode)] = {
    ...treeWithProject,
    projectKey,
    mode,
    status: mode,
    version: (previous?.version ?? 0) + 1,
    nodeCount: treeWithProject.nodes.length,
    edgeCount: treeWithProject.edges.length,
    createdAt: previous?.createdAt ?? now,
    updatedAt: now,
    activatedAt: mode === 'active' ? now : (previous?.activatedAt ?? null)
  };
  localDatabase.data.troubleshootingTrees[treeStorageProjectKey(projectKey, mode)] = treeWithProject;
  if (projectKey === defaultProjectKey && mode === 'active') {
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

function normalizeTreeMode(value: unknown): TroubleshootingTreeMode {
  return value === 'draft' ? 'draft' : 'active';
}

function normalizeTreeNodeShape(value: unknown): TreeNodeShape {
  const shape = String(value ?? '')
    .trim()
    .toLowerCase();
  return treeNodeShapePattern.test(shape) ? shape : 'process';
}

function treeStorageProjectKey(projectKey: string, mode: TroubleshootingTreeMode): string {
  return mode === 'draft' ? `${projectKey}__draft` : projectKey;
}

function treeSettingsKey(projectKey: string, mode: TroubleshootingTreeMode): string {
  return `troubleshooting_tree_${toDocumentKey(projectKey)}_${mode}`;
}

function treeSettingsKeys(projectKey: string, mode: TroubleshootingTreeMode): string[] {
  const keys = [treeSettingsKey(projectKey, mode)];
  if (projectKey === defaultProjectKey && mode === 'active') {
    keys.push('troubleshooting_tree');
  }
  const legacyStorageKey = treeStorageProjectKey(projectKey, mode);
  if (legacyStorageKey !== projectKey) {
    keys.push(
      legacyStorageKey === defaultProjectKey
        ? 'troubleshooting_tree'
        : `troubleshooting_tree_${toDocumentKey(legacyStorageKey)}`
    );
  }
  return [...new Set(keys)];
}

function treeVersionDocumentKey(projectKey: string, mode: TroubleshootingTreeMode): string {
  return toDocumentKey(troubleshootingTreeVersionKey(projectKey, mode));
}

function nodeDocumentKey(projectKey: string, mode: TroubleshootingTreeMode, nodeId: string): string {
  return toDocumentKey(`${projectKey}_${mode}_${nodeId}`);
}

function withProjectKey(tree: TroubleshootingTree, projectKey: string): TroubleshootingTree {
  return { ...tree, projectKey };
}

function treeCacheKey(projectKey: string, mode: TroubleshootingTreeMode): string {
  return `${projectKey}:${mode}`;
}

function readTreeCache(projectKey: string, mode: TroubleshootingTreeMode): TroubleshootingTree | null {
  const cached = treeCache.get(treeCacheKey(projectKey, mode));
  if (!cached) return null;
  if (cached.expiresAt <= Date.now()) {
    treeCache.delete(treeCacheKey(projectKey, mode));
    return null;
  }
  return cloneTroubleshootingTree(cached.tree);
}

function writeTreeCache(projectKey: string, mode: TroubleshootingTreeMode, tree: TroubleshootingTree): void {
  treeCache.set(treeCacheKey(projectKey, mode), {
    expiresAt: Date.now() + treeCacheTtlMs,
    tree: cloneTroubleshootingTree(tree)
  });
}

function clearTreeCache(projectKey: string): void {
  treeCache.delete(treeCacheKey(projectKey, 'active'));
  treeCache.delete(treeCacheKey(projectKey, 'draft'));
}

function cloneTroubleshootingTree(tree: TroubleshootingTree): TroubleshootingTree {
  return {
    projectKey: tree.projectKey,
    startNodeId: tree.startNodeId,
    introNodeIds: [...tree.introNodeIds],
    nodes: tree.nodes.map((node) => ({ ...node })),
    edges: tree.edges.map((edge) => ({ ...edge }))
  };
}

function normalizeProjectRecord(
  project: ProjectRecord | undefined,
  projectKey: string,
  timestamp: string
): ProjectRecord {
  return {
    key: projectKey,
    title: project?.title?.trim() || (projectKey === defaultProjectKey ? 'پروژه پیش‌فرض' : projectKey),
    description: project?.description ?? '',
    isActive: project?.isActive ?? true,
    createdAt: project?.createdAt ?? timestamp,
    updatedAt: timestamp
  };
}

function buildTreeVersionDocument(
  projectKey: string,
  mode: TroubleshootingTreeMode,
  tree: TroubleshootingTree,
  version: number,
  timestamp: string,
  createdAt = timestamp
): TroubleshootingTreeSettingsDocument {
  return {
    _key: treeVersionDocumentKey(projectKey, mode),
    projectKey,
    mode,
    startNodeId: tree.startNodeId,
    introNodeIds: tree.introNodeIds,
    version,
    nodeCount: tree.nodes.length,
    edgeCount: tree.edges.length,
    createdAt,
    updatedAt: timestamp,
    activatedAt: mode === 'active' ? timestamp : null
  };
}

async function ensureArangoProject(projectKey: string, timestamp: string): Promise<void> {
  const database = getArangoDatabase();
  const projects = database.collection<ProjectRecord>(arangoCollections.projects);
  const key = toDocumentKey(projectKey);
  const cursor = await database.query<ProjectRecord>(aql`
    FOR project IN ${projects}
      FILTER project.key == ${projectKey}
      LIMIT 1
      RETURN project
  `);
  const existing = await cursor.next();
  const project = normalizeProjectRecord(existing ?? undefined, projectKey, timestamp);
  await projects.save({ _key: key, ...project }, { overwriteMode: 'replace' });
}

async function nextArangoTreeVersion(projectKey: string, mode: TroubleshootingTreeMode): Promise<number> {
  const database = getArangoDatabase();
  const versions = database.collection<TroubleshootingTreeSettingsDocument>(
    arangoCollections.troubleshootingTreeVersions
  );
  const cursor = await database.query<number | null>(aql`
    FOR version IN ${versions}
      FILTER version.projectKey == ${projectKey} AND version.mode == ${mode}
      COLLECT AGGREGATE maxVersion = MAX(TO_NUMBER(version.version))
      RETURN maxVersion
  `);
  const currentMax = Number((await cursor.next()) ?? 0);
  return Number.isFinite(currentMax) ? currentMax + 1 : 1;
}

async function readArangoTreeVersion(
  projectKey: string,
  mode: TroubleshootingTreeMode
): Promise<TroubleshootingTreeSettingsDocument | undefined> {
  const database = getArangoDatabase();
  const versions = database.collection<TroubleshootingTreeSettingsDocument>(
    arangoCollections.troubleshootingTreeVersions
  );
  const cursor = await database.query<TroubleshootingTreeSettingsDocument>(aql`
    FOR version IN ${versions}
      FILTER version.projectKey == ${projectKey} AND version.mode == ${mode}
      LIMIT 1
      RETURN version
  `);
  return (await cursor.next()) ?? undefined;
}
