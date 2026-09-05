import { readFile } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { prisma } from '../database/prisma-client.js';
import type { TroubleshootingTreeMode } from '../database/domain-types.js';

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
  const cached = readTreeCache(projectKey, mode);
  if (cached) return cached;

  let tree = await readTree(projectKey, mode);

  if (!tree.nodes.length) {
    const activeTree = mode === 'active' ? tree : await readTree(projectKey, 'active');

    if (activeTree.nodes.length) {
      tree = activeTree;
    } else {
      const fallback = withProjectKey(normalizeTroubleshootingTree(await loadFallbackTree()), projectKey);
      await saveTree(projectKey, 'active', fallback);
      await saveTree(projectKey, 'draft', fallback);
      tree = fallback;
    }
  }

  writeTreeCache(projectKey, mode, tree);
  return tree;
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

  await saveTree(projectKey, mode, normalizedTree);
  if (mode === 'active') {
    await saveTree(projectKey, 'draft', normalizedTree);
  }
  return withProjectKey(normalizedTree, projectKey);
}

async function readTree(projectKey: string, mode: TroubleshootingTreeMode): Promise<TroubleshootingTree> {
  const [settings, nodes, edges] = await Promise.all([
    prisma.troubleshootingTreeSettings.findUnique({ where: { projectKey_mode: { projectKey, mode } } }),
    prisma.troubleshootingNode.findMany({
      where: { projectKey, treeMode: mode },
      orderBy: [{ sortOrder: 'asc' }, { id: 'asc' }]
    }),
    prisma.troubleshootingEdge.findMany({
      where: { projectKey, treeMode: mode },
      orderBy: [{ sortOrder: 'asc' }],
      include: { fromNode: true, toNode: true }
    })
  ]);

  return {
    projectKey,
    startNodeId: settings?.startNodeId ?? nodes[0]?.nodeId ?? '',
    introNodeIds: Array.isArray(settings?.introNodeIds) ? (settings.introNodeIds as string[]) : [],
    nodes: nodes.map((node) => ({
      id: node.nodeId,
      text: node.text,
      shape: node.shape,
      x: node.x,
      y: node.y
    })),
    edges: edges.map((edge) => ({
      from: edge.fromNode.nodeId,
      to: edge.toNode.nodeId,
      ...(edge.label ? { label: edge.label } : {})
    }))
  };
}

async function saveTree(
  projectKey: string,
  mode: TroubleshootingTreeMode,
  tree: TroubleshootingTree
): Promise<void> {
  await prisma.$transaction(async (tx) => {
    const now = new Date();
    await tx.project.upsert({
      where: { key: projectKey },
      update: {},
      create: {
        key: projectKey,
        title: projectKey === defaultProjectKey ? 'پروژه پیش‌فرض' : projectKey,
        description: ''
      }
    });

    await tx.troubleshootingEdge.deleteMany({ where: { projectKey, treeMode: mode } });
    await tx.troubleshootingNode.deleteMany({ where: { projectKey, treeMode: mode } });

    await tx.troubleshootingNode.createMany({
      data: tree.nodes.map((node, index) => ({
        projectKey,
        treeMode: mode,
        nodeId: node.id,
        text: node.text,
        shape: node.shape ?? 'process',
        x: node.x ?? null,
        y: node.y ?? null,
        sortOrder: index
      }))
    });

    const insertedNodes = await tx.troubleshootingNode.findMany({
      where: { projectKey, treeMode: mode },
      select: { id: true, nodeId: true }
    });
    const nodeIdMap = new Map(insertedNodes.map((node) => [node.nodeId, node.id]));

    if (tree.edges.length) {
      await tx.troubleshootingEdge.createMany({
        data: tree.edges.flatMap((edge, index) => {
          const fromNodeId = nodeIdMap.get(edge.from);
          const toNodeId = nodeIdMap.get(edge.to);
          if (fromNodeId === undefined || toNodeId === undefined) return [];
          return [
            {
              projectKey,
              treeMode: mode,
              fromNodeId,
              toNodeId,
              label: edge.label ?? null,
              sortOrder: index
            }
          ];
        })
      });
    }

    const versionAggregate = await tx.troubleshootingTreeVersion.aggregate({
      where: { projectKey, mode },
      _max: { version: true }
    });
    const version = (versionAggregate._max.version ?? 0) + 1;

    await tx.troubleshootingTreeSettings.upsert({
      where: { projectKey_mode: { projectKey, mode } },
      update: {
        startNodeId: tree.startNodeId,
        introNodeIds: tree.introNodeIds,
        version,
        nodeCount: tree.nodes.length,
        edgeCount: tree.edges.length,
        ...(mode === 'active' ? { activatedAt: now } : {})
      },
      create: {
        projectKey,
        mode,
        startNodeId: tree.startNodeId,
        introNodeIds: tree.introNodeIds,
        version,
        nodeCount: tree.nodes.length,
        edgeCount: tree.edges.length,
        activatedAt: mode === 'active' ? now : null
      }
    });

    await tx.troubleshootingTreeVersion.create({
      data: {
        projectKey,
        mode,
        version,
        status: mode,
        nodeCount: tree.nodes.length,
        edgeCount: tree.edges.length,
        activatedAt: mode === 'active' ? now : null
      }
    });
  });
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
