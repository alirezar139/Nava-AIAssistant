import { Router } from 'express';
import { sendError } from '../common/api-error.js';
import { getTroubleshootingTree } from './troubleshooting-tree.repository.js';

export const troubleshootingTreeRouter = Router();

troubleshootingTreeRouter.get('/', async (_request, response) => {
  try {
    response.json(await getTroubleshootingTree());
  } catch (error) {
    console.error(error);
    sendError(response, 500, 'TROUBLESHOOTING_TREE_LOAD_FAILED', 'درختواره راهبری قابل دریافت نیست.');
  }
});
