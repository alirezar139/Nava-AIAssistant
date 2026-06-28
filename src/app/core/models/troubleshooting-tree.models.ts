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

export interface TroubleshootingOption {
  label: string;
  targetId: string;
}
