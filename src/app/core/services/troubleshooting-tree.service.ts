import { HttpClient } from '@angular/common/http';
import { Injectable } from '@angular/core';
import { Observable, map } from 'rxjs';
import { environment } from '../../../environments/environment';
import {
  TroubleshootingOption,
  TroubleshootingTree,
  TroubleshootingTreeEdge,
  TroubleshootingTreeNode
} from '../models/troubleshooting-tree.models';

@Injectable({ providedIn: 'root' })
export class TroubleshootingTreeService {
  private readonly apiUrl = environment.apiUrl;

  constructor(private readonly http: HttpClient) {}

  load(): Observable<TroubleshootingTree> {
    return this.http.get<TroubleshootingTree>(`${this.apiUrl}/troubleshooting-tree`);
  }

  createIndex(tree: TroubleshootingTree): TroubleshootingTreeIndex {
    const nodes = new Map(tree.nodes.map((node) => [node.id, node]));
    const outgoing = new Map<string, TroubleshootingTreeEdge[]>();

    for (const edge of tree.edges) {
      const edges = outgoing.get(edge.from) ?? [];
      edges.push(edge);
      outgoing.set(edge.from, edges);
    }

    return { nodes, outgoing };
  }

  getOptions(index: TroubleshootingTreeIndex, nodeId: string): TroubleshootingOption[] {
    return (index.outgoing.get(nodeId) ?? []).map((edge) => ({
      label: edge.label?.trim() || index.nodes.get(edge.to)?.text || 'ادامه',
      targetId: edge.to
    }));
  }

  resolveDisplayNode(index: TroubleshootingTreeIndex, nodeId: string): TroubleshootingTreeNode | null {
    let current = index.nodes.get(nodeId) ?? null;
    const visited = new Set<string>();

    while (current && this.shouldSkipRoutingNode(index, current, visited)) {
      visited.add(current.id);
      const edge = index.outgoing.get(current.id)?.[0];
      current = edge ? (index.nodes.get(edge.to) ?? null) : current;
    }

    return current;
  }

  private shouldSkipRoutingNode(
    index: TroubleshootingTreeIndex,
    node: TroubleshootingTreeNode,
    visited: Set<string>
  ): boolean {
    if (visited.has(node.id)) return false;
    const edges = index.outgoing.get(node.id) ?? [];
    if (edges.length !== 1 || edges[0].label?.trim()) return false;
    return node.text.length <= 36;
  }
}

export interface TroubleshootingTreeIndex {
  nodes: Map<string, TroubleshootingTreeNode>;
  outgoing: Map<string, TroubleshootingTreeEdge[]>;
}
