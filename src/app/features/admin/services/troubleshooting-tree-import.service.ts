import { Injectable } from '@angular/core';
import {
  TroubleshootingTree,
  TroubleshootingTreeEdge,
  TroubleshootingTreeNode
} from '../../../core/models/troubleshooting-tree.models';

export interface TroubleshootingTreeImportResult {
  tree: TroubleshootingTree;
  sourceFormat: string;
  warnings: string[];
}

interface ParsedEndpoint {
  id: string;
  text: string;
}

interface RawTreeRecord {
  id: string;
  text: string;
  parentId: string;
  label: string;
  x: number | null;
  y: number | null;
}

@Injectable({ providedIn: 'root' })
export class TroubleshootingTreeImportService {
  private readonly idPrefix = 'tree';

  async parseFile(file: File): Promise<TroubleshootingTreeImportResult> {
    const extension = file.name.split('.').pop()?.toLocaleLowerCase('en-US') ?? '';

    if (extension === 'vsdx') {
      return this.parseVsdx(file);
    }

    const text = await file.text();
    if (extension === 'json') return this.parseJson(text);
    if (extension === 'csv') return this.parseDelimited(text, ',', 'CSV');
    if (extension === 'tsv') return this.parseDelimited(text, '\t', 'TSV');
    if (extension === 'dot' || extension === 'gv') return this.parseDot(text);
    if (extension === 'mmd' || extension === 'mermaid') return this.parseMermaid(text);
    if (extension === 'puml' || extension === 'plantuml') return this.parsePlantUml(text);
    if (extension === 'xml' || extension === 'drawio') return this.parseXml(text);
    if (extension === 'mdl' || extension === 'cat') return this.parseRationalRoseText(text);

    return this.parseIndentedText(text, 'متن ساختارمند');
  }

  private parseJson(text: string): TroubleshootingTreeImportResult {
    const parsed = JSON.parse(text) as unknown;
    if (this.isTree(parsed)) {
      return {
        tree: this.finishTree(parsed),
        sourceFormat: 'JSON درختواره',
        warnings: []
      };
    }

    if (Array.isArray(parsed)) {
      return this.recordsToTree(parsed.map((item) => this.recordFromUnknown(item)), 'JSON رکوردی');
    }

    if (this.isRecord(parsed)) {
      const nodes = this.arrayValue(parsed, ['nodes', 'vertices', 'items']);
      const edges = this.arrayValue(parsed, ['edges', 'links', 'connections']);
      if (nodes.length) {
        const treeNodes = nodes.map((node, index) => this.nodeFromUnknown(node, index));
        const treeEdges = edges.map((edge) => this.edgeFromUnknown(edge)).filter((edge) => edge.from && edge.to);
        return {
          tree: this.finishTree({
            startNodeId: this.stringValue(parsed, ['startNodeId', 'rootId']) || treeNodes[0]?.id || '',
            introNodeIds: [],
            nodes: treeNodes,
            edges: treeEdges
          }),
          sourceFormat: 'JSON گراف',
          warnings: []
        };
      }
    }

    throw new Error('INVALID_JSON_TREE');
  }

  private parseDelimited(text: string, delimiter: ',' | '\t', sourceFormat: string): TroubleshootingTreeImportResult {
    const lines = text
      .split(/\r?\n/)
      .map((line) => line.trim())
      .filter(Boolean);
    if (!lines.length) throw new Error('EMPTY_TREE_FILE');

    const firstRow = this.parseDelimitedLine(lines[0]!, delimiter);
    const normalizedHeader = firstRow.map((cell) => this.normalizeKey(cell));
    const hasHeader = normalizedHeader.some((cell) =>
      ['id', 'text', 'title', 'parentid', 'parent', 'from', 'to', 'label'].includes(cell)
    );
    const headers = hasHeader ? normalizedHeader : ['id', 'text', 'parentid', 'label', 'x', 'y'];
    const rows = hasHeader ? lines.slice(1) : lines;
    const records: RawTreeRecord[] = [];

    for (const row of rows) {
      const cells = this.parseDelimitedLine(row, delimiter);
      const value = (name: string): string => {
        const index = headers.indexOf(name);
        return index >= 0 ? (cells[index] ?? '').trim() : '';
      };
      const from = value('from');
      const to = value('to');
      if (from && to) {
        records.push({ id: from, text: from, parentId: '', label: '', x: null, y: null });
        records.push({ id: to, text: to, parentId: from, label: value('label'), x: null, y: null });
        continue;
      }
      records.push({
        id: value('id') || value('nodeid') || value('key'),
        text: value('text') || value('title') || value('name') || value('label'),
        parentId: value('parentid') || value('parent') || value('pid'),
        label: value('edgelabel') || value('label'),
        x: this.numberOrNull(value('x')),
        y: this.numberOrNull(value('y'))
      });
    }

    return this.recordsToTree(records, sourceFormat);
  }

  private parseDot(text: string): TroubleshootingTreeImportResult {
    const nodes = new Map<string, TroubleshootingTreeNode>();
    const edges: TroubleshootingTreeEdge[] = [];

    for (const line of text.split(/\r?\n/)) {
      const cleanLine = line.trim().replace(/;$/, '');
      const edgeMatch = cleanLine.match(/^"?([^"\[]+?)"?\s*->\s*"?([^"\[]+?)"?(?:\s*\[(.*?)\])?$/);
      if (!edgeMatch) continue;
      const from = this.parseEndpoint(edgeMatch[1] ?? '');
      const to = this.parseEndpoint(edgeMatch[2] ?? '');
      const label = /label\s*=\s*"([^"]+)"/.exec(edgeMatch[3] ?? '')?.[1] ?? '';
      nodes.set(from.id, { id: from.id, text: from.text });
      nodes.set(to.id, { id: to.id, text: to.text });
      edges.push({ from: from.id, to: to.id, ...(label ? { label } : {}) });
    }

    return this.graphToTree([...nodes.values()], edges, 'Graphviz DOT');
  }

  private parseMermaid(text: string): TroubleshootingTreeImportResult {
    const nodes = new Map<string, TroubleshootingTreeNode>();
    const edges: TroubleshootingTreeEdge[] = [];

    for (const line of text.split(/\r?\n/)) {
      const cleanLine = line.trim().replace(/;$/, '');
      if (!cleanLine || /^(flowchart|graph)\b/i.test(cleanLine)) continue;
      const edgeMatch = cleanLine.match(/^(.+?)\s*(?:-->|---|==>)\s*(?:\|([^|]+)\|\s*)?(.+)$/);
      if (!edgeMatch) continue;
      const from = this.parseEndpoint(edgeMatch[1] ?? '');
      const to = this.parseEndpoint(edgeMatch[3] ?? '');
      const label = (edgeMatch[2] ?? '').trim();
      nodes.set(from.id, { id: from.id, text: from.text });
      nodes.set(to.id, { id: to.id, text: to.text });
      edges.push({ from: from.id, to: to.id, ...(label ? { label } : {}) });
    }

    return this.graphToTree([...nodes.values()], edges, 'Mermaid');
  }

  private parsePlantUml(text: string): TroubleshootingTreeImportResult {
    const nodes = new Map<string, TroubleshootingTreeNode>();
    const edges: TroubleshootingTreeEdge[] = [];

    for (const line of text.split(/\r?\n/)) {
      const cleanLine = line.trim();
      if (!cleanLine || cleanLine.startsWith('@')) continue;
      const edgeMatch = cleanLine.match(/^(.+?)\s+[-.]+[->]+\s+(.+?)(?:\s*:\s*(.+))?$/);
      if (!edgeMatch) continue;
      const from = this.parseEndpoint(edgeMatch[1] ?? '');
      const to = this.parseEndpoint(edgeMatch[2] ?? '');
      const label = (edgeMatch[3] ?? '').trim();
      nodes.set(from.id, { id: from.id, text: from.text });
      nodes.set(to.id, { id: to.id, text: to.text });
      edges.push({ from: from.id, to: to.id, ...(label ? { label } : {}) });
    }

    return this.graphToTree([...nodes.values()], edges, 'PlantUML');
  }

  private parseXml(text: string): TroubleshootingTreeImportResult {
    const document = new DOMParser().parseFromString(text, 'text/xml');
    if (document.querySelector('parsererror')) throw new Error('INVALID_XML_TREE');

    try {
      const drawioResult = this.parseDrawioDocument(document);
      if (drawioResult.tree.nodes.length) return drawioResult;
    } catch {
      // XML files without draw.io graph cells fall back to their text content.
    }

    return this.parseIndentedText(document.documentElement.textContent ?? '', 'XML متنی');
  }

  private async parseVsdx(file: File): Promise<TroubleshootingTreeImportResult> {
    const entries = await this.unzipTextEntries(await file.arrayBuffer());
    const pageEntries = [...entries.entries()].filter(([name]) => /visio\/pages\/page.+\.xml$/i.test(name));
    const nodes = new Map<string, TroubleshootingTreeNode>();
    const edges: TroubleshootingTreeEdge[] = [];
    const warnings: string[] = [];

    for (const [pageName, pageXml] of pageEntries) {
      const document = new DOMParser().parseFromString(pageXml, 'text/xml');
      const pageKey = pageName.replace(/[^a-z0-9]+/gi, '_');
      const shapeTexts = new Map<string, string>();
      const connectorIds = new Set<string>();

      for (const shape of Array.from(document.getElementsByTagName('Shape'))) {
        const shapeId = shape.getAttribute('ID') ?? '';
        if (!shapeId) continue;
        const textValue = this.cleanText(this.getFirstChildText(shape, 'Text'));
        if (this.isVisioConnector(shape, textValue)) {
          connectorIds.add(shapeId);
        }
        if (textValue) {
          shapeTexts.set(shapeId, textValue);
        }
      }

      for (const [shapeId, textValue] of shapeTexts.entries()) {
        if (connectorIds.has(shapeId)) continue;
        const nodeId = `${pageKey}_${shapeId}`;
        nodes.set(nodeId, { id: nodeId, text: textValue });
      }

      const connectGroups = new Map<string, Element[]>();
      for (const connect of Array.from(document.getElementsByTagName('Connect'))) {
        const fromSheet = connect.getAttribute('FromSheet') ?? '';
        if (!fromSheet) continue;
        const group = connectGroups.get(fromSheet) ?? [];
        group.push(connect);
        connectGroups.set(fromSheet, group);
      }

      for (const [connectorId, connects] of connectGroups.entries()) {
        const begin = connects.find((connect) => (connect.getAttribute('FromCell') ?? '').includes('Begin'));
        const end = connects.find((connect) => (connect.getAttribute('FromCell') ?? '').includes('End'));
        const fallbackBegin = connects[0];
        const fallbackEnd = connects[1];
        const fromSheet = begin?.getAttribute('ToSheet') ?? fallbackBegin?.getAttribute('ToSheet') ?? '';
        const toSheet = end?.getAttribute('ToSheet') ?? fallbackEnd?.getAttribute('ToSheet') ?? '';
        const from = `${pageKey}_${fromSheet}`;
        const to = `${pageKey}_${toSheet}`;
        if (!nodes.has(from) || !nodes.has(to) || from === to) continue;
        const label = shapeTexts.get(connectorId) ?? '';
        edges.push({ from, to, ...(label ? { label } : {}) });
      }
    }

    if (!nodes.size) {
      throw new Error('VSDX_TREE_NOT_FOUND');
    }
    if (!edges.length) {
      warnings.push('از فایل Visio نودها استخراج شد، اما ارتباط قابل اتکا پیدا نشد.');
    }

    return {
      ...this.graphToTree([...nodes.values()], edges, 'Visio VSDX'),
      warnings
    };
  }

  private parseDrawioDocument(document: Document): TroubleshootingTreeImportResult {
    const nodes = new Map<string, TroubleshootingTreeNode>();
    const edges: TroubleshootingTreeEdge[] = [];

    for (const cell of Array.from(document.getElementsByTagName('mxCell'))) {
      const id = cell.getAttribute('id') ?? '';
      if (!id) continue;
      if (cell.getAttribute('vertex') === '1') {
        const text = this.decodeHtmlText(cell.getAttribute('value') ?? id);
        const geometry = Array.from(cell.children).find((item) => item.tagName === 'mxGeometry');
        nodes.set(id, {
          id,
          text: text || id,
          x: this.numberOrNull(geometry?.getAttribute('x') ?? ''),
          y: this.numberOrNull(geometry?.getAttribute('y') ?? '')
        });
      }
    }

    for (const cell of Array.from(document.getElementsByTagName('mxCell'))) {
      if (cell.getAttribute('edge') !== '1') continue;
      const from = cell.getAttribute('source') ?? '';
      const to = cell.getAttribute('target') ?? '';
      if (!from || !to) continue;
      const label = this.decodeHtmlText(cell.getAttribute('value') ?? '');
      edges.push({ from, to, ...(label ? { label } : {}) });
    }

    return this.graphToTree([...nodes.values()], edges, 'draw.io XML');
  }

  private parseRationalRoseText(text: string): TroubleshootingTreeImportResult {
    const normalized = text
      .split(/\r?\n/)
      .map((line) => {
        const leading = line.match(/^\s*/)?.[0] ?? '';
        const name = /\bname\s+"([^"]+)"/i.exec(line)?.[1] ?? /\blabel\s+"([^"]+)"/i.exec(line)?.[1];
        if (name) return `${leading}${name}`;
        return line;
      })
      .filter((line) => {
        const trimmed = line.trim();
        return trimmed && !/^[(){}]$/.test(trimmed) && !/^(quid|documentation|stereotype)\b/i.test(trimmed);
      })
      .join('\n');

    return this.parseIndentedText(normalized, 'Rational Rose');
  }

  private parseIndentedText(text: string, sourceFormat: string): TroubleshootingTreeImportResult {
    const nodes: TroubleshootingTreeNode[] = [];
    const edges: TroubleshootingTreeEdge[] = [];
    const stack: Array<{ depth: number; id: string }> = [];

    for (const rawLine of text.split(/\r?\n/)) {
      if (!rawLine.trim()) continue;
      const depth = this.indentationDepth(rawLine);
      const label = rawLine
        .trim()
        .replace(/^[-*•]\s*/, '')
        .replace(/^\d+[.)]\s*/, '')
        .trim();
      if (!label) continue;
      const id = this.uniqueNodeId(label, nodes.length + 1, nodes.map((node) => node.id));
      while (stack.length && stack[stack.length - 1]!.depth >= depth) stack.pop();
      const parent = stack[stack.length - 1];
      nodes.push({ id, text: label });
      if (parent) edges.push({ from: parent.id, to: id });
      stack.push({ depth, id });
    }

    return this.graphToTree(nodes, edges, sourceFormat);
  }

  private recordsToTree(records: RawTreeRecord[], sourceFormat: string): TroubleshootingTreeImportResult {
    const nodes = new Map<string, TroubleshootingTreeNode>();
    const edges: TroubleshootingTreeEdge[] = [];

    for (const record of records) {
      const id = record.id || this.uniqueNodeId(record.text, nodes.size + 1, [...nodes.keys()]);
      const text = record.text || id;
      nodes.set(id, { id, text, x: record.x, y: record.y });
      if (record.parentId) {
        edges.push({ from: record.parentId, to: id, ...(record.label ? { label: record.label } : {}) });
      }
    }

    return this.graphToTree([...nodes.values()], edges, sourceFormat);
  }

  private graphToTree(
    nodes: TroubleshootingTreeNode[],
    edges: TroubleshootingTreeEdge[],
    sourceFormat: string
  ): TroubleshootingTreeImportResult {
    if (!nodes.length) throw new Error('TREE_NODES_NOT_FOUND');
    const tree = this.finishTree({
      startNodeId: this.resolveStartNodeId(nodes, edges),
      introNodeIds: [],
      nodes,
      edges
    });
    return { tree, sourceFormat, warnings: [] };
  }

  private finishTree(tree: TroubleshootingTree): TroubleshootingTree {
    const nodes = new Map<string, TroubleshootingTreeNode>();
    for (const node of tree.nodes) {
      const id = String(node.id).trim();
      const text = this.cleanText(node.text);
      if (!id || !text || nodes.has(id)) continue;
      nodes.set(id, {
        id,
        text,
        x: typeof node.x === 'number' && Number.isFinite(node.x) ? node.x : null,
        y: typeof node.y === 'number' && Number.isFinite(node.y) ? node.y : null
      });
    }

    const edges = tree.edges
      .map((edge) => ({
        from: String(edge.from).trim(),
        to: String(edge.to).trim(),
        label: this.cleanText(edge.label ?? '')
      }))
      .filter((edge) => edge.from && edge.to && nodes.has(edge.from) && nodes.has(edge.to))
      .map((edge) => ({ from: edge.from, to: edge.to, ...(edge.label ? { label: edge.label } : {}) }));

    const finalNodes = [...nodes.values()];
    const startNodeId = nodes.has(tree.startNodeId) ? tree.startNodeId : this.resolveStartNodeId(finalNodes, edges);
    const laidOut = this.ensureLayout({
      startNodeId,
      introNodeIds: (tree.introNodeIds ?? []).filter((id) => nodes.has(id)),
      nodes: finalNodes,
      edges
    });
    return laidOut;
  }

  private ensureLayout(tree: TroubleshootingTree): TroubleshootingTree {
    if (tree.nodes.every((node) => typeof node.x === 'number' && typeof node.y === 'number')) return tree;

    const children = new Map<string, string[]>();
    for (const edge of tree.edges) {
      const list = children.get(edge.from) ?? [];
      list.push(edge.to);
      children.set(edge.from, list);
    }

    const levels = new Map<string, number>();
    const queue: Array<{ id: string; depth: number }> = [{ id: tree.startNodeId, depth: 0 }];
    while (queue.length) {
      const item = queue.shift();
      if (!item || levels.has(item.id)) continue;
      levels.set(item.id, item.depth);
      for (const childId of children.get(item.id) ?? []) {
        queue.push({ id: childId, depth: item.depth + 1 });
      }
    }

    for (const node of tree.nodes) {
      if (!levels.has(node.id)) levels.set(node.id, Math.max(0, levels.size ? Math.max(...levels.values()) : 0));
    }

    const rowsByLevel = new Map<number, number>();
    return {
      ...tree,
      nodes: tree.nodes.map((node) => {
        if (typeof node.x === 'number' && typeof node.y === 'number') return node;
        const depth = levels.get(node.id) ?? 0;
        const row = rowsByLevel.get(depth) ?? 0;
        rowsByLevel.set(depth, row + 1);
        return {
          ...node,
          x: 90 + depth * 240,
          y: 70 + row * 96
        };
      })
    };
  }

  private resolveStartNodeId(nodes: TroubleshootingTreeNode[], edges: TroubleshootingTreeEdge[]): string {
    const incoming = new Set(edges.map((edge) => edge.to));
    return nodes.find((node) => !incoming.has(node.id))?.id ?? nodes[0]?.id ?? '';
  }

  private async unzipTextEntries(buffer: ArrayBuffer): Promise<Map<string, string>> {
    const view = new DataView(buffer);
    const decoder = new TextDecoder('utf-8');
    const entries = new Map<string, string>();
    const eocdOffset = this.findZipEndOfCentralDirectory(view);
    if (eocdOffset < 0) throw new Error('INVALID_VSDX_ZIP');

    const totalEntries = view.getUint16(eocdOffset + 10, true);
    let centralOffset = view.getUint32(eocdOffset + 16, true);

    for (let index = 0; index < totalEntries; index += 1) {
      if (view.getUint32(centralOffset, true) !== 0x02014b50) break;
      const method = view.getUint16(centralOffset + 10, true);
      const compressedSize = view.getUint32(centralOffset + 20, true);
      const fileNameLength = view.getUint16(centralOffset + 28, true);
      const extraLength = view.getUint16(centralOffset + 30, true);
      const commentLength = view.getUint16(centralOffset + 32, true);
      const localHeaderOffset = view.getUint32(centralOffset + 42, true);
      const name = decoder.decode(new Uint8Array(buffer, centralOffset + 46, fileNameLength));
      centralOffset += 46 + fileNameLength + extraLength + commentLength;

      if (!name.toLocaleLowerCase('en-US').endsWith('.xml')) continue;
      if (view.getUint32(localHeaderOffset, true) !== 0x04034b50) continue;
      const localNameLength = view.getUint16(localHeaderOffset + 26, true);
      const localExtraLength = view.getUint16(localHeaderOffset + 28, true);
      const dataOffset = localHeaderOffset + 30 + localNameLength + localExtraLength;
      const compressed = new Uint8Array(buffer, dataOffset, compressedSize);
      const bytes = method === 0 ? compressed : method === 8 ? await this.inflateRaw(compressed) : null;
      if (bytes) entries.set(name, decoder.decode(bytes));
    }

    return entries;
  }

  private findZipEndOfCentralDirectory(view: DataView): number {
    for (let offset = view.byteLength - 22; offset >= 0; offset -= 1) {
      if (view.getUint32(offset, true) === 0x06054b50) return offset;
    }
    return -1;
  }

  private async inflateRaw(bytes: Uint8Array): Promise<Uint8Array> {
    const streamCtor = (globalThis as unknown as {
      DecompressionStream?: new (format: string) => TransformStream<Uint8Array, Uint8Array>;
    }).DecompressionStream;
    if (!streamCtor) throw new Error('BROWSER_ZIP_INFLATE_NOT_SUPPORTED');
    const buffer = bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength) as ArrayBuffer;
    const stream = new Blob([buffer]).stream().pipeThrough(new streamCtor('deflate-raw'));
    return new Uint8Array(await new Response(stream).arrayBuffer());
  }

  private parseDelimitedLine(line: string, delimiter: ',' | '\t'): string[] {
    const cells: string[] = [];
    let current = '';
    let quoted = false;
    for (let index = 0; index < line.length; index += 1) {
      const char = line[index];
      if (char === '"' && line[index + 1] === '"') {
        current += '"';
        index += 1;
        continue;
      }
      if (char === '"') {
        quoted = !quoted;
        continue;
      }
      if (char === delimiter && !quoted) {
        cells.push(current);
        current = '';
        continue;
      }
      current += char ?? '';
    }
    cells.push(current);
    return cells;
  }

  private parseEndpoint(token: string): ParsedEndpoint {
    const cleaned = token.trim().replace(/[;{}]/g, '');
    const rich = cleaned.match(/^([A-Za-z0-9_.:-]+)\s*(?:\["?([^"\]]+)"?\]|\(("?)([^")]+)\3\)|\{([^}]+)\})$/);
    if (rich) {
      const id = rich[1] ?? '';
      const text = rich[2] ?? rich[4] ?? rich[5] ?? id;
      return { id: this.safeId(id), text: this.cleanText(text) };
    }
    const quoted = cleaned.match(/^"([^"]+)"$/)?.[1] ?? cleaned;
    return { id: this.safeId(quoted), text: this.cleanText(quoted) };
  }

  private isVisioConnector(shape: Element, textValue: string): boolean {
    const name = `${shape.getAttribute('NameU') ?? ''} ${shape.getAttribute('Name') ?? ''}`.toLocaleLowerCase(
      'en-US'
    );
    return name.includes('connector') || (!textValue && Array.from(shape.children).some((item) => item.tagName === 'XForm1D'));
  }

  private getFirstChildText(element: Element, tagName: string): string {
    return Array.from(element.children).find((child) => child.tagName === tagName)?.textContent ?? '';
  }

  private isTree(value: unknown): value is TroubleshootingTree {
    if (!this.isRecord(value)) return false;
    return Array.isArray(value['nodes']) && Array.isArray(value['edges']) && typeof value['startNodeId'] === 'string';
  }

  private isRecord(value: unknown): value is Record<string, unknown> {
    return typeof value === 'object' && value !== null && !Array.isArray(value);
  }

  private arrayValue(record: Record<string, unknown>, keys: string[]): unknown[] {
    for (const key of keys) {
      const value = record[key];
      if (Array.isArray(value)) return value;
    }
    return [];
  }

  private recordFromUnknown(value: unknown): RawTreeRecord {
    if (!this.isRecord(value)) return { id: '', text: String(value ?? ''), parentId: '', label: '', x: null, y: null };
    return {
      id: this.stringValue(value, ['id', 'nodeId', 'key']),
      text: this.stringValue(value, ['text', 'title', 'name', 'label']),
      parentId: this.stringValue(value, ['parentId', 'parent', 'pid']),
      label: this.stringValue(value, ['edgeLabel', 'label']),
      x: this.numberOrNull(value['x']),
      y: this.numberOrNull(value['y'])
    };
  }

  private nodeFromUnknown(value: unknown, index: number): TroubleshootingTreeNode {
    if (!this.isRecord(value)) {
      const text = String(value ?? '').trim();
      return { id: this.uniqueNodeId(text, index + 1, []), text };
    }
    const text = this.stringValue(value, ['text', 'title', 'name', 'label']);
    return {
      id: this.stringValue(value, ['id', 'nodeId', 'key']) || this.uniqueNodeId(text, index + 1, []),
      text: text || this.stringValue(value, ['id', 'nodeId', 'key']),
      x: this.numberOrNull(value['x']),
      y: this.numberOrNull(value['y'])
    };
  }

  private edgeFromUnknown(value: unknown): TroubleshootingTreeEdge {
    if (!this.isRecord(value)) return { from: '', to: '' };
    return {
      from: this.stringValue(value, ['from', 'source', 'parentId', 'parent']),
      to: this.stringValue(value, ['to', 'target', 'childId', 'child']),
      label: this.stringValue(value, ['label', 'text', 'title'])
    };
  }

  private stringValue(record: Record<string, unknown>, keys: string[]): string {
    for (const key of keys) {
      const value = record[key];
      if (typeof value === 'string' || typeof value === 'number') return String(value).trim();
    }
    return '';
  }

  private numberOrNull(value: unknown): number | null {
    if (typeof value === 'number' && Number.isFinite(value)) return value;
    if (typeof value !== 'string' || !value.trim()) return null;
    const number = Number(value);
    return Number.isFinite(number) ? number : null;
  }

  private decodeHtmlText(value: string): string {
    const document = new DOMParser().parseFromString(value, 'text/html');
    return this.cleanText(document.body.textContent || value.replace(/<[^>]+>/g, ''));
  }

  private cleanText(value: string): string {
    return value.replace(/\s+/g, ' ').trim();
  }

  private normalizeKey(value: string): string {
    return value.trim().replace(/[\s_-]+/g, '').toLocaleLowerCase('en-US');
  }

  private indentationDepth(line: string): number {
    const leading = line.match(/^\s*/)?.[0] ?? '';
    return leading.replace(/\t/g, '  ').length;
  }

  private uniqueNodeId(text: string, fallbackIndex: number, existingIds: string[]): string {
    const base = this.safeId(text) || `${this.idPrefix}_${fallbackIndex}`;
    const existing = new Set(existingIds);
    if (!existing.has(base)) return base;
    let index = 2;
    while (existing.has(`${base}_${index}`)) index += 1;
    return `${base}_${index}`;
  }

  private safeId(value: string): string {
    const normalized = value
      .trim()
      .replace(/["'`]/g, '')
      .replace(/[^\p{L}\p{N}]+/gu, '_')
      .replace(/^_+|_+$/g, '')
      .slice(0, 70);
    return normalized || `${this.idPrefix}_${Math.random().toString(36).slice(2, 8)}`;
  }
}
