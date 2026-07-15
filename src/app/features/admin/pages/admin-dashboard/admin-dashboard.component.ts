import { CommonModule } from '@angular/common';
import {
  ChangeDetectionStrategy,
  ChangeDetectorRef,
  Component,
  ElementRef,
  OnInit,
  ViewChild
} from '@angular/core';
import { FormsModule } from '@angular/forms';
import { Router, RouterLink } from '@angular/router';
import { DiagnosticCaseRecord } from '../../../../core/models/diagnostic.models';
import { ConversationRecord, FaqRecord } from '../../../../core/models/faq.models';
import {
  TroubleshootingTree,
  TroubleshootingTreeEdge,
  TroubleshootingTreeNode
} from '../../../../core/models/troubleshooting-tree.models';
import {
  ApiService,
  ExternalServiceExecutionResult,
  ExternalServiceMethod,
  ExternalServicePayload,
  ExternalServiceRecord,
  FaqPayload,
  TicketRequestTypeMapping,
  TicketServiceSettings,
  TicketServiceSettingsPayload
} from '../../../../core/services/api.service';
import { AuthService } from '../../../../core/services/auth.service';
import { ExcelReaderService } from '../../../../core/services/excel-reader.service';
import { ErrorMessageService } from '../../../../core/services/error-message.service';
import { NotificationService } from '../../../../core/services/notification.service';
import { ThemeService } from '../../../../core/services/theme.service';
import { WordReaderService } from '../../../../core/services/word-reader.service';
import { ThemeToggleComponent } from '../../../../shared/components/theme-toggle/theme-toggle.component';
import { BrandLogoComponent } from '../../../../shared/components/brand-logo/brand-logo.component';
import { FaqImportMapperService } from '../../services/faq-import-mapper.service';
import { TroubleshootingTreeImportService } from '../../services/troubleshooting-tree-import.service';

type PendingConfirmation =
  | { type: 'delete'; faq: FaqRecord }
  | { type: 'delete-service'; service: ExternalServiceRecord }
  | { type: 'bulk-delete'; ids: number[] }
  | { type: 'import'; payload: FaqPayload[] };

type AdminTab = 'faqs' | 'reports' | 'performance' | 'tree' | 'settings' | 'services';
type TreeExportFormat = 'json' | 'csv' | 'mermaid';
type TreeWorkspaceMode = 'demo' | 'final';
type TreeCanvasTool = 'select' | 'add-node' | 'connect';

interface PerformanceMetric {
  label: string;
  value: string;
  hint: string;
  tone: 'primary' | 'success' | 'warning' | 'danger' | 'neutral';
}

interface PerformanceTrendPoint {
  label: string;
  conversations: number;
  diagnostics: number;
  conversationPercent: number;
  diagnosticPercent: number;
}

interface PerformanceShareItem {
  label: string;
  count: number;
  percent: number;
}

interface PerformanceFunnelStep {
  label: string;
  count: number;
  percent: number;
}

interface TreeEdgeView extends TroubleshootingTreeEdge {
  index: number;
  targetText: string;
}

interface TreePreviewNode extends TroubleshootingTreeNode {
  cx: number;
  cy: number;
  isSelected: boolean;
  isStart: boolean;
  outgoingCount: number;
}

interface TreePreviewEdge extends TroubleshootingTreeEdge {
  x1: number;
  y1: number;
  x2: number;
  y2: number;
  labelX: number;
  labelY: number;
}

@Component({
  selector: 'app-admin-dashboard',
  standalone: true,
  imports: [CommonModule, FormsModule, RouterLink, ThemeToggleComponent, BrandLogoComponent],
  templateUrl: './admin-dashboard.component.html',
  styleUrl: './admin-dashboard.component.scss',
  changeDetection: ChangeDetectionStrategy.OnPush
})
export class AdminDashboardComponent implements OnInit {
  @ViewChild('fileInput') fileInput?: ElementRef<HTMLInputElement>;
  @ViewChild('treeFileInput') treeFileInput?: ElementRef<HTMLInputElement>;
  @ViewChild('treeCanvas') treeCanvas?: ElementRef<HTMLDivElement>;

  faqs: FaqRecord[] = [];
  conversations: ConversationRecord[] = [];
  diagnosticCases: DiagnosticCaseRecord[] = [];
  externalServices: ExternalServiceRecord[] = [];
  troubleshootingTree: TroubleshootingTree | null = null;
  activeTab: AdminTab = 'faqs';
  editingId: number | null = null;
  editingServiceId: number | null = null;
  detailFaq: FaqRecord | null = null;
  form: FaqPayload = this.emptyForm();
  editForm: FaqPayload = this.emptyForm();
  serviceForm: ExternalServicePayload = this.emptyExternalServiceForm();
  serviceTestResult: ExternalServiceExecutionResult | null = null;
  serviceTestingId: number | null = null;
  ticketServiceSettings: TicketServiceSettings | null = null;
  ticketServiceForm: TicketServiceSettingsPayload = this.emptyTicketServiceForm();
  requestTypeMappingsText = '';
  loading = true;
  conversationsLoaded = false;
  conversationsLoading = false;
  diagnosticCasesLoaded = false;
  diagnosticCasesLoading = false;
  externalServicesLoaded = false;
  externalServicesLoading = false;
  ticketServiceSettingsLoaded = false;
  ticketServiceSettingsLoading = false;
  saving = false;
  settingsSaving = false;
  searchTerm = '';
  reportSearchTerm = '';
  categoryFilter = '';
  currentPage = 1;
  pageSize = 10;
  readonly pageSizeOptions = [10, 20, 50];
  readonly reportListLimit = 120;
  readonly serviceMethods: ExternalServiceMethod[] = ['GET', 'POST', 'PUT', 'PATCH', 'DELETE'];
  readonly treeAcceptedFormats =
    '.json,.csv,.tsv,.txt,.dot,.gv,.mmd,.mermaid,.puml,.plantuml,.xml,.drawio,.mdl,.cat,.vsdx';
  pendingConfirmation: PendingConfirmation | null = null;
  selectedFaqIds = new Set<number>();
  treeSelectedNodeId = '';
  treeNodeTextDraft = '';
  treeNewChildText = '';
  treeLinkTargetId = '';
  treeLinkLabel = '';
  treeSearchTerm = '';
  treeCurrentPage = 1;
  treePageSize = 25;
  treeExportFormat: TreeExportFormat = 'json';
  treeImportSource = '';
  treeImportFileName = '';
  treeImportWarnings: string[] = [];
  treeWorkspaceOpen = false;
  treeCloseConfirmOpen = false;
  treeWorkspaceMode: TreeWorkspaceMode = 'demo';
  treeDirty = false;
  treeProjectKey = 'default';
  treeCanvasTool: TreeCanvasTool = 'select';
  treeDraftNodeText = 'نود جدید';
  treeConnectionSourceId = '';
  treeManualLayout = false;
  treeLoaded = false;
  treeLoading = false;
  treeSaving = false;
  treeOutgoingEdges: TreeEdgeView[] = [];
  treeIncomingEdges: TreeEdgeView[] = [];
  treePreviewNodes: TreePreviewNode[] = [];
  treePreviewEdges: TreePreviewEdge[] = [];
  treePreviewTruncatedCount = 0;
  treeCanvasWidth = 900;
  treeCanvasHeight = 620;
  treeViewBox = '0 0 900 620';
  treeZoom = 1;
  private treePreviewOriginX = 0;
  private treePreviewOriginY = 0;
  private treeDragState: { nodeId: string; offsetX: number; offsetY: number } | null = null;
  readonly treePageSizeOptions = [25, 50, 100];
  readonly treeExportFormats: Array<{ value: TreeExportFormat; label: string }> = [
    { value: 'json', label: 'JSON کامل' },
    { value: 'csv', label: 'CSV قابل بررسی' },
    { value: 'mermaid', label: 'Mermaid گراف' }
  ];
  private treeSavedSnapshot: TroubleshootingTree | null = null;

  get treeNodes(): TroubleshootingTreeNode[] {
    return this.troubleshootingTree?.nodes ?? [];
  }

  get treeEdges(): TroubleshootingTreeEdge[] {
    return this.troubleshootingTree?.edges ?? [];
  }

  get treeNodeCount(): number {
    return this.treeNodes.length;
  }

  get treeEdgeCount(): number {
    return this.treeEdges.length;
  }

  get selectedTreeNode(): TroubleshootingTreeNode | null {
    return this.treeNodes.find((node) => node.id === this.treeSelectedNodeId) ?? null;
  }

  get selectedTreeNodeIndex(): number {
    return this.treeNodes.findIndex((node) => node.id === this.treeSelectedNodeId);
  }

  get treeZoomPercent(): string {
    return `${Math.round(this.treeZoom * 100).toLocaleString('fa-IR')}٪`;
  }

  get filteredTreeNodes(): TroubleshootingTreeNode[] {
    const query = this.treeSearchTerm.trim().toLocaleLowerCase('fa');
    return query
      ? this.treeNodes.filter((node) => `${node.id} ${node.text}`.toLocaleLowerCase('fa').includes(query))
      : this.treeNodes;
  }

  get filteredTreeHiddenCount(): number {
    return 0;
  }

  get treeTotalPages(): number {
    return Math.max(1, Math.ceil(this.filteredTreeNodes.length / this.treePageSize));
  }

  get treePageStart(): number {
    return this.filteredTreeNodes.length ? (this.treeCurrentPage - 1) * this.treePageSize + 1 : 0;
  }

  get treePageEnd(): number {
    return Math.min(this.treeCurrentPage * this.treePageSize, this.filteredTreeNodes.length);
  }

  get paginatedTreeNodes(): TroubleshootingTreeNode[] {
    const start = (this.treeCurrentPage - 1) * this.treePageSize;
    return this.filteredTreeNodes.slice(start, start + this.treePageSize);
  }

  get availableTreeTargets(): TroubleshootingTreeNode[] {
    return this.treeNodes.filter((node) => node.id !== this.treeSelectedNodeId);
  }

  get treeWorkspaceModeLabel(): string {
    return this.treeWorkspaceMode === 'final' ? 'نهایی' : 'دمو';
  }

  get treeProjectLabel(): string {
    return this.treeProjectKey.trim() || 'default';
  }

  get isTreeDragging(): boolean {
    return Boolean(this.treeDragState);
  }

  private rebuildTreeOutgoingEdges(): void {
    const nodesById = new Map(this.treeNodes.map((node) => [node.id, node.text]));
    this.treeOutgoingEdges = this.treeEdges
      .map((edge, index) => ({
        ...edge,
        index,
        targetText: nodesById.get(edge.to) ?? edge.to
      }))
      .filter((edge) => edge.from === this.treeSelectedNodeId);
    this.treeIncomingEdges = this.treeEdges
      .map((edge, index) => ({
        ...edge,
        index,
        targetText: nodesById.get(edge.from) ?? edge.from
      }))
      .filter((edge) => edge.to === this.treeSelectedNodeId);
  }

  private rebuildTreePreview(): void {
    const nodes = this.treeNodes;
    if (!nodes.length) {
      this.treePreviewNodes = [];
      this.treePreviewEdges = [];
      this.treePreviewTruncatedCount = 0;
      this.treeCanvasWidth = 900;
      this.treeCanvasHeight = 620;
      this.treeViewBox = '0 0 900 620';
      return;
    }

    const selectedNode = this.selectedTreeNode;
    const startNode = this.troubleshootingTree
      ? nodes.find((node) => node.id === this.troubleshootingTree?.startNodeId)
      : null;
    const previewNodeMap = new Map<string, TroubleshootingTreeNode>();
    const visibleNodes = this.treeWorkspaceOpen ? nodes : nodes.slice(0, 48);
    for (const node of visibleNodes) {
      previewNodeMap.set(node.id, node);
    }
    if (startNode) previewNodeMap.set(startNode.id, startNode);
    if (selectedNode) previewNodeMap.set(selectedNode.id, selectedNode);

    const previewNodes = [...previewNodeMap.values()];
    const previewNodeIds = new Set(previewNodes.map((node) => node.id));
    const shouldUseEditorLayout =
      (this.treeWorkspaceOpen && !this.treeManualLayout) ||
      previewNodes.some(
        (node) => typeof node.x !== 'number' || typeof node.y !== 'number'
      );
    const fallback = shouldUseEditorLayout
      ? this.buildTreeFallbackPositions({
          startNodeId: this.troubleshootingTree?.startNodeId ?? previewNodes[0]!.id,
          introNodeIds: this.troubleshootingTree?.introNodeIds ?? [],
          nodes: previewNodes,
          edges: this.treeEdges.filter((edge) => previewNodeIds.has(edge.from) && previewNodeIds.has(edge.to))
        })
      : new Map<string, { x: number; y: number }>();
    const needsFallback = previewNodes.some(
      (node) => typeof node.x !== 'number' || typeof node.y !== 'number'
    );
    const outgoingCounts = new Map<string, number>();
    for (const edge of this.treeEdges) {
      outgoingCounts.set(edge.from, (outgoingCounts.get(edge.from) ?? 0) + 1);
    }
    const rawPositions = previewNodes.map((node, index) => {
      const fallbackPosition = fallback.get(node.id) ?? { x: index * 220, y: 0 };
      const baseX = shouldUseEditorLayout || needsFallback ? fallbackPosition.x : node.x ?? fallbackPosition.x;
      const baseY = shouldUseEditorLayout || needsFallback ? fallbackPosition.y : node.y ?? fallbackPosition.y;
      return {
        node,
        x: baseX,
        y: baseY
      };
    });
    const minX = Math.min(...rawPositions.map((item) => item.x));
    const maxX = Math.max(...rawPositions.map((item) => item.x));
    const minY = Math.min(...rawPositions.map((item) => item.y));
    const maxY = Math.max(...rawPositions.map((item) => item.y));
    const paddingX = this.treeWorkspaceOpen ? 220 : 140;
    const paddingY = this.treeWorkspaceOpen ? 150 : 110;
    this.treeCanvasWidth = Math.ceil(Math.max(this.treeWorkspaceOpen ? 1240 : 900, maxX - minX + paddingX * 2));
    this.treeCanvasHeight = Math.ceil(Math.max(this.treeWorkspaceOpen ? 820 : 620, maxY - minY + paddingY * 2));
    this.treeViewBox = `0 0 ${this.treeCanvasWidth} ${this.treeCanvasHeight}`;
    this.treePreviewOriginX = minX - paddingX;
    this.treePreviewOriginY = minY - paddingY;

    this.treePreviewNodes = rawPositions.map(({ node, x, y }) => ({
      ...node,
      cx: paddingX + x - minX,
      cy: paddingY + y - minY,
      isSelected: node.id === this.treeSelectedNodeId,
      isStart: node.id === this.troubleshootingTree?.startNodeId,
      outgoingCount: outgoingCounts.get(node.id) ?? 0
    }));

    const nodePositions = new Map(this.treePreviewNodes.map((node) => [node.id, node]));
    this.treePreviewEdges = this.treeEdges
      .map((edge) => {
        const from = nodePositions.get(edge.from);
        const to = nodePositions.get(edge.to);
        if (!from || !to) return null;
        return {
          ...edge,
          x1: from.cx,
          y1: from.cy,
          x2: to.cx,
          y2: to.cy,
          labelX: (from.cx + to.cx) / 2,
          labelY: (from.cy + to.cy) / 2
        };
      })
      .filter((edge): edge is TreePreviewEdge => Boolean(edge));
    this.treePreviewTruncatedCount = Math.max(0, nodes.length - previewNodeMap.size);
  }

  get activeServiceCount(): number {
    return this.externalServices.filter((service) => service.isActive).length;
  }

  get matchedConversationCount(): number {
    return this.conversations.filter((item) => item.matchedFaqId !== null).length;
  }

  get faqCoverageRate(): number {
    return this.calculateRate(this.matchedConversationCount, this.conversations.length);
  }

  get ticketCreationRate(): number {
    return this.calculateRate(this.diagnosticCases.length, Math.max(this.conversations.length, 1));
  }

  get analyzedDiagnosticCount(): number {
    return this.diagnosticCases.filter((item) => item.status !== 'draft' || item.analyzedAt).length;
  }

  get highSeverityCount(): number {
    return this.diagnosticCases.filter((item) => item.severity === 'high').length;
  }

  get externalTicketAttemptCount(): number {
    return this.diagnosticCases.filter(
      (item) => item.externalTicketStatus && item.externalTicketStatus !== 'not_configured'
    ).length;
  }

  get externalTicketSubmittedCount(): number {
    return this.diagnosticCases.filter((item) => item.externalTicketStatus === 'submitted').length;
  }

  get externalTicketFailedCount(): number {
    return this.diagnosticCases.filter((item) => item.externalTicketStatus === 'failed').length;
  }

  get externalTicketSuccessRate(): number {
    return this.calculateRate(this.externalTicketSubmittedCount, this.externalTicketAttemptCount);
  }

  get knowledgeCategoryCount(): number {
    return this.categories.length;
  }

  get ratedDiagnosticCases(): DiagnosticCaseRecord[] {
    return this.diagnosticCases.filter((item) => this.isRatedDiagnostic(item));
  }

  get averageSupportRating(): number {
    if (!this.ratedDiagnosticCases.length) return 0;
    const sum = this.ratedDiagnosticCases.reduce((total, item) => total + (item.rating ?? 0), 0);
    return sum / this.ratedDiagnosticCases.length;
  }

  get ratingDistribution(): PerformanceShareItem[] {
    const counts = [5, 4, 3, 2, 1].map((score) => ({
      label: `${score.toLocaleString('fa-IR')} ستاره`,
      count: this.ratedDiagnosticCases.filter((item) => item.rating === score).length
    }));
    const maxCount = Math.max(1, ...counts.map((item) => item.count));
    return counts.map((item) => ({
      ...item,
      percent: this.calculateRate(item.count, maxCount)
    }));
  }

  get latestRatedDiagnostics(): DiagnosticCaseRecord[] {
    return [...this.ratedDiagnosticCases]
      .sort((a, b) => (b.ratingSubmittedAt ?? b.createdAt).localeCompare(a.ratingSubmittedAt ?? a.createdAt))
      .slice(0, 4);
  }

  get performanceMetrics(): PerformanceMetric[] {
    return [
      {
        label: 'کل گفت‌وگوها',
        value: this.conversations.length.toLocaleString('fa-IR'),
        hint: `${this.uniqueUserCount.toLocaleString('fa-IR')} کاربر درگیر`,
        tone: 'primary'
      },
      {
        label: 'پوشش FAQ',
        value: this.formatPercent(this.faqCoverageRate),
        hint: `${this.matchedConversationCount.toLocaleString('fa-IR')} پاسخ از FAQ`,
        tone: this.faqCoverageRate >= 70 ? 'success' : this.faqCoverageRate >= 40 ? 'warning' : 'danger'
      },
      {
        label: 'پرونده‌های پشتیبانی',
        value: this.diagnosticCases.length.toLocaleString('fa-IR'),
        hint: `${this.formatPercent(this.ticketCreationRate)} تبدیل، ${this.highSeverityCount.toLocaleString('fa-IR')} مورد با اهمیت بالا`,
        tone: this.highSeverityCount ? 'warning' : 'neutral'
      },
      {
        label: 'موفقیت ارسال سهند',
        value: this.externalTicketAttemptCount
          ? this.formatPercent(this.externalTicketSuccessRate)
          : 'بدون ارسال',
        hint: `${this.externalTicketSubmittedCount.toLocaleString('fa-IR')} موفق، ${this.externalTicketFailedCount.toLocaleString('fa-IR')} ناموفق`,
        tone: this.externalTicketFailedCount
          ? 'danger'
          : this.externalTicketSubmittedCount
            ? 'success'
            : 'neutral'
      },
      {
        label: 'سرویس‌های فعال',
        value: this.activeServiceCount.toLocaleString('fa-IR'),
        hint: `از ${this.externalServices.length.toLocaleString('fa-IR')} سرویس تعریف‌شده`,
        tone: this.activeServiceCount ? 'success' : 'warning'
      },
      {
        label: 'دسته‌های دانش',
        value: this.knowledgeCategoryCount.toLocaleString('fa-IR'),
        hint: `${this.faqs.length.toLocaleString('fa-IR')} FAQ ثبت‌شده`,
        tone: this.knowledgeCategoryCount ? 'primary' : 'warning'
      },
      {
        label: 'رضایت کاربران',
        value: this.ratedDiagnosticCases.length
          ? this.formatRating(this.averageSupportRating)
          : 'بدون امتیاز',
        hint: `${this.ratedDiagnosticCases.length.toLocaleString('fa-IR')} ارزیابی ثبت‌شده`,
        tone: this.ratedDiagnosticCases.length
          ? this.averageSupportRating >= 4
            ? 'success'
            : this.averageSupportRating >= 3
              ? 'warning'
              : 'danger'
          : 'neutral'
      }
    ];
  }

  get supportFunnel(): PerformanceFunnelStep[] {
    const base = Math.max(this.conversations.length, this.diagnosticCases.length, 1);
    return [
      {
        label: 'درخواست ثبت‌شده',
        count: this.conversations.length,
        percent: this.calculateRate(this.conversations.length, base)
      },
      {
        label: 'پاسخ از FAQ',
        count: this.matchedConversationCount,
        percent: this.calculateRate(this.matchedConversationCount, base)
      },
      {
        label: 'ایجاد پرونده',
        count: this.diagnosticCases.length,
        percent: this.calculateRate(this.diagnosticCases.length, base)
      },
      {
        label: 'تحلیل‌شده',
        count: this.analyzedDiagnosticCount,
        percent: this.calculateRate(this.analyzedDiagnosticCount, base)
      },
      {
        label: 'ارسال موفق سهند',
        count: this.externalTicketSubmittedCount,
        percent: this.calculateRate(this.externalTicketSubmittedCount, base)
      }
    ];
  }

  get performanceTrend(): PerformanceTrendPoint[] {
    const days = this.getLastDays(7);
    const maxValue = Math.max(
      1,
      ...days.map(
        (day) => this.countByDay(this.conversations, day.key) + this.countByDay(this.diagnosticCases, day.key)
      )
    );

    return days.map((day) => {
      const conversations = this.countByDay(this.conversations, day.key);
      const diagnostics = this.countByDay(this.diagnosticCases, day.key);
      return {
        label: day.label,
        conversations,
        diagnostics,
        conversationPercent: this.calculateRate(conversations, maxValue),
        diagnosticPercent: this.calculateRate(diagnostics, maxValue)
      };
    });
  }

  get faqCategoryShares(): PerformanceShareItem[] {
    const rows = new Map<string, number>();
    this.faqs.forEach((faq) => {
      const label = faq.category.trim() || 'عمومی';
      rows.set(label, (rows.get(label) ?? 0) + 1);
    });
    const maxCount = Math.max(1, ...rows.values());
    return [...rows.entries()]
      .map(([label, count]) => ({ label, count, percent: this.calculateRate(count, maxCount) }))
      .sort((a, b) => b.count - a.count)
      .slice(0, 6);
  }

  get performanceAlerts(): string[] {
    const alerts: string[] = [];
    if (this.conversations.length && this.faqCoverageRate < 40) {
      alerts.push('پوشش FAQ پایین است؛ پرسش‌های پرتکرار گزارش کاربران باید به پایگاه دانش اضافه شوند.');
    }
    if (this.externalTicketFailedCount) {
      alerts.push('ارسال بخشی از تیکت‌ها به سهند ناموفق بوده؛ اتصال سرویس و credential بررسی شود.');
    }
    if (this.highSeverityCount) {
      alerts.push('پرونده‌های با اهمیت بالا وجود دارد؛ اولویت پیگیری پشتیبان باید بازبینی شود.');
    }
    if (!this.activeServiceCount) {
      alerts.push('هیچ سرویس فعالی برای کاربر تعریف نشده؛ تب سرویس‌ها را بررسی کنید.');
    }
    if (!this.faqs.length) {
      alerts.push('پایگاه دانش خالی است؛ بدون FAQ نرخ حل خودکار قابل ارزیابی نیست.');
    }
    if (this.ratedDiagnosticCases.length && this.averageSupportRating < 3) {
      alerts.push('میانگین امتیاز کاربران پایین است؛ کیفیت پاسخ نهایی و زمان پیگیری بازبینی شود.');
    }
    return alerts;
  }

  get uniqueUserCount(): number {
    return new Set(this.conversations.map((item) => item.username)).size;
  }

  get categories(): string[] {
    return [...new Set(this.faqs.map((faq) => faq.category).filter(Boolean))].sort();
  }

  get filteredFaqs(): FaqRecord[] {
    const query = this.searchTerm.trim().toLocaleLowerCase('fa');
    return this.faqs.filter((faq) => {
      const matchesCategory = !this.categoryFilter || faq.category === this.categoryFilter;
      const searchable = `${faq.question} ${faq.answer} ${faq.category} ${faq.keywords}`.toLocaleLowerCase(
        'fa'
      );
      return matchesCategory && (!query || searchable.includes(query));
    });
  }

  get filteredConversations(): ConversationRecord[] {
    const query = this.reportSearchTerm.trim().toLocaleLowerCase('fa');
    if (!query) return this.conversations;
    return this.conversations.filter((item) =>
      `${item.userFullName} ${item.username} ${item.question} ${item.answer}`
        .toLocaleLowerCase('fa')
        .includes(query)
    );
  }

  get displayedConversations(): ConversationRecord[] {
    return this.filteredConversations.slice(0, this.reportListLimit);
  }

  get hiddenConversationCount(): number {
    return Math.max(0, this.filteredConversations.length - this.reportListLimit);
  }

  get totalPages(): number {
    return Math.max(1, Math.ceil(this.filteredFaqs.length / this.pageSize));
  }

  get paginatedFaqs(): FaqRecord[] {
    const start = (this.currentPage - 1) * this.pageSize;
    return this.filteredFaqs.slice(start, start + this.pageSize);
  }

  get paginationStart(): number {
    return this.filteredFaqs.length ? (this.currentPage - 1) * this.pageSize + 1 : 0;
  }

  get paginationEnd(): number {
    return Math.min(this.currentPage * this.pageSize, this.filteredFaqs.length);
  }

  getFaqDescription(faq: FaqRecord): string {
    return this.extractAnswerSection(faq.answer, /توضیحات/) || faq.answer;
  }

  getFaqSolution(faq: FaqRecord): string {
    return this.extractAnswerSection(faq.answer, /راه\s*حل/);
  }

  get selectedCount(): number {
    return this.selectedFaqIds.size;
  }

  get allFilteredSelected(): boolean {
    return (
      Boolean(this.filteredFaqs.length) && this.filteredFaqs.every((faq) => this.selectedFaqIds.has(faq.id))
    );
  }

  get someFilteredSelected(): boolean {
    return this.filteredFaqs.some((faq) => this.selectedFaqIds.has(faq.id));
  }

  get confirmationTitle(): string {
    if (this.pendingConfirmation?.type === 'delete') return 'حذف FAQ';
    if (this.pendingConfirmation?.type === 'delete-service') return 'حذف سرویس';
    if (this.pendingConfirmation?.type === 'bulk-delete') return 'حذف گروهی FAQ';
    return 'جایگزینی پایگاه دانش';
  }

  get confirmationText(): string {
    if (this.pendingConfirmation?.type === 'delete') {
      return `FAQ «${this.pendingConfirmation.faq.question}» برای همیشه حذف شود؟`;
    }
    if (this.pendingConfirmation?.type === 'delete-service') {
      return `سرویس «${this.pendingConfirmation.service.title}» از کاتالوگ سرویس‌ها حذف شود؟`;
    }
    if (this.pendingConfirmation?.type === 'bulk-delete') {
      const count = this.pendingConfirmation.ids.length;
      return `${count.toLocaleString('fa-IR')} FAQ انتخاب‌شده برای همیشه حذف شوند؟`;
    }
    const count = this.pendingConfirmation?.payload.length ?? 0;
    return `${count.toLocaleString('fa-IR')} ردیف جایگزین FAQهای فعلی شوند؟`;
  }

  constructor(
    readonly auth: AuthService,
    readonly theme: ThemeService,
    private readonly api: ApiService,
    private readonly excelReader: ExcelReaderService,
    private readonly wordReader: WordReaderService,
    private readonly faqImportMapper: FaqImportMapperService,
    private readonly treeImport: TroubleshootingTreeImportService,
    private readonly errorMessages: ErrorMessageService,
    private readonly notifications: NotificationService,
    private readonly router: Router,
    private readonly changeDetector: ChangeDetectorRef
  ) {}

  ngOnInit(): void {
    this.refresh();
  }

  setActiveTab(tab: AdminTab): void {
    this.activeTab = tab;
    this.loadActiveTabData();
  }

  refresh(showNotification = false): void {
    this.loadFaqs(showNotification, true);
    if (this.activeTab !== 'faqs') {
      this.loadActiveTabData(true);
    }
  }

  private loadActiveTabData(force = false): void {
    if (this.activeTab === 'reports') {
      this.loadConversations(force);
      return;
    }
    if (this.activeTab === 'performance') {
      this.loadPerformanceData(force);
      return;
    }
    if (this.activeTab === 'tree') {
      this.loadTroubleshootingTree(force);
      return;
    }
    if (this.activeTab === 'settings') {
      this.loadTicketServiceSettings(force);
      return;
    }
    if (this.activeTab === 'services') {
      this.loadExternalServices(force);
    }
  }

  private loadPerformanceData(force = false): void {
    this.loadConversations(force);
    this.loadDiagnosticCases(force);
    this.loadExternalServices(force);
  }

  private loadConversations(force = false): void {
    if (this.conversationsLoading || (this.conversationsLoaded && !force)) return;
    this.conversationsLoading = true;
    this.api.getConversations().subscribe({
      next: (conversations) => {
        this.conversations = conversations;
        this.conversationsLoaded = true;
        this.conversationsLoading = false;
        this.changeDetector.markForCheck();
      },
      error: (error: unknown) => {
        this.conversationsLoading = false;
        this.showError(error, 'دریافت گزارش‌های کاربران ممکن نبود.');
      }
    });
  }

  private loadDiagnosticCases(force = false): void {
    if (this.diagnosticCasesLoading || (this.diagnosticCasesLoaded && !force)) return;
    this.diagnosticCasesLoading = true;
    this.api.getDiagnosticCases().subscribe({
      next: (diagnosticCases) => {
        this.diagnosticCases = diagnosticCases;
        this.diagnosticCasesLoaded = true;
        this.diagnosticCasesLoading = false;
        this.changeDetector.markForCheck();
      },
      error: (error: unknown) => {
        this.diagnosticCasesLoading = false;
        this.showError(error, 'دریافت پرونده‌های پشتیبانی ممکن نبود.');
      }
    });
  }

  private loadTicketServiceSettings(force = false): void {
    if (this.ticketServiceSettingsLoading || (this.ticketServiceSettingsLoaded && !force)) return;
    this.ticketServiceSettingsLoading = true;
    this.api.getTicketServiceSettings().subscribe({
      next: (settings) => {
        this.applyTicketServiceSettings(settings);
        this.ticketServiceSettingsLoaded = true;
        this.ticketServiceSettingsLoading = false;
        this.changeDetector.markForCheck();
      },
      error: (error: unknown) => {
        this.ticketServiceSettingsLoading = false;
        this.showError(error, 'دریافت تنظیمات سرویس ثبت تیکت ممکن نبود.');
      }
    });
  }

  loadTroubleshootingTree(force = false): void {
    if (this.treeLoading || (this.treeLoaded && !force)) return;
    this.treeLoading = true;
    this.api.getTroubleshootingTree(this.treeProjectLabel).subscribe({
      next: (tree) => {
        this.treeProjectKey = tree.projectKey ?? this.treeProjectLabel;
        this.applyTroubleshootingTree(tree, false);
        this.treeSavedSnapshot = this.cloneTroubleshootingTree(tree);
        this.treeDirty = false;
        this.treeLoaded = true;
        this.treeLoading = false;
        this.changeDetector.markForCheck();
      },
      error: (error: unknown) => {
        this.treeLoading = false;
        this.treeLoaded = false;
        this.showError(error, 'دریافت درختواره پشتیبانی ممکن نبود.');
      }
    });
  }

  loadTreeProject(): void {
    if (this.treeDirty) {
      this.notifications.error(
        'تغییرات ذخیره نشده‌اند',
        'قبل از بارگذاری پروژه دیگر، تغییرات فعلی را ذخیره کنید یا از پنجره بستن گزینه خروج بدون ذخیره را بزنید.'
      );
      return;
    }
    this.loadTroubleshootingTree(true);
  }

  saveFaq(): void {
    if (!this.form.question.trim() || !this.form.answer.trim()) {
      this.notifications.error('اطلاعات ناقص است', 'برای ذخیره FAQ، سؤال و پاسخ را کامل کنید.');
      return;
    }
    this.saving = true;
    this.api.createFaq(this.form).subscribe({
      next: () => {
        this.resetForm();
        this.notifications.success('FAQ اضافه شد', 'پرسش و پاسخ جدید به پایگاه دانش اضافه شد.');
        this.loadFaqs();
      },
      error: (error: unknown) => this.showError(error, 'ذخیره FAQ انجام نشد.')
    });
  }

  editFaq(faq: FaqRecord): void {
    this.editingId = faq.id;
    this.editForm = {
      question: faq.question,
      answer: faq.answer,
      category: faq.category,
      keywords: faq.keywords
    };
  }

  showFaqDetails(faq: FaqRecord): void {
    this.detailFaq = faq;
  }

  saveEditedFaq(): void {
    const editingId = this.editingId;
    if (editingId === null) return;
    if (!this.editForm.question.trim() || !this.editForm.answer.trim()) {
      this.notifications.error('اطلاعات ناقص است', 'برای ذخیره FAQ، سؤال و پاسخ را کامل کنید.');
      return;
    }

    this.saving = true;
    this.api.updateFaq(editingId, this.editForm).subscribe({
      next: () => {
        this.saving = false;
        this.closeEditDialog();
        this.notifications.success('FAQ به\u200cروزرسانی شد', 'تغییرات پرسش و پاسخ ذخیره شد.');
        this.loadFaqs();
      },
      error: (error: unknown) => this.showError(error, 'ذخیره FAQ انجام نشد.')
    });
  }

  deleteFaq(faq: FaqRecord): void {
    this.pendingConfirmation = { type: 'delete', faq };
  }

  deleteFaqFromDetails(faq: FaqRecord): void {
    this.closeDetailDialog();
    this.deleteFaq(faq);
  }

  toggleFaqSelection(faqId: number, checked: boolean): void {
    if (checked) {
      this.selectedFaqIds.add(faqId);
    } else {
      this.selectedFaqIds.delete(faqId);
    }
  }

  toggleAllFiltered(checked: boolean): void {
    this.filteredFaqs.forEach((faq) => {
      if (checked) {
        this.selectedFaqIds.add(faq.id);
      } else {
        this.selectedFaqIds.delete(faq.id);
      }
    });
  }

  clearSelection(): void {
    this.selectedFaqIds.clear();
  }

  deleteSelectedFaqs(): void {
    const ids = [...this.selectedFaqIds];
    if (!ids.length) return;
    this.pendingConfirmation = { type: 'bulk-delete', ids };
  }

  onFaqFiltersChanged(): void {
    this.currentPage = 1;
  }

  clearFaqSearch(): void {
    this.searchTerm = '';
    this.currentPage = 1;
  }

  clearReportSearch(): void {
    this.reportSearchTerm = '';
  }

  formatPercent(value: number): string {
    return `${Math.round(value).toLocaleString('fa-IR')}٪`;
  }

  formatRating(value: number): string {
    return `${value.toLocaleString('fa-IR', {
      maximumFractionDigits: 1,
      minimumFractionDigits: value % 1 ? 1 : 0
    })} از ۵`;
  }

  formatStars(value: number | null | undefined): string {
    const rating = Math.max(0, Math.min(5, Math.round(value ?? 0)));
    return `${'★'.repeat(rating)}${'☆'.repeat(5 - rating)}`;
  }

  shortText(value: string, limit = 42): string {
    return value.length > limit ? `${value.slice(0, limit)}...` : value;
  }

  saveExternalService(): void {
    if (!this.serviceForm.key.trim() || !this.serviceForm.title.trim() || !this.serviceForm.url.trim()) {
      this.notifications.error('اطلاعات سرویس ناقص است', 'کلید، عنوان و آدرس سرویس را کامل کنید.');
      return;
    }

    this.settingsSaving = true;
    this.serviceTestResult = null;
    const request$ =
      this.editingServiceId === null
        ? this.api.createExternalService(this.serviceForm)
        : this.api.updateExternalService(this.editingServiceId, this.serviceForm);

    request$.subscribe({
      next: () => {
        this.notifications.success('سرویس ذخیره شد', 'کاتالوگ سرویس‌های سامانه به‌روزرسانی شد.');
        this.resetServiceForm();
        this.loadExternalServices(true);
      },
      error: (error: unknown) => this.showError(error, 'ذخیره سرویس انجام نشد.')
    });
  }

  editExternalService(service: ExternalServiceRecord): void {
    this.editingServiceId = service.id;
    this.serviceTestResult = null;
    this.serviceForm = {
      key: service.key,
      title: service.title,
      purpose: service.purpose,
      sectionTitle: service.sectionTitle,
      method: service.method,
      url: service.url,
      authorizationHeader: service.authorizationHeader,
      authHeader: service.authHeader,
      headersText: service.headersText,
      bodyTemplate: service.bodyTemplate,
      isActive: service.isActive,
      showInAssistant: service.showInAssistant
    };
  }

  cancelServiceEditing(): void {
    this.resetServiceForm();
  }

  deleteExternalService(service: ExternalServiceRecord): void {
    this.pendingConfirmation = { type: 'delete-service', service };
  }

  testExternalService(service: ExternalServiceRecord): void {
    this.serviceTestingId = service.id;
    this.serviceTestResult = null;
    this.api.testExternalService(service.id).subscribe({
      next: (result) => {
        this.serviceTestingId = null;
        this.serviceTestResult = result;
        this.notifications.info(
          result.ok ? 'تست سرویس موفق بود' : 'تست سرویس ناموفق بود',
          result.ok ? `کد پاسخ: ${result.status}` : result.errorMessage || `کد پاسخ: ${result.status}`
        );
        this.changeDetector.markForCheck();
      },
      error: (error: unknown) => this.showError(error, 'تست سرویس انجام نشد.')
    });
  }

  saveTicketServiceSettings(): void {
    const requestTypeMappings = this.parseRequestTypeMappings(this.requestTypeMappingsText);
    if (!requestTypeMappings) {
      this.notifications.error(
        'نگاشت RequestType معتبر نیست',
        'هر خط باید با قالب nodeId | serviceDeskId | requestTypeId | عنوان اختیاری ثبت شود.'
      );
      return;
    }

    this.settingsSaving = true;
    const payload: TicketServiceSettingsPayload = {
      ...this.ticketServiceForm,
      requestTypeMappings
    };

    this.api.updateTicketServiceSettings(payload).subscribe({
      next: (settings) => {
        this.applyTicketServiceSettings(settings);
        this.ticketServiceSettingsLoaded = true;
        this.settingsSaving = false;
        this.notifications.success('پیکربندی ذخیره شد', 'تنظیمات سرویس ثبت تیکت به‌روزرسانی شد.');
        this.changeDetector.markForCheck();
      },
      error: (error: unknown) => this.showError(error, 'ذخیره پیکربندی سرویس انجام نشد.')
    });
  }

  setPageSize(size: number): void {
    this.pageSize = size;
    this.currentPage = 1;
  }

  goToPage(page: number): void {
    this.currentPage = Math.min(Math.max(page, 1), this.totalPages);
  }

  resetForm(): void {
    this.form = this.emptyForm();
    this.saving = false;
  }

  closeEditDialog(): void {
    if (this.saving) return;
    this.editingId = null;
    this.editForm = this.emptyForm();
  }

  closeDetailDialog(): void {
    this.detailFaq = null;
  }

  openFilePicker(): void {
    this.fileInput?.nativeElement.click();
  }

  async importFile(event: Event): Promise<void> {
    const input = event.target as HTMLInputElement;
    const file = input.files?.[0];
    input.value = '';
    if (!file) return;

    try {
      const payload = await this.buildImportPayload(file);
      if (!payload.length) {
        this.notifications.error('ساختار فایل معتبر نیست', 'سؤال و پاسخ قابل ورود در فایل پیدا نشد.');
        return;
      }
      this.pendingConfirmation = { type: 'import', payload };
      this.changeDetector.markForCheck();
    } catch {
      this.notifications.error(
        'خواندن فایل ممکن نیست',
        'فایل باید Excel با فرمت .xlsx یا Word با فرمت .docx باشد.'
      );
    }
  }

  openTreeFilePicker(): void {
    this.treeFileInput?.nativeElement.click();
  }

  createTroubleshootingTree(): void {
    const id = 'node_1';
    this.applyTroubleshootingTree(
      {
        startNodeId: id,
        introNodeIds: [],
        nodes: [{ id, text: 'شروع درختواره', x: 90, y: 80 }],
        edges: []
      },
      true
    );
    this.markTreeDirty();
    this.treeImportSource = 'ساخت دستی';
    this.treeImportFileName = '';
    this.treeImportWarnings = [];
    this.notifications.success('درختواره جدید آماده شد', 'اکنون می‌توانید نودها و ارتباط‌ها را مرحله‌به‌مرحله بسازید.');
    this.changeDetector.markForCheck();
  }

  exportTroubleshootingTree(): void {
    if (!this.troubleshootingTree) return;
    const date = new Date().toISOString().slice(0, 10);
    const exportFile = this.buildTreeExportFile(this.treeExportFormat);
    const blob = new Blob([exportFile.content], { type: exportFile.mimeType });
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement('a');
    anchor.href = url;
    anchor.download = `troubleshooting-tree-${date}.${exportFile.extension}`;
    anchor.style.display = 'none';
    document.body.appendChild(anchor);
    anchor.click();
    anchor.remove();
    setTimeout(() => URL.revokeObjectURL(url), 0);
    this.notifications.success('فایل درختواره آماده شد', `خروجی ${exportFile.label} دریافت شد.`);
  }

  async importTroubleshootingTree(event: Event): Promise<void> {
    const input = event.target as HTMLInputElement;
    const file = input.files?.[0];
    input.value = '';
    if (!file) return;

    try {
      const result = await this.treeImport.parseFile(file);
      this.applyTroubleshootingTree(result.tree, true);
      this.markTreeDirty();
      this.treeImportSource = result.sourceFormat;
      this.treeImportFileName = file.name;
      this.treeImportWarnings = result.warnings;
      this.notifications.success(
        'درختواره آماده شد',
        `${result.tree.nodes.length.toLocaleString('fa-IR')} نود و ${result.tree.edges.length.toLocaleString('fa-IR')} ارتباط از ${result.sourceFormat} خوانده شد.`
      );
      this.changeDetector.markForCheck();
    } catch (error) {
      this.notifications.error(
        'خواندن درختواره ممکن نیست',
        error instanceof Error && error.message === 'BROWSER_ZIP_INFLATE_NOT_SUPPORTED'
          ? 'مرورگر فعلی امکان بازکردن فایل VSDX را ندارد. فایل را به JSON، CSV، Mermaid یا XML تبدیل کنید.'
          : 'فایل باید ساختار قابل تبدیل به درختواره داشته باشد.'
      );
    }
  }

  openTreeWorkspace(mode: TreeWorkspaceMode = 'demo'): void {
    this.treeWorkspaceMode = mode;
    this.treeCloseConfirmOpen = false;
    this.treeWorkspaceOpen = true;
    if (!this.treeLoaded && !this.treeLoading) {
      this.loadTroubleshootingTree();
    }
    this.rebuildTreePreview();
    this.changeDetector.markForCheck();
    this.centerSelectedTreeNode();
  }

  setTreeWorkspaceMode(mode: TreeWorkspaceMode): void {
    this.treeWorkspaceMode = mode;
    this.changeDetector.markForCheck();
  }

  requestCloseTreeWorkspace(): void {
    if (this.treeDirty) {
      this.treeCloseConfirmOpen = true;
      this.changeDetector.markForCheck();
      return;
    }
    this.closeTreeWorkspace();
  }

  continueTreeEditing(): void {
    this.treeCloseConfirmOpen = false;
    this.changeDetector.markForCheck();
  }

  discardTreeChangesAndClose(): void {
    if (this.treeSavedSnapshot) {
      this.applyTroubleshootingTree(this.treeSavedSnapshot, true);
    } else {
      this.troubleshootingTree = null;
      this.treeSelectedNodeId = '';
      this.treeNodeTextDraft = '';
      this.treeOutgoingEdges = [];
      this.treeIncomingEdges = [];
      this.rebuildTreePreview();
    }
    this.treeDirty = false;
    this.closeTreeWorkspace();
  }

  saveTreeAndClose(): void {
    this.saveTroubleshootingTree({ closeAfterSave: true });
  }

  finalizeTroubleshootingTree(): void {
    this.treeWorkspaceMode = 'final';
    this.saveTroubleshootingTree({ finalize: true });
  }

  private closeTreeWorkspace(): void {
    this.treeWorkspaceOpen = false;
    this.treeCloseConfirmOpen = false;
    this.rebuildTreePreview();
    this.changeDetector.markForCheck();
  }

  selectTreeNode(nodeId: string): void {
    const node = this.treeNodes.find((item) => item.id === nodeId);
    if (!node) return;
    this.treeSelectedNodeId = node.id;
    this.treeNodeTextDraft = node.text;
    this.treeLinkTargetId = this.availableTreeTargets[0]?.id ?? '';
    this.syncTreePageWithSelection();
    this.rebuildTreeOutgoingEdges();
    this.rebuildTreePreview();
  }

  focusTreeNode(nodeId: string): void {
    this.selectTreeNode(nodeId);
    this.centerSelectedTreeNode();
  }

  centerSelectedTreeNode(): void {
    if (!this.treeSelectedNodeId) return;
    setTimeout(() => {
      const canvas = this.treeCanvas?.nativeElement;
      const node = this.treePreviewNodes.find((item) => item.id === this.treeSelectedNodeId);
      if (!canvas || !node) return;
      canvas.scrollTo({
        left: Math.max(0, node.cx * this.treeZoom - canvas.clientWidth / 2),
        top: Math.max(0, node.cy * this.treeZoom - canvas.clientHeight / 2),
        behavior: this.theme.motionEnabled ? 'smooth' : 'auto'
      });
    }, 0);
  }

  selectAdjacentTreeNode(direction: -1 | 1): void {
    if (!this.treeNodes.length) return;
    const currentIndex = this.selectedTreeNodeIndex >= 0 ? this.selectedTreeNodeIndex : 0;
    const nextIndex = (currentIndex + direction + this.treeNodes.length) % this.treeNodes.length;
    this.focusTreeNode(this.treeNodes[nextIndex]!.id);
  }

  zoomTree(delta: number): void {
    this.treeZoom = Math.max(0.5, Math.min(2.4, Number((this.treeZoom + delta).toFixed(2))));
    this.changeDetector.markForCheck();
  }

  resetTreeZoom(): void {
    this.treeZoom = 1;
    this.centerSelectedTreeNode();
    this.changeDetector.markForCheck();
  }

  setTreeCanvasTool(tool: TreeCanvasTool): void {
    this.treeCanvasTool = tool;
    if (tool !== 'connect') {
      this.treeConnectionSourceId = '';
    }
    this.changeDetector.markForCheck();
  }

  useReadableTreeLayout(): void {
    this.treeManualLayout = false;
    this.rebuildTreePreview();
    this.changeDetector.markForCheck();
  }

  useFreeTreeLayout(): void {
    this.ensureTreeManualLayout();
    this.markTreeDirty();
    this.rebuildTreePreview();
    this.changeDetector.markForCheck();
  }

  handleTreeCanvasClick(event: MouseEvent): void {
    if (this.treeCanvasTool !== 'add-node' || !this.troubleshootingTree) return;
    const point = this.getTreeSvgPoint(event);
    if (!point) return;
    this.ensureTreeManualLayout();
    const id = this.nextTreeNodeId();
    this.troubleshootingTree.nodes.push({
      id,
      text: this.treeDraftNodeText.trim() || 'نود جدید',
      x: Math.max(0, point.x + this.treePreviewOriginX),
      y: Math.max(0, point.y + this.treePreviewOriginY)
    });
    this.treeDraftNodeText = 'نود جدید';
    this.markTreeDirty();
    this.selectTreeNode(id);
  }

  handleTreeNodeClick(nodeId: string, event: MouseEvent): void {
    event.stopPropagation();
    if (this.treeCanvasTool === 'connect') {
      this.connectTreeNodeFromCanvas(nodeId);
      return;
    }
    this.focusTreeNode(nodeId);
  }

  startTreeNodeDrag(nodeId: string, event: PointerEvent): void {
    if (this.treeCanvasTool !== 'select' || !this.troubleshootingTree) return;
    const point = this.getTreeSvgPoint(event);
    const node = this.treeNodes.find((item) => item.id === nodeId);
    if (!point || !node) return;
    event.stopPropagation();
    this.ensureTreeManualLayout();
    this.selectTreeNode(nodeId);
    this.treeDragState = {
      nodeId,
      offsetX: point.x + this.treePreviewOriginX - (node.x ?? 0),
      offsetY: point.y + this.treePreviewOriginY - (node.y ?? 0)
    };
  }

  handleTreePointerMove(event: PointerEvent): void {
    if (!this.treeDragState) return;
    const point = this.getTreeSvgPoint(event);
    const node = this.treeNodes.find((item) => item.id === this.treeDragState?.nodeId);
    if (!point || !node) return;
    node.x = Math.max(0, point.x + this.treePreviewOriginX - this.treeDragState.offsetX);
    node.y = Math.max(0, point.y + this.treePreviewOriginY - this.treeDragState.offsetY);
    this.markTreeDirty();
    this.rebuildTreePreview();
    this.changeDetector.markForCheck();
  }

  endTreeNodeDrag(): void {
    this.treeDragState = null;
  }

  onTreeSearchChanged(value: string): void {
    this.treeSearchTerm = value;
    this.treeCurrentPage = 1;
    this.focusFirstNodeOnCurrentTreePage();
  }

  setTreePageSize(size: number): void {
    this.treePageSize = size;
    this.treeCurrentPage = 1;
    this.focusFirstNodeOnCurrentTreePage();
  }

  goToTreePage(page: number): void {
    this.treeCurrentPage = Math.min(Math.max(page, 1), this.treeTotalPages);
    this.focusFirstNodeOnCurrentTreePage();
  }

  private focusFirstNodeOnCurrentTreePage(): void {
    this.changeDetector.markForCheck();
    const firstNode = this.paginatedTreeNodes[0];
    if (firstNode) {
      this.focusTreeNode(firstNode.id);
    }
  }

  private syncTreePageWithSelection(): void {
    const selectedIndex = this.filteredTreeNodes.findIndex((node) => node.id === this.treeSelectedNodeId);
    if (selectedIndex >= 0) {
      this.treeCurrentPage = Math.floor(selectedIndex / this.treePageSize) + 1;
      return;
    }
    this.treeCurrentPage = Math.min(Math.max(this.treeCurrentPage, 1), this.treeTotalPages);
  }

  private connectTreeNodeFromCanvas(nodeId: string): void {
    if (!this.troubleshootingTree) return;
    if (!this.treeConnectionSourceId) {
      this.treeConnectionSourceId = nodeId;
      this.selectTreeNode(nodeId);
      this.notifications.info('نود مبدأ انتخاب شد', 'اکنون روی نود مقصد کلیک کنید تا ارتباط ساخته شود.');
      return;
    }
    if (this.treeConnectionSourceId === nodeId) {
      this.treeConnectionSourceId = '';
      return;
    }
    const exists = this.treeEdges.some((edge) => edge.from === this.treeConnectionSourceId && edge.to === nodeId);
    if (exists) {
      this.notifications.info('ارتباط تکراری است', 'این دو نود از قبل به هم متصل هستند.');
      this.treeConnectionSourceId = '';
      return;
    }
    this.troubleshootingTree.edges.push({ from: this.treeConnectionSourceId, to: nodeId });
    this.treeConnectionSourceId = '';
    this.markTreeDirty();
    this.focusTreeNode(nodeId);
  }

  private ensureTreeManualLayout(): void {
    if (this.treeManualLayout) return;
    for (const previewNode of this.treePreviewNodes) {
      const node = this.treeNodes.find((item) => item.id === previewNode.id);
      if (!node) continue;
      node.x = Math.max(0, previewNode.cx + this.treePreviewOriginX);
      node.y = Math.max(0, previewNode.cy + this.treePreviewOriginY);
    }
    this.treeManualLayout = true;
    this.rebuildTreePreview();
  }

  private getTreeSvgPoint(event: MouseEvent | PointerEvent): { x: number; y: number } | null {
    const svg = this.treeCanvas?.nativeElement.querySelector('svg');
    if (!svg) return null;
    const matrix = svg.getScreenCTM();
    if (!matrix) return null;
    const point = svg.createSVGPoint();
    point.x = event.clientX;
    point.y = event.clientY;
    const transformed = point.matrixTransform(matrix.inverse());
    return { x: transformed.x, y: transformed.y };
  }

  updateSelectedTreeNode(): void {
    const node = this.selectedTreeNode;
    if (!node) return;
    const value = this.treeNodeTextDraft.trim();
    if (!value) {
      this.notifications.error('عنوان نود خالی است', 'برای نود انتخاب شده یک عنوان قابل نمایش وارد کنید.');
      this.treeNodeTextDraft = node.text;
      return;
    }
    node.text = value;
    this.markTreeDirty();
    this.rebuildTreeOutgoingEdges();
    this.rebuildTreePreview();
  }

  updateSelectedTreeNodeText(value: string): void {
    this.treeNodeTextDraft = value;
    const node = this.selectedTreeNode;
    if (node) {
      node.text = value;
      this.markTreeDirty();
      this.rebuildTreeOutgoingEdges();
      this.rebuildTreePreview();
    }
  }

  updateSelectedTreeNodePosition(axis: 'x' | 'y', value: string | number | null): void {
    const node = this.selectedTreeNode;
    if (!node) return;
    const numericValue = typeof value === 'number' ? value : Number(value);
    node[axis] = Number.isFinite(numericValue) ? Math.max(0, Math.min(20000, numericValue)) : null;
    this.markTreeDirty();
    this.rebuildTreePreview();
  }

  addTreeChild(): void {
    if (!this.troubleshootingTree) {
      const id = 'node_1';
      this.applyTroubleshootingTree(
        { startNodeId: id, introNodeIds: [], nodes: [{ id, text: 'شروع درختواره', x: 90, y: 80 }], edges: [] },
        true
      );
      this.markTreeDirty();
      return;
    }

    const parent = this.selectedTreeNode ?? this.treeNodes[0];
    const text = this.treeNewChildText.trim();
    if (!parent || !text) {
      this.notifications.error('عنوان فرزند کامل نیست', 'ابتدا نود والد را انتخاب کنید و عنوان فرزند را بنویسید.');
      return;
    }

    const siblings = this.treeEdges.filter((edge) => edge.from === parent.id).length;
    const id = this.nextTreeNodeId();
    this.troubleshootingTree.nodes.push({
      id,
      text,
      x: (parent.x ?? 80) + 220,
      y: (parent.y ?? 80) + siblings * 84
    });
    this.troubleshootingTree.edges.push({ from: parent.id, to: id });
    this.treeNewChildText = '';
    this.markTreeDirty();
    this.selectTreeNode(id);
  }

  addTreeLink(): void {
    if (!this.troubleshootingTree || !this.treeSelectedNodeId || !this.treeLinkTargetId) return;
    const exists = this.treeEdges.some(
      (edge) => edge.from === this.treeSelectedNodeId && edge.to === this.treeLinkTargetId
    );
    if (exists) {
      this.notifications.info('ارتباط تکراری است', 'این دو نود از قبل به هم متصل هستند.');
      return;
    }
    this.troubleshootingTree.edges.push({
      from: this.treeSelectedNodeId,
      to: this.treeLinkTargetId,
      ...(this.treeLinkLabel.trim() ? { label: this.treeLinkLabel.trim() } : {})
    });
    this.treeLinkLabel = '';
    this.markTreeDirty();
    this.rebuildTreeOutgoingEdges();
    this.rebuildTreePreview();
  }

  updateTreeEdgeLabel(index: number, value: string): void {
    const edge = this.troubleshootingTree?.edges[index];
    if (!edge) return;
    edge.label = value.trim();
    this.markTreeDirty();
    this.rebuildTreeOutgoingEdges();
    this.rebuildTreePreview();
  }

  deleteTreeEdge(index: number): void {
    this.troubleshootingTree?.edges.splice(index, 1);
    this.markTreeDirty();
    this.rebuildTreeOutgoingEdges();
    this.rebuildTreePreview();
  }

  deleteSelectedTreeNode(): void {
    const tree = this.troubleshootingTree;
    const node = this.selectedTreeNode;
    if (!tree || !node) return;
    if (tree.nodes.length <= 1) {
      this.notifications.error('حذف ممکن نیست', 'درختواره باید حداقل یک نود داشته باشد.');
      return;
    }

    tree.nodes = tree.nodes.filter((item) => item.id !== node.id);
    tree.edges = tree.edges.filter((edge) => edge.from !== node.id && edge.to !== node.id);
    if (tree.startNodeId === node.id) tree.startNodeId = tree.nodes[0]?.id ?? '';
    tree.introNodeIds = tree.introNodeIds.filter((id) => id !== node.id);
    this.markTreeDirty();
    this.selectTreeNode(tree.startNodeId || tree.nodes[0]?.id || '');
  }

  setSelectedAsTreeStart(): void {
    if (!this.troubleshootingTree || !this.selectedTreeNode) return;
    this.troubleshootingTree.startNodeId = this.selectedTreeNode.id;
    this.markTreeDirty();
    this.rebuildTreePreview();
  }

  relayoutTroubleshootingTree(): void {
    if (!this.troubleshootingTree) return;
    this.troubleshootingTree = this.layoutTree(this.troubleshootingTree);
    this.markTreeDirty();
    this.selectTreeNode(this.treeSelectedNodeId || this.troubleshootingTree.startNodeId);
  }

  saveTroubleshootingTree(options: { closeAfterSave?: boolean; finalize?: boolean } = {}): void {
    if (!this.troubleshootingTree) return;
    const validationError = this.validateTree(this.troubleshootingTree);
    if (validationError) {
      this.notifications.error('درختواره معتبر نیست', validationError);
      return;
    }

    this.treeSaving = true;
    this.api.updateTroubleshootingTree(this.troubleshootingTree, this.treeProjectLabel).subscribe({
      next: (tree) => {
        this.treeProjectKey = tree.projectKey ?? this.treeProjectLabel;
        this.applyTroubleshootingTree(tree, false);
        this.treeSavedSnapshot = this.cloneTroubleshootingTree(tree);
        this.treeDirty = false;
        this.treeSaving = false;
        this.notifications.success(
          options.finalize ? 'درختواره نهایی شد' : 'درختواره ذخیره شد',
          options.finalize
            ? `نسخه نهایی برای پروژه ${this.treeProjectLabel} ذخیره شد و از این پس مبنای مسیر راهبری است.`
            : 'مسیرهای راهبری کاربران با نسخه جدید به روز شد.'
        );
        if (options.closeAfterSave) {
          this.closeTreeWorkspace();
        }
        this.changeDetector.markForCheck();
      },
      error: (error: unknown) => this.showError(error, 'ذخیره درختواره انجام نشد.')
    });
  }

  logout(): void {
    this.auth.logout();
    void this.router.navigateByUrl('/login');
  }

  confirmPendingAction(): void {
    const confirmation = this.pendingConfirmation;
    this.pendingConfirmation = null;
    if (!confirmation) return;

    this.saving = true;
    if (confirmation.type === 'delete') {
      this.api.deleteFaq(confirmation.faq.id).subscribe({
        next: () => {
          this.selectedFaqIds.delete(confirmation.faq.id);
          this.notifications.success('FAQ حذف شد', 'مورد انتخاب\u200cشده از پایگاه دانش حذف شد.');
          this.loadFaqs();
        },
        error: (error: unknown) => this.showError(error, 'حذف FAQ انجام نشد.')
      });
      return;
    }

    if (confirmation.type === 'delete-service') {
      this.api.deleteExternalService(confirmation.service.id).subscribe({
        next: () => {
          this.notifications.success('سرویس حذف شد', 'سرویس انتخاب‌شده از کاتالوگ حذف شد.');
          this.loadExternalServices(true);
        },
        error: (error: unknown) => this.showError(error, 'حذف سرویس انجام نشد.')
      });
      return;
    }

    if (confirmation.type === 'bulk-delete') {
      this.api.deleteFaqs(confirmation.ids).subscribe({
        next: ({ count }) => {
          confirmation.ids.forEach((id) => this.selectedFaqIds.delete(id));
          this.notifications.success(
            'FAQها حذف شدند',
            `${count.toLocaleString('fa-IR')} مورد از پایگاه دانش حذف شد.`
          );
          this.loadFaqs();
        },
        error: (error: unknown) => this.showError(error, 'حذف گروهی FAQ انجام نشد.')
      });
      return;
    }

    this.api.importFaqs(confirmation.payload).subscribe({
      next: ({ count }) => {
        this.selectedFaqIds.clear();
        this.notifications.success(
          'ورود فایل تکمیل شد',
          `${count.toLocaleString('fa-IR')} FAQ با موفقیت وارد پایگاه دانش شد.`
        );
        this.loadFaqs();
      },
      error: (error: unknown) => this.showError(error, 'ورود اطلاعات فایل انجام نشد.')
    });
  }

  cancelConfirmation(): void {
    this.pendingConfirmation = null;
  }

  private markTreeDirty(): void {
    this.treeDirty = true;
  }

  private applyTroubleshootingTree(tree: TroubleshootingTree, resetSelection: boolean): void {
    this.troubleshootingTree = this.cloneTroubleshootingTree(tree);

    const currentSelectionExists = this.treeNodes.some((node) => node.id === this.treeSelectedNodeId);
    if (resetSelection || !currentSelectionExists) {
      this.treeSelectedNodeId = this.troubleshootingTree.startNodeId || this.treeNodes[0]?.id || '';
    }
    const selected = this.selectedTreeNode;
    this.treeNodeTextDraft = selected?.text ?? '';
    this.treeLinkTargetId = this.availableTreeTargets[0]?.id ?? '';
    this.treeLoaded = true;
    this.syncTreePageWithSelection();
    this.rebuildTreeOutgoingEdges();
    this.rebuildTreePreview();
  }

  private cloneTroubleshootingTree(tree: TroubleshootingTree): TroubleshootingTree {
    return {
      projectKey: tree.projectKey,
      startNodeId: tree.startNodeId,
      introNodeIds: [...(tree.introNodeIds ?? [])],
      nodes: tree.nodes.map((node) => ({ ...node })),
      edges: tree.edges.map((edge) => ({ ...edge }))
    };
  }

  private nextTreeNodeId(): string {
    const ids = new Set(this.treeNodes.map((node) => node.id));
    let index = this.treeNodes.length + 1;
    while (ids.has(`node_${index}`)) index += 1;
    return `node_${index}`;
  }

  private validateTree(tree: TroubleshootingTree): string {
    if (!tree.nodes.length) return 'حداقل یک نود باید وجود داشته باشد.';
    const nodeIds = new Set(tree.nodes.map((node) => node.id.trim()).filter(Boolean));
    if (nodeIds.size !== tree.nodes.length) return 'شناسه نودها باید یکتا و غیرخالی باشد.';
    if (!nodeIds.has(tree.startNodeId)) return 'نود شروع باید از بین نودهای موجود انتخاب شود.';
    if (tree.nodes.some((node) => !node.text.trim())) return 'عنوان همه نودها باید کامل باشد.';
    const invalidEdge = tree.edges.find((edge) => !nodeIds.has(edge.from) || !nodeIds.has(edge.to));
    if (invalidEdge) return `ارتباط ${invalidEdge.from} به ${invalidEdge.to} نامعتبر است.`;
    return '';
  }

  private layoutTree(tree: TroubleshootingTree): TroubleshootingTree {
    const children = new Map<string, string[]>();
    for (const edge of tree.edges) {
      const list = children.get(edge.from) ?? [];
      list.push(edge.to);
      children.set(edge.from, list);
    }

    const positions = this.buildTreeFallbackPositions(tree);
    return {
      ...tree,
      nodes: tree.nodes.map((node) => {
        const position = positions.get(node.id) ?? { x: 80, y: 80 };
        return { ...node, x: position.x, y: position.y };
      })
    };
  }

  private buildTreeFallbackPositions(tree = this.troubleshootingTree): Map<string, { x: number; y: number }> {
    const positions = new Map<string, { x: number; y: number }>();
    if (!tree?.nodes.length) return positions;

    const children = new Map<string, string[]>();
    for (const edge of tree.edges) {
      const list = children.get(edge.from) ?? [];
      list.push(edge.to);
      children.set(edge.from, list);
    }

    const visited = new Set<string>();
    const rowsByLevel = new Map<number, number>();
    const horizontalGap = this.treeWorkspaceOpen ? 430 : 240;
    const verticalGap = this.treeWorkspaceOpen ? 190 : 104;
    const startX = this.treeWorkspaceOpen ? 160 : 90;
    const startY = this.treeWorkspaceOpen ? 130 : 70;
    const queue: Array<{ id: string; depth: number }> = [{ id: tree.startNodeId || tree.nodes[0]!.id, depth: 0 }];

    while (queue.length) {
      const item = queue.shift();
      if (!item || visited.has(item.id)) continue;
      visited.add(item.id);
      const row = rowsByLevel.get(item.depth) ?? 0;
      rowsByLevel.set(item.depth, row + 1);
      positions.set(item.id, { x: startX + item.depth * horizontalGap, y: startY + row * verticalGap });
      for (const childId of children.get(item.id) ?? []) {
        queue.push({ id: childId, depth: item.depth + 1 });
      }
    }

    for (const node of tree.nodes) {
      if (positions.has(node.id)) continue;
      const row = positions.size;
      positions.set(node.id, { x: startX, y: startY + row * verticalGap });
    }

    return positions;
  }

  private buildTreeExportFile(format: TreeExportFormat): {
    content: string;
    extension: string;
    mimeType: string;
    label: string;
  } {
    if (!this.troubleshootingTree) {
      return { content: '', extension: 'txt', mimeType: 'text/plain;charset=utf-8', label: 'خالی' };
    }

    if (format === 'csv') {
      return {
        content: this.exportTreeAsCsv(),
        extension: 'csv',
        mimeType: 'text/csv;charset=utf-8',
        label: 'CSV'
      };
    }

    if (format === 'mermaid') {
      return {
        content: this.exportTreeAsMermaid(),
        extension: 'mmd',
        mimeType: 'text/plain;charset=utf-8',
        label: 'Mermaid'
      };
    }

    return {
      content: `${JSON.stringify(this.troubleshootingTree, null, 2)}\n`,
      extension: 'json',
      mimeType: 'application/json;charset=utf-8',
      label: 'JSON'
    };
  }

  private exportTreeAsCsv(): string {
    const tree = this.troubleshootingTree;
    if (!tree) return '';
    const nodeMap = new Map(tree.nodes.map((node) => [node.id, node]));
    const parentIds = new Set(tree.edges.map((edge) => edge.to));
    const rows = [['id', 'text', 'parentId', 'edgeLabel', 'x', 'y']];

    for (const node of tree.nodes) {
      const incoming = tree.edges.filter((edge) => edge.to === node.id);
      if (!incoming.length) {
        rows.push([
          node.id,
          node.text,
          '',
          '',
          String(node.x ?? ''),
          String(node.y ?? '')
        ]);
        continue;
      }

      for (const edge of incoming) {
        rows.push([
          node.id,
          node.text,
          nodeMap.has(edge.from) ? edge.from : '',
          edge.label ?? '',
          String(node.x ?? ''),
          String(node.y ?? '')
        ]);
      }
    }

    for (const edge of tree.edges) {
      if (nodeMap.has(edge.to) || parentIds.has(edge.to)) continue;
      rows.push([edge.to, edge.to, edge.from, edge.label ?? '', '', '']);
    }

    return `\ufeff${rows.map((row) => row.map((cell) => this.csvCell(cell)).join(',')).join('\n')}\n`;
  }

  private exportTreeAsMermaid(): string {
    const tree = this.troubleshootingTree;
    if (!tree) return '';
    const mermaidIds = new Map(tree.nodes.map((node, index) => [node.id, `node_${index + 1}`]));
    const lines = ['flowchart TD'];

    for (const node of tree.nodes) {
      const id = mermaidIds.get(node.id) ?? this.mermaidId(node.id);
      const text = this.mermaidText(node.text);
      lines.push(`  ${id}["${text}"]`);
    }

    for (const edge of tree.edges) {
      const from = mermaidIds.get(edge.from) ?? this.mermaidId(edge.from);
      const to = mermaidIds.get(edge.to) ?? this.mermaidId(edge.to);
      const label = this.mermaidText(edge.label ?? '');
      lines.push(label ? `  ${from} -->|${label}| ${to}` : `  ${from} --> ${to}`);
    }

    return `${lines.join('\n')}\n`;
  }

  private csvCell(value: string): string {
    return `"${value.replace(/"/g, '""')}"`;
  }

  private mermaidId(value: string): string {
    return `node_${value.replace(/[^a-zA-Z0-9_]/g, '_') || 'item'}`;
  }

  private mermaidText(value: string): string {
    return value.replace(/"/g, "'").replace(/\|/g, '/').replace(/\r?\n/g, ' ').trim();
  }

  private loadFaqs(showNotification = false, useGlobalLoading = false): void {
    if (useGlobalLoading) {
      this.loading = true;
    }
    this.api.getFaqs().subscribe({
      next: (faqs) => {
        this.faqs = faqs;
        const existingIds = new Set(faqs.map((faq) => faq.id));
        this.selectedFaqIds.forEach((id) => {
          if (!existingIds.has(id)) this.selectedFaqIds.delete(id);
        });
        this.normalizePaginationPage();
        this.loading = false;
        this.saving = false;
        if (showNotification) {
          this.notifications.info('اطلاعات به‌روز شد', 'آخرین FAQهای پایگاه دانش دریافت شدند.');
        }
        this.changeDetector.markForCheck();
      },
      error: (error: unknown) => this.showError(error, 'به‌روزرسانی فهرست انجام نشد.')
    });
  }

  private emptyForm(): FaqPayload {
    return { question: '', answer: '', category: '', keywords: '' };
  }

  private emptyTicketServiceForm(): TicketServiceSettingsPayload {
    return {
      url: '',
      authorizationHeader: '',
      authHeader: '',
      serviceDeskId: '',
      requestTypeId: '',
      requestTypeMappings: []
    };
  }

  private emptyExternalServiceForm(): ExternalServicePayload {
    return {
      key: '',
      title: '',
      purpose: '',
      sectionTitle: '',
      method: 'POST',
      url: '',
      authorizationHeader: '',
      authHeader: '',
      headersText: '',
      bodyTemplate: '',
      isActive: true,
      showInAssistant: true
    };
  }

  private resetServiceForm(): void {
    this.editingServiceId = null;
    this.serviceForm = this.emptyExternalServiceForm();
    this.serviceTestResult = null;
    this.settingsSaving = false;
  }

  private loadExternalServices(force = false): void {
    if (this.externalServicesLoading || (this.externalServicesLoaded && !force)) return;
    this.externalServicesLoading = true;
    this.api.getExternalServices().subscribe({
      next: (services) => {
        this.externalServices = services;
        this.externalServicesLoaded = true;
        this.externalServicesLoading = false;
        this.settingsSaving = false;
        this.serviceTestingId = null;
        this.changeDetector.markForCheck();
      },
      error: (error: unknown) => {
        this.externalServicesLoading = false;
        this.showError(error, 'به‌روزرسانی سرویس‌ها انجام نشد.');
      }
    });
  }

  private applyTicketServiceSettings(settings: TicketServiceSettings): void {
    this.ticketServiceSettings = settings;
    this.ticketServiceForm = {
      url: settings.url,
      authorizationHeader: settings.authorizationHeader,
      authHeader: settings.authHeader,
      serviceDeskId: settings.serviceDeskId,
      requestTypeId: settings.requestTypeId,
      requestTypeMappings: settings.requestTypeMappings
    };
    this.requestTypeMappingsText = this.formatRequestTypeMappings(settings.requestTypeMappings);
  }

  private isRatedDiagnostic(item: DiagnosticCaseRecord): boolean {
    return typeof item.rating === 'number' && item.rating >= 1 && item.rating <= 5;
  }

  private calculateRate(count: number, total: number): number {
    return total > 0 ? Math.min(100, Math.max(0, (count / total) * 100)) : 0;
  }

  private getLastDays(count: number): Array<{ key: string; label: string }> {
    return Array.from({ length: count }, (_item, index) => {
      const date = new Date();
      date.setDate(date.getDate() - (count - index - 1));
      return {
        key: this.getDateKey(date),
        label: date.toLocaleDateString('fa-IR', { month: '2-digit', day: '2-digit' })
      };
    });
  }

  private countByDay(records: Array<{ createdAt: string }>, key: string): number {
    return records.filter((record) => this.getDateKey(new Date(record.createdAt)) === key).length;
  }

  private getDateKey(date: Date): string {
    const year = date.getFullYear();
    const month = String(date.getMonth() + 1).padStart(2, '0');
    const day = String(date.getDate()).padStart(2, '0');
    return `${year}-${month}-${day}`;
  }

  private formatRequestTypeMappings(mappings: TicketRequestTypeMapping[]): string {
    return mappings
      .map((item) =>
        [item.nodeId, item.serviceDeskId || '-', item.requestTypeId, item.nodeLabel]
          .map((part) => part.trim())
          .join(' | ')
          .trim()
      )
      .join('\n');
  }

  private parseRequestTypeMappings(value: string): TicketRequestTypeMapping[] | null {
    const rows = value
      .split(/\r?\n/)
      .map((row) => row.trim())
      .filter((row) => row && !row.startsWith('#'));
    const mappings: TicketRequestTypeMapping[] = [];

    for (const row of rows) {
      const parts = (row.includes('|') ? row.split('|') : row.split(',')).map((part) => part.trim());
      const [nodeId = '', second = '', third = '', fourth = ''] = parts;
      const serviceDeskId = parts.length === 2 ? '' : second;
      const requestTypeId = parts.length === 2 ? second : third;
      const nodeLabel = parts.length === 2 ? '' : fourth;

      if (!nodeId || !requestTypeId) return null;

      mappings.push({
        nodeId,
        nodeLabel,
        serviceDeskId: serviceDeskId === '-' ? '' : serviceDeskId,
        requestTypeId
      });
    }

    return mappings;
  }

  private normalizePaginationPage(): void {
    this.currentPage = Math.min(Math.max(this.currentPage, 1), this.totalPages);
  }

  private extractAnswerSection(answer: string, label: RegExp): string {
    const pattern = new RegExp(
      `(?:^|\\n)\\s*${label.source}\\s*:\\s*([\\s\\S]*?)(?=\\n\\s*(?:توضیحات|راه\\s*حل)\\s*:|$)`,
      'i'
    );
    return pattern.exec(answer.replace(/\u200c/g, ' '))?.[1]?.trim() ?? '';
  }

  private async buildImportPayload(file: File): Promise<FaqPayload[]> {
    if (/\.xlsx$/i.test(file.name)) {
      const dataset = await this.excelReader.read(file);
      return this.faqImportMapper.mapRows(dataset.rows);
    }
    if (/\.docx$/i.test(file.name)) {
      const text = await this.wordReader.read(file);
      return this.faqImportMapper.mapWordText(text);
    }
    throw new Error('UNSUPPORTED_IMPORT_FILE');
  }

  private showError(error: unknown, fallback: string): void {
    const resolved = this.errorMessages.resolve(error, fallback);
    this.notifications.error(resolved.title, this.errorMessages.formatMessage(resolved));
    this.loading = false;
    this.conversationsLoading = false;
    this.diagnosticCasesLoading = false;
    this.externalServicesLoading = false;
    this.ticketServiceSettingsLoading = false;
    this.saving = false;
    this.settingsSaving = false;
    this.serviceTestingId = null;
    this.treeSaving = false;
    this.changeDetector.markForCheck();
  }
}
