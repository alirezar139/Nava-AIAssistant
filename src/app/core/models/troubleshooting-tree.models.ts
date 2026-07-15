export interface TroubleshootingTreeNode {
  id: string;
  text: string;
  shape?: TreeNodeShape;
  x?: number | null;
  y?: number | null;
}

export type TreeNodeShape = 'process' | 'decision' | 'terminator' | 'data' | 'document';

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

export interface TroubleshootingOption {
  label: string;
  targetId: string;
}
