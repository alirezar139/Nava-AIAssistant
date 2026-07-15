import { Router } from 'express';
import { z } from 'zod';
import { requireAuth } from '../auth/auth.middleware.js';
import { sendError } from '../common/api-error.js';
import { getTroubleshootingTree, saveTroubleshootingTree } from './troubleshooting-tree.repository.js';

export const troubleshootingTreeRouter = Router();

const troubleshootingTreeSchema = z.object({
  startNodeId: z.string().trim().min(1),
  introNodeIds: z.array(z.string().trim()).default([]),
  nodes: z
    .array(
      z.object({
        id: z.string().trim().min(1),
        text: z.string().trim().min(1),
        shape: z
          .enum([
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
          ])
          .optional(),
        x: z.number().finite().nullable().optional(),
        y: z.number().finite().nullable().optional()
      })
    )
    .min(1),
  edges: z
    .array(
      z.object({
        from: z.string().trim().min(1),
        to: z.string().trim().min(1),
        label: z.string().trim().optional()
      })
    )
    .default([])
});

function projectKeyFromRequest(request: { query: Record<string, unknown> }): string {
  const value = request.query['projectKey'];
  return typeof value === 'string' ? value : 'default';
}

troubleshootingTreeRouter.get('/', async (request, response) => {
  try {
    response.json(await getTroubleshootingTree(projectKeyFromRequest(request)));
  } catch (error) {
    console.error(error);
    sendError(response, 500, 'TROUBLESHOOTING_TREE_LOAD_FAILED', 'درختواره راهبری قابل دریافت نیست.');
  }
});

troubleshootingTreeRouter.put('/', requireAuth(['admin']), async (request, response) => {
  const result = troubleshootingTreeSchema.safeParse(request.body);
  if (!result.success) {
    sendError(response, 400, 'INVALID_TROUBLESHOOTING_TREE', 'ساختار درختواره معتبر نیست.');
    return;
  }

  const nodeIds = new Set(result.data.nodes.map((node) => node.id));
  const hasInvalidEdge = result.data.edges.some((edge) => !nodeIds.has(edge.from) || !nodeIds.has(edge.to));
  if (!nodeIds.has(result.data.startNodeId) || hasInvalidEdge) {
    sendError(
      response,
      400,
      'INVALID_TROUBLESHOOTING_TREE_REFERENCES',
      'شناسه شروع یا ارتباط های درختواره به نود نامعتبر اشاره می کنند.'
    );
    return;
  }

  try {
    response.json(await saveTroubleshootingTree(result.data, projectKeyFromRequest(request)));
  } catch (error) {
    console.error(error);
    sendError(response, 500, 'TROUBLESHOOTING_TREE_SAVE_FAILED', 'ذخیره درختواره انجام نشد.');
  }
});
