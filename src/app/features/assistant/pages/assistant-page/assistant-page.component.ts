import { CommonModule } from '@angular/common';
import {
  ChangeDetectionStrategy,
  ChangeDetectorRef,
  Component,
  ElementRef,
  OnDestroy,
  OnInit,
  ViewChild
} from '@angular/core';
import { FormsModule } from '@angular/forms';
import { ActivatedRoute, Router, RouterLink } from '@angular/router';
import { Subscription } from 'rxjs';
import { DiagnosticCaseRecord, DiagnosticPayload } from '../../../../core/models/diagnostic.models';
import { ChatMessage, FaqRecord } from '../../../../core/models/faq.models';
import {
  ApiService,
  ExternalServiceExecutionResult,
  PublicExternalServiceRecord
} from '../../../../core/services/api.service';
import { AuthService } from '../../../../core/services/auth.service';
import { ErrorMessageService } from '../../../../core/services/error-message.service';
import { FaqSearchService } from '../../../../core/services/faq-search.service';
import { ThemeService } from '../../../../core/services/theme.service';
import {
  TroubleshootingTreeIndex,
  TroubleshootingTreeService
} from '../../../../core/services/troubleshooting-tree.service';
import { WordReaderService } from '../../../../core/services/word-reader.service';
import { ThemeToggleComponent } from '../../../../shared/components/theme-toggle/theme-toggle.component';
import { BrandLogoComponent } from '../../../../shared/components/brand-logo/brand-logo.component';

interface ConversationSnapshot {
  messages: ChatMessage[];
  question: string;
  error: string;
  diagnosticStep: keyof DiagnosticPayload | null;
  diagnosticDraft: DiagnosticPayload;
  diagnosticCase: DiagnosticCaseRecord | null;
  documentError: string;
  ticketDialogOpen: boolean;
  ticketSubmitting: boolean;
  ticketAutomationState: TicketAutomationState;
  ticketErrorMessage: string;
  ratingSubmitting: boolean;
  ratingMessage: string;
  serviceRunResult: ExternalServiceExecutionResult | null;
  supportStage: SupportStage;
  awaitingInitialProblem: boolean;
  activeTreeOptions: Array<{ label: string; targetId: string }>;
  treeTrail: string[];
  currentTreeNodeId: string;
  currentTreeNodeText: string;
}

type SupportStage = 'selecting' | 'triage' | 'faq' | 'ticket' | 'handoff' | 'done';
type TicketAutomationState = 'idle' | 'preparing' | 'submitting' | 'analyzing' | 'submitted' | 'failed';

interface SupportProgressItem {
  id: SupportStage;
  label: string;
  description: string;
}

@Component({
  selector: 'app-assistant-page',
  standalone: true,
  imports: [CommonModule, FormsModule, RouterLink, ThemeToggleComponent, BrandLogoComponent],
  templateUrl: './assistant-page.component.html',
  styleUrl: './assistant-page.component.scss',
  changeDetection: ChangeDetectionStrategy.OnPush
})
export class AssistantPageComponent implements OnInit, OnDestroy {
  @ViewChild('conversation') conversation?: ElementRef<HTMLDivElement>;
  @ViewChild('supportProgressList') supportProgressList?: ElementRef<HTMLOListElement>;

  faqs: FaqRecord[] = [];
  messages: ChatMessage[] = [];
  question = '';
  loading = true;
  error = '';
  activeProjectKey = 'default';
  typing = false;
  diagnosticStep: keyof DiagnosticPayload | null = null;
  diagnosticDraft: DiagnosticPayload = this.createEmptyDiagnostic();
  diagnosticCase: DiagnosticCaseRecord | null = null;
  documentReading = false;
  documentError = '';
  ticketDialogOpen = false;
  cancelAvailableDuringSubmit = false;
  private _ticketSubmitting = false;
  private cancelDelayTimer: ReturnType<typeof setTimeout> | null = null;

  get ticketSubmitting(): boolean {
    return this._ticketSubmitting;
  }

  set ticketSubmitting(value: boolean) {
    this._ticketSubmitting = value;
    if (this.cancelDelayTimer) {
      clearTimeout(this.cancelDelayTimer);
      this.cancelDelayTimer = null;
    }
    this.cancelAvailableDuringSubmit = false;
    if (value) {
      this.cancelDelayTimer = setTimeout(() => {
        this.cancelAvailableDuringSubmit = true;
        this.changeDetector.markForCheck();
      }, 4000);
    }
  }

  ticketAutomationState: TicketAutomationState = 'idle';
  ticketErrorMessage = '';
  ratingSubmitting = false;
  ratingMessage = '';
  externalServices: PublicExternalServiceRecord[] = [];
  serviceRunResult: ExternalServiceExecutionResult | null = null;
  runningServiceId: number | null = null;
  private _supportStage: SupportStage = 'selecting';

  get supportStage(): SupportStage {
    return this._supportStage;
  }

  set supportStage(value: SupportStage) {
    if (this._supportStage === value) return;
    this._supportStage = value;
    this.scrollActiveSupportStepIntoView();
  }
  welcomeOverlayVisible = false;
  readonly userWriteDisabled = false;
  private treeIndex: TroubleshootingTreeIndex | null = null;
  private treeStartNodeId = '';
  private awaitingInitialProblem = true;
  private activeTreeOptions: Array<{ label: string; targetId: string }> = [];
  private treeTrail: string[] = [];
  private currentTreeNodeId = '';
  private currentTreeNodeText = '';
  private conversationHistory: ConversationSnapshot[] = [];
  private projectRouteSubscription?: Subscription;
  private typingTimer?: ReturnType<typeof setTimeout>;
  private welcomeTimer?: ReturnType<typeof setTimeout>;
  private readonly projectStorageKey = 'rahyar-active-project-key';
  readonly ratingScores = [1, 2, 3, 4, 5];

  readonly supportProgressSteps: SupportProgressItem[] = [
    {
      id: 'selecting',
      label: 'انتخاب حوزه',
      description: 'کاربر مسیر مشکل را از درختواره انتخاب می‌کند.'
    },
    {
      id: 'triage',
      label: 'تشخیص مسیر',
      description: 'جزئیات مسیر انتخاب‌شده برای پشتیبان آماده می‌شود.'
    },
    {
      id: 'faq',
      label: 'بررسی FAQ',
      description: 'پاسخ‌های تاییدشده قبل از ثبت تیکت بررسی می‌شوند.'
    },
    {
      id: 'ticket',
      label: 'ثبت سهند',
      description: 'در نبود پاسخ قطعی، تیکت به صورت خودکار ساخته می‌شود.'
    },
    {
      id: 'handoff',
      label: 'ارجاع پشتیبان',
      description: 'شماره پیگیری برای ادامه رسیدگی در اختیار پشتیبان است.'
    }
  ];

  private readonly diagnosticPrompts: Record<keyof DiagnosticPayload, string> = {
    title: 'عنوان کوتاه مشکل را بنویسید؛ مثلا «خطا در اجرای جریان داده فروش».',
    problem: 'مشکل را با جزئیات بنویسید؛ دقیقا چه اتفاقی افتاده است؟',
    systemName: '',
    processName: 'نام سناریو، فرآیند، جریان داده، گزارش یا پلاگین مرتبط چیست؟ اگر ندارید بنویسید: ندارم',
    scenario: 'سناریوی اجرا را مرحله‌به‌مرحله بنویسید؛ از کجا شروع کردید، چه گزینه‌ای زدید و کجا خطا رخ داد؟',
    serialNumber: 'سریال، شناسه گزارش، کد رهگیری یا شماره درخواست را وارد کنید. اگر ندارید بنویسید: ندارم',
    errorText: 'متن دقیق خطا یا پیام سیستم را وارد کنید. اگر خطایی نمایش داده نشده بنویسید: خطا ندارد',
    evidence: 'متن خطا، لاگ، توضیح screenshot یا مستندات مرتبط را وارد کنید. اگر ندارید بنویسید: ندارم',
    treeNodeId: '',
    treeNodeText: ''
  };

  private readonly diagnosticFlow: Array<keyof DiagnosticPayload> = [
    'title',
    'processName',
    'scenario',
    'serialNumber',
    'errorText',
    'evidence'
  ];

  constructor(
    readonly auth: AuthService,
    readonly theme: ThemeService,
    private readonly api: ApiService,
    private readonly errorMessages: ErrorMessageService,
    private readonly searchService: FaqSearchService,
    private readonly treeService: TroubleshootingTreeService,
    private readonly wordReader: WordReaderService,
    private readonly route: ActivatedRoute,
    private readonly router: Router,
    private readonly changeDetector: ChangeDetectorRef
  ) {}

  ngOnInit(): void {
    this.showLoginWelcomeOnce();

    this.projectRouteSubscription = this.route.queryParamMap.subscribe((params) => {
      const nextProjectKey = this.resolveProjectKey(
        params.get('projectKey') || params.get('project') || params.get('p')
      );
      const projectChanged = nextProjectKey !== this.activeProjectKey;
      this.activeProjectKey = nextProjectKey;
      this.persistActiveProjectKey(nextProjectKey);
      if (projectChanged) {
        this.restartConversationForProjectChange();
      }
      this.loadTroubleshootingTree();
    });

    this.loadActiveExternalServices();

    this.api.getFaqs().subscribe({
      next: (faqs) => {
        this.faqs = faqs;
        this.loading = false;
        this.changeDetector.markForCheck();
      },
      error: (error: unknown) => {
        this.loading = false;
        const resolved = this.errorMessages.resolve(error, 'دریافت پایگاه دانش ممکن نبود.');
        this.error = this.errorMessages.formatMessage(resolved);
        this.changeDetector.markForCheck();
      }
    });
  }

  ngOnDestroy(): void {
    this.projectRouteSubscription?.unsubscribe();
    if (this.typingTimer) clearTimeout(this.typingTimer);
    if (this.welcomeTimer) clearTimeout(this.welcomeTimer);
  }

  closeWelcomeOverlay(): void {
    this.welcomeOverlayVisible = false;
    this.markWelcomeSeen();
    if (this.welcomeTimer) clearTimeout(this.welcomeTimer);
  }

  get inputPlaceholder(): string {
    if (this.userWriteDisabled) return 'امکان نوشتن پیام دستی فعلاً بسته است.';
    return this.diagnosticStep
      ? this.getDiagnosticPrompt(this.diagnosticStep)
      : 'مشکل یا سؤال خود را بنویسید...';
  }

  get canGoBack(): boolean {
    return this.conversationHistory.length > 0 && !this.typing;
  }

  get activeSupportStepIndex(): number {
    const index = this.supportProgressSteps.findIndex((step) => step.id === this.supportStage);
    return index === -1 ? 0 : index;
  }

  get ticketDescriptionPreview(): string {
    return [
      `شرح مشکل: ${this.diagnosticDraft.problem || '-'}`,
      `مسیر انتخاب‌شده: ${this.diagnosticDraft.scenario || '-'}`,
      `فرآیند/سناریو: ${this.diagnosticDraft.processName || '-'}`,
      `شناسه/سریال: ${this.diagnosticDraft.serialNumber || '-'}`,
      `متن خطا: ${this.diagnosticDraft.errorText || '-'}`,
      `مستندات: ${this.diagnosticDraft.evidence || '-'}`
    ].join('\n');
  }

  get ticketStatusText(): string {
    if (this.ticketAutomationState === 'preparing') return 'آماده ثبت؛ منتظر تایید شماست';
    if (this.ticketAutomationState === 'submitting') return 'در حال ارسال به سهند';
    if (this.ticketAutomationState === 'analyzing') return 'ثبت شد؛ تحلیل اولیه در حال انجام است';
    if (this.ticketAutomationState === 'submitted' && this.diagnosticCase?.duplicateNotice)
      return 'مورد مشابه در حال پیگیری است';
    if (this.ticketAutomationState === 'submitted') return 'تیکت ثبت و آماده پیگیری است';
    if (this.ticketAutomationState === 'failed') return 'ثبت تیکت انجام نشد';
    return 'در انتظار مسیر پشتیبانی';
  }

  get ticketStatusHint(): string {
    if (this.ticketAutomationState === 'preparing') {
      return 'اطلاعات آماده است؛ تیکت فقط با زدن دکمه Create ثبت می‌شود، نه قبل از آن.';
    }
    if (this.ticketAutomationState === 'submitted' && this.diagnosticCase?.duplicateNotice)
      return this.diagnosticCase.duplicateNotice;
    if (this.ticketAutomationState === 'submitted') return this.formatTicketReceiptText();
    if (this.ticketAutomationState === 'failed')
      return this.ticketErrorMessage || this.diagnosticCase?.externalTicketError || 'خطای ثبت تیکت را بررسی کنید.';
    if (this.ticketAutomationState === 'idle') return 'هنوز مسیر به مرحله ثبت تیکت نرسیده است.';
    return 'کاربر نیازی به تکمیل یا تایید فرم ندارد؛ ثبت به صورت خودکار انجام می‌شود.';
  }

  get ticketPrimaryActionLabel(): string {
    if (this.ticketAutomationState === 'submitted') return 'ثبت شد';
    if (this.ticketAutomationState === 'failed') return 'تلاش دوباره';
    if (this.ticketSubmitting) return 'در حال ثبت';
    return 'Create';
  }

  // Submission only ever happens from a direct click on this button
  // (handlePrimaryTicketAction -> submitTicketFromDialog). There is no timer or
  // automatic path that calls submitAutomaticTicket on its own.
  get ticketPrimaryActionDisabled(): boolean {
    if (this.ticketSubmitting) return true;
    if (this.ticketAutomationState === 'submitted') return !this.selectedCaseRating;
    return false;
  }

  handlePrimaryTicketAction(): void {
    if (this.ticketAutomationState === 'submitted') {
      this.closeTicketDialog();
      return;
    }
    this.submitTicketFromDialog();
  }

  get showCaseRating(): boolean {
    return Boolean(this.diagnosticCase) && this.ticketAutomationState === 'submitted';
  }

  get selectedCaseRating(): number {
    return this.diagnosticCase?.rating ?? 0;
  }

  isSupportStepDone(index: number): boolean {
    return index < this.activeSupportStepIndex;
  }

  isSupportStepActive(index: number): boolean {
    return index === this.activeSupportStepIndex;
  }

  ask(fromPreset = false, saveHistory = true): void {
    if (this.userWriteDisabled && !fromPreset) return;
    const question = this.question.trim();
    if (!question || this.typing) return;
    this.error = '';

    const matchedTreeOption = this.findTreeOption(question);
    if (matchedTreeOption) {
      this.question = '';
      this.selectTreeOption(matchedTreeOption, saveHistory);
      return;
    }

    if (saveHistory) this.saveConversationSnapshot();

    this.messages.push({ role: 'user', text: question });
    this.question = '';
    this.scrollToLatest();

    if (this.awaitingInitialProblem) {
      this.awaitingInitialProblem = false;
      const jump = this.findTreePathByExactLabel(question);
      if (jump) {
        this.treeTrail = jump.path;
        this.showTreeNode(jump.targetId);
        return;
      }
      const state = this.treeStartNodeId ? this.resolveInitialTreeState(this.treeStartNodeId) : null;
      this.treeTrail = [question];
      if (state) this.showTreeNode(state.node.id);
      else this.showTreeNode(this.treeStartNodeId);
      return;
    }

    if (this.diagnosticStep) {
      this.captureDiagnosticAnswer(question);
      return;
    }

    const jump = this.findTreePathByExactLabel(question);
    if (jump) {
      this.treeTrail = jump.path;
      this.showTreeNode(jump.targetId);
      return;
    }

    this.treeTrail = [];
    this.answerFromFaqOrStartTicket(question);
  }

  // Typed text only matches this.activeTreeOptions (the CURRENT node's own
  // children) via findTreeOption above. If the user instead types a word that
  // names a node/option elsewhere in the tree (e.g. "کندی"), and that label is
  // unambiguous across the whole tree, jump straight there instead of discarding
  // what they typed and falling back to a generic FAQ search. Ambiguous labels
  // (reused across multiple branches, e.g. "بله"/"ثبت تیکت") are left alone since
  // there'd be no reliable way to know which occurrence was meant.
  private findTreePathByExactLabel(query: string): { targetId: string; path: string[] } | null {
    if (!this.treeIndex) return null;
    const normalizedQuery = this.normalizeTreeText(query);
    if (!normalizedQuery) return null;

    const candidates: { from: string; to: string; label: string }[] = [];
    for (const edges of this.treeIndex.outgoing.values()) {
      for (const edge of edges) {
        const label = (edge.label?.trim() || this.treeIndex.nodes.get(edge.to)?.text || '').trim();
        if (label && this.normalizeTreeText(label) === normalizedQuery) {
          candidates.push({ from: edge.from, to: edge.to, label });
        }
      }
    }
    if (candidates.length !== 1) return null;

    const target = candidates[0];
    const pathToParent = this.findPathFromStart(target.from);
    if (!pathToParent) return null;
    return { targetId: target.to, path: [...pathToParent, target.label] };
  }

  private findPathFromStart(targetNodeId: string): string[] | null {
    if (!this.treeIndex || !this.treeStartNodeId) return null;
    if (targetNodeId === this.treeStartNodeId) return [];

    const queue: Array<{ nodeId: string; path: string[] }> = [{ nodeId: this.treeStartNodeId, path: [] }];
    const visited = new Set<string>([this.treeStartNodeId]);
    while (queue.length) {
      const current = queue.shift();
      if (!current) break;
      const options = this.treeService.getOptions(this.treeIndex, current.nodeId);
      for (const option of options) {
        if (option.targetId === targetNodeId) return [...current.path, option.label];
        if (visited.has(option.targetId)) continue;
        visited.add(option.targetId);
        queue.push({ nodeId: option.targetId, path: [...current.path, option.label] });
      }
    }
    return null;
  }

  private captureDiagnosticAnswer(value: string): void {
    const step = this.diagnosticStep;
    if (!step) return;
    this.diagnosticDraft = { ...this.diagnosticDraft, [step]: value };
    const nextStep = this.getNextDiagnosticStep(step);

    if (nextStep) {
      this.diagnosticStep = nextStep;
      this.pushAssistantMessage(this.getDiagnosticPrompt(nextStep));
      return;
    }

    this.openTicketDialog();
  }

  submitTicketFromDialog(): void {
    this.submitAutomaticTicket();
  }

  private submitAutomaticTicket(): void {
    if (this.ticketSubmitting || !this.isTicketDraftValid()) return;

    if (this.ticketAutomationState === 'failed' && this.diagnosticCase) {
      this.retrySahandTicket();
      return;
    }

    this.ticketSubmitting = true;
    this.ticketAutomationState = 'submitting';
    this.ticketErrorMessage = '';
    this.ratingMessage = '';
    this.supportStage = 'ticket';
    this.changeDetector.markForCheck();

    this.api.createDiagnosticCase(this.diagnosticDraft).subscribe({
      next: (createdCase) => {
        this.diagnosticCase = createdCase;
        this.ticketAutomationState = 'analyzing';
        this.changeDetector.markForCheck();

        this.api.analyzeDiagnosticCase(createdCase.id).subscribe({
          next: (analyzedCase) => this.applyTicketResult(analyzedCase, true),
          error: (error: unknown) =>
            this.handleDiagnosticError(error, 'پرونده ثبت شد، اما تحلیل اولیه انجام نشد.')
        });
      },
      error: (error: unknown) => this.handleDiagnosticError(error, 'ثبت پرونده بررسی انجام نشد.')
    });
  }

  private retrySahandTicket(): void {
    const diagnosticId = this.diagnosticCase?.id;
    if (!diagnosticId || this.ticketSubmitting) return;

    this.ticketSubmitting = true;
    this.ticketAutomationState = 'submitting';
    this.ticketErrorMessage = '';
    this.changeDetector.markForCheck();

    this.api.submitDiagnosticTicket(diagnosticId).subscribe({
      next: (updatedCase) => this.applyTicketResult(updatedCase, true),
      error: (error: unknown) => this.handleDiagnosticError(error, 'ارسال دوباره تیکت به سهند انجام نشد.')
    });
  }

  private applyTicketResult(diagnosticCase: DiagnosticCaseRecord, appendMessage: boolean): void {
    this.diagnosticCase = diagnosticCase;
    const sahandSubmitted = diagnosticCase.externalTicketStatus === 'submitted';
    this.ticketAutomationState = sahandSubmitted ? 'submitted' : 'failed';
    this.supportStage = sahandSubmitted ? 'handoff' : 'ticket';
    this.ticketErrorMessage = sahandSubmitted
      ? ''
      : diagnosticCase.externalTicketError ||
        'پرونده داخلی ثبت شد، اما ارسال به سهند انجام نشد. تنظیمات سرویس سهند را بررسی کنید و دوباره تلاش کنید.';

    if (appendMessage) {
      const severityLabel = this.formatSeverity(diagnosticCase.severity);
      const ticketReceipt = this.formatTicketReceipt(
        diagnosticCase.id,
        diagnosticCase.externalTicketStatus,
        diagnosticCase.externalTicketId,
        diagnosticCase.externalTrackingId
      );
      const submittedText = sahandSubmitted
        ? diagnosticCase.duplicateNotice || 'تیکت ثبت شد و تحلیل اولیه انجام شد.'
        : this.ticketErrorMessage;
      this.messages.push({
        role: 'assistant',
        text: `${submittedText}\n${ticketReceipt}\nسطح اهمیت: ${severityLabel}\n${
          diagnosticCase.analysisSummary ?? ''
        }\nپیشنهاد: ${diagnosticCase.recommendation ?? '-'}`
      });
    }

    this.ticketSubmitting = false;
    this.ratingMessage = '';
    this.changeDetector.markForCheck();
    this.scrollToLatest();
  }

  closeTicketDialog(): void {
    if (this.ticketSubmitting && !this.cancelAvailableDuringSubmit) return;
    this.ticketDialogOpen = false;
  }

  private pushAssistantMessage(text: string): void {
    this.typing = true;
    this.typingTimer = setTimeout(() => {
      this.messages.push({ role: 'assistant', text });
      this.typing = false;
      this.changeDetector.markForCheck();
      this.scrollToLatest();
    }, 350);
  }

  private getNextDiagnosticStep(step: keyof DiagnosticPayload): keyof DiagnosticPayload | null {
    const index = this.diagnosticFlow.indexOf(step);
    return this.diagnosticFlow[index + 1] ?? null;
  }

  private createEmptyDiagnostic(): DiagnosticPayload {
    return {
      title: '',
      problem: '',
      systemName: this.activeProjectKey || 'default',
      processName: '',
      scenario: '',
      serialNumber: '',
      errorText: '',
      evidence: '',
      treeNodeId: '',
      treeNodeText: ''
    };
  }

  private formatSeverity(severity: 'low' | 'medium' | 'high' | null): string {
    if (severity === 'high') return 'بالا - نیازمند ارجاع';
    if (severity === 'medium') return 'متوسط';
    return 'پایین';
  }

  private formatTicketReceipt(
    diagnosticId: number,
    status: 'not_configured' | 'submitted' | 'failed' | null | undefined,
    ticketId: string | null | undefined,
    trackingId: string | null | undefined
  ): string {
    const internalTicketNumber = `NAVA-${diagnosticId.toString().padStart(5, '0')}`;
    const internalTrackingNumber = `TRK-${diagnosticId.toString().padStart(5, '0')}`;
    const lines = [
      `شماره تیکت داخلی: ${internalTicketNumber}`,
      `شماره پیگیری داخلی: ${internalTrackingNumber}`
    ];

    if (status === 'submitted') {
      lines.push(`شماره تیکت سهند: ${ticketId || 'ثبت شد؛ شماره از سهند دریافت نشد'}`);
      lines.push(`شماره پیگیری سهند: ${trackingId || ticketId || 'از سهند دریافت نشد'}`);
    } else if (status === 'failed') {
      lines.push('وضعیت سهند: ارسال ناموفق بود؛ پرونده داخلی قابل پیگیری است.');
    } else {
      lines.push('وضعیت سهند: اتصال هنوز تنظیم نشده؛ پرونده داخلی قابل پیگیری است.');
    }

    return lines.join('\n');
  }

  private formatTicketReceiptText(): string {
    if (!this.diagnosticCase) return 'شماره پیگیری هنوز ایجاد نشده است.';
    return this.formatTicketReceipt(
      this.diagnosticCase.id,
      this.diagnosticCase.externalTicketStatus,
      this.diagnosticCase.externalTicketId,
      this.diagnosticCase.externalTrackingId
    );
  }

  private handleDiagnosticError(error: unknown, fallback: string): void {
    const resolved = this.errorMessages.resolve(error, fallback);
    this.ticketAutomationState = 'failed';
    this.supportStage = 'ticket';
    this.ticketErrorMessage = this.errorMessages.formatMessage(resolved);
    this.messages.push({ role: 'assistant', text: this.errorMessages.formatMessage(resolved) });
    this.typing = false;
    this.ticketSubmitting = false;
    this.changeDetector.markForCheck();
    this.scrollToLatest();
  }

  useExample(value: string): void {
    if (this.userWriteDisabled) return;
    this.question = value;
  }

  useQuickReply(value: string): void {
    if (this.typing || this.ticketDialogOpen) return;
    this.question = value;
    this.ask(true);
  }

  runExternalService(service: PublicExternalServiceRecord): void {
    if (this.runningServiceId !== null || this.typing || this.ticketDialogOpen) return;

    this.runningServiceId = service.id;
    this.serviceRunResult = null;
    this.messages.push({
      role: 'assistant',
      text: `درخواست اجرای سرویس «${service.title}» ثبت شد. نتیجه اجرا همین‌جا نمایش داده می‌شود.`
    });
    this.changeDetector.markForCheck();
    this.scrollToLatest();

    this.api.runExternalService(service.id).subscribe({
      next: (result) => {
        this.runningServiceId = null;
        this.serviceRunResult = result;
        const status = result.ok ? 'موفق' : 'ناموفق';
        const detail =
          result.errorMessage ||
          (result.status
            ? `کد پاسخ سرویس: ${result.status} ${result.statusText}`
            : 'پاسخ قابل نمایش دریافت نشد.');
        this.messages.push({
          role: 'assistant',
          text: `اجرای سرویس «${service.title}» ${status} بود.\n${detail}`
        });
        this.changeDetector.markForCheck();
        this.scrollToLatest();
      },
      error: (error: unknown) => {
        const resolved = this.errorMessages.resolve(error, 'اجرای سرویس انجام نشد.');
        this.runningServiceId = null;
        this.serviceRunResult = {
          ok: false,
          status: 0,
          statusText: 'Request failed',
          durationMs: 0,
          bodyPreview: '',
          executedAt: new Date().toISOString(),
          errorMessage: this.errorMessages.formatMessage(resolved)
        };
        this.messages.push({ role: 'assistant', text: this.errorMessages.formatMessage(resolved) });
        this.changeDetector.markForCheck();
        this.scrollToLatest();
      }
    });
  }

  goBackConversationStep(): void {
    if (!this.canGoBack) return;
    const snapshot = this.conversationHistory.pop();
    if (!snapshot) return;

    if (this.typingTimer) clearTimeout(this.typingTimer);
    this.typing = false;
    this.messages = this.cloneMessages(snapshot.messages);
    this.question = snapshot.question;
    this.error = snapshot.error;
    this.diagnosticStep = snapshot.diagnosticStep;
    this.diagnosticDraft = { ...snapshot.diagnosticDraft };
    this.diagnosticCase = snapshot.diagnosticCase ? { ...snapshot.diagnosticCase } : null;
    this.documentError = snapshot.documentError;
    this.ticketDialogOpen = snapshot.ticketDialogOpen;
    this.ticketSubmitting = snapshot.ticketSubmitting;
    this.ticketAutomationState = snapshot.ticketAutomationState;
    this.ticketErrorMessage = snapshot.ticketErrorMessage;
    this.ratingSubmitting = snapshot.ratingSubmitting;
    this.ratingMessage = snapshot.ratingMessage;
    this.serviceRunResult = snapshot.serviceRunResult ? { ...snapshot.serviceRunResult } : null;
    this.runningServiceId = null;
    this.supportStage = snapshot.supportStage;
    this.awaitingInitialProblem = snapshot.awaitingInitialProblem;
    this.activeTreeOptions = snapshot.activeTreeOptions.map((option) => ({ ...option }));
    this.treeTrail = [...snapshot.treeTrail];
    this.currentTreeNodeId = snapshot.currentTreeNodeId;
    this.currentTreeNodeText = snapshot.currentTreeNodeText;
    this.changeDetector.markForCheck();
    this.scrollToLatest();
  }

  restartConversation(): void {
    if (this.typingTimer) clearTimeout(this.typingTimer);
    this.typing = false;
    this.question = '';
    this.error = '';
    this.diagnosticStep = null;
    this.diagnosticDraft = this.createEmptyDiagnostic();
    this.diagnosticCase = null;
    this.documentError = '';
    this.ticketDialogOpen = false;
    this.ticketSubmitting = false;
    this.ticketAutomationState = 'idle';
    this.ticketErrorMessage = '';
    this.ratingSubmitting = false;
    this.ratingMessage = '';
    this.serviceRunResult = null;
    this.runningServiceId = null;
    this.supportStage = 'selecting';
    this.awaitingInitialProblem = true;
    this.activeTreeOptions = [];
    this.treeTrail = [];
    this.currentTreeNodeId = '';
    this.currentTreeNodeText = '';
    this.conversationHistory = [];
    this.showInitialProblemPrompt();
  }

  isMessageRatingActive(message: ChatMessage, score: number): boolean {
    return score <= (message.rating ?? 0);
  }

  rateMessage(message: ChatMessage, score: number): void {
    if (message.ratingSubmitting) return;

    message.rating = score;
    message.ratingSubmitted = false;
    message.ratingMessage = message.conversationId
      ? ''
      : 'امتیاز انتخاب شد؛ بعد از ثبت گزارش گفت‌وگو ذخیره می‌شود.';

    if (message.conversationId) {
      this.persistMessageRating(message);
      return;
    }

    this.changeDetector.markForCheck();
  }

  private persistMessageRating(message: ChatMessage): void {
    if (!message.conversationId || !message.rating) return;

    message.ratingSubmitting = true;
    message.ratingMessage = 'در حال ثبت امتیاز...';
    this.changeDetector.markForCheck();

    this.api.rateConversation(message.conversationId, { rating: message.rating }).subscribe({
      next: (conversation) => {
        message.rating = conversation.rating ?? message.rating;
        message.ratingSubmitted = true;
        message.ratingSubmitting = false;
        message.ratingMessage = 'امتیاز شما ثبت شد.';
        this.changeDetector.markForCheck();
      },
      error: (error: unknown) => {
        const resolved = this.errorMessages.resolve(error, 'ثبت امتیاز پاسخ انجام نشد.');
        message.ratingSubmitted = false;
        message.ratingSubmitting = false;
        message.ratingMessage = this.errorMessages.formatMessage(resolved);
        this.changeDetector.markForCheck();
      }
    });
  }

  isCaseRatingActive(score: number): boolean {
    return score <= this.selectedCaseRating;
  }

  submitCaseRating(score: number): void {
    if (!this.diagnosticCase || this.ratingSubmitting) return;

    this.ratingSubmitting = true;
    this.ratingMessage = '';
    this.changeDetector.markForCheck();

    this.api.rateDiagnosticCase(this.diagnosticCase.id, { rating: score }).subscribe({
      next: (updatedCase) => {
        this.diagnosticCase = updatedCase;
        this.ratingSubmitting = false;
        this.ratingMessage = 'امتیاز شما ثبت شد و در داشبورد ادمین قابل مشاهده است.';
        this.changeDetector.markForCheck();
      },
      error: (error: unknown) => {
        const resolved = this.errorMessages.resolve(error, 'ثبت امتیاز انجام نشد.');
        this.ratingSubmitting = false;
        this.ratingMessage = this.errorMessages.formatMessage(resolved);
        this.changeDetector.markForCheck();
      }
    });
  }

  selectTreeOption(option: { label: string; targetId: string }, saveHistory = true): void {
    if (this.typing) return;
    if (saveHistory) this.saveConversationSnapshot();
    this.messages.push({ role: 'user', text: option.label });
    this.treeTrail.push(option.label);
    this.supportStage =
      this.treeTrail.length <= 1 ? 'selecting' : this.treeTrail.length <= 2 ? 'triage' : 'faq';

    const state = this.getTreeNodeState(option.targetId);
    if (!state) return;

    this.currentTreeNodeId = state.node.id;
    this.currentTreeNodeText = state.node.text;

    if (this.isTicketNode(state.node.text)) {
      this.confirmBeforeTicketFlow(
        this.buildTreeProblemText(state.node.text),
        state.node,
        'مسیر انتخاب‌شده به مرحله ثبت تیکت رسید. فرم تیکت آماده می‌شود؛ برای ثبت نهایی در سهند باید دکمه Create را در پنجره تایید بزنید.'
      );
      return;
    }

    if (this.isResolutionCheckNode(state.node.text)) {
      this.confirmBeforeTicketFlow(
        this.buildTreeProblemText(state.node.text),
        state.node,
        'برای این مورد مسیر پیگیری باید با ثبت تیکت ادامه پیدا کند. فرم تیکت آماده می‌شود؛ برای ثبت نهایی در سهند باید دکمه Create را در پنجره تایید بزنید.'
      );
      return;
    }

    if (!state.options.length && !this.isEndNode(state.node.text)) {
      this.answerFromFaqOrStartTicket(this.buildTreeProblemText(state.node.text), true, state.node);
      return;
    }

    this.showTreeNode(option.targetId);
  }

  onWordFileSelected(event: Event): void {
    if (this.userWriteDisabled) return;
    const input = event.target as HTMLInputElement;
    const file = input.files?.[0];
    input.value = '';
    if (!file || this.typing || this.documentReading) return;

    this.documentError = '';
    this.documentReading = true;
    this.wordReader
      .read(file)
      .then((text) => {
        const evidence = `فایل Word: ${file.name}\n\n${text}`.slice(0, 12000);
        if (this.diagnosticStep === 'evidence') {
          this.messages.push({ role: 'user', text: `مستند Word بارگذاری شد: ${file.name}` });
          this.captureDiagnosticAnswer(evidence);
        } else {
          this.question = evidence;
        }
      })
      .catch((error: unknown) => {
        this.documentError =
          error instanceof Error && error.message === 'INVALID_WORD_FILE'
            ? 'فقط فایل Word با فرمت .docx قابل خواندن است.'
            : 'متن فایل Word قابل خواندن نبود.';
      })
      .finally(() => {
        this.documentReading = false;
        this.changeDetector.markForCheck();
        this.scrollToLatest();
      });
  }

  logout(): void {
    this.auth.logout();
    void this.router.navigateByUrl('/login');
  }

  isTicketDraftValid(): boolean {
    return Boolean(
      this.diagnosticDraft.title.trim() &&
      this.diagnosticDraft.problem.trim() &&
      this.diagnosticDraft.processName.trim() &&
      this.diagnosticDraft.scenario.trim()
    );
  }

  isCitrixTicket(): boolean {
    const source = `${this.treeTrail.join(' ')} ${this.diagnosticDraft.problem}`;
    return this.normalizeTreeText(source).includes('سیتریکس');
  }

  getProcessFieldLabel(): string {
    return this.isCitrixTicket() ? 'محیط کاری سیتریکس *' : 'سناریو، فرآیند، جریان داده یا گزارش *';
  }

  getScenarioFieldLabel(): string {
    return this.isCitrixTicket() ? 'شرح مسیر و عملیات انجام‌شده در محیط سیتریکس *' : 'سناریوی اجرا *';
  }

  private saveConversationSnapshot(): void {
    this.conversationHistory.push({
      messages: this.cloneMessages(this.messages),
      question: this.question,
      error: this.error,
      diagnosticStep: this.diagnosticStep,
      diagnosticDraft: { ...this.diagnosticDraft },
      diagnosticCase: this.diagnosticCase ? { ...this.diagnosticCase } : null,
      documentError: this.documentError,
      ticketDialogOpen: this.ticketDialogOpen,
      ticketSubmitting: this.ticketSubmitting,
      ticketAutomationState: this.ticketAutomationState,
      ticketErrorMessage: this.ticketErrorMessage,
      ratingSubmitting: this.ratingSubmitting,
      ratingMessage: this.ratingMessage,
      serviceRunResult: this.serviceRunResult ? { ...this.serviceRunResult } : null,
      supportStage: this.supportStage,
      awaitingInitialProblem: this.awaitingInitialProblem,
      activeTreeOptions: this.activeTreeOptions.map((option) => ({ ...option })),
      treeTrail: [...this.treeTrail],
      currentTreeNodeId: this.currentTreeNodeId,
      currentTreeNodeText: this.currentTreeNodeText
    });
  }

  private cloneMessages(messages: ChatMessage[]): ChatMessage[] {
    return messages.map((message) => ({
      ...message,
      matches: message.matches?.map((match) => ({ ...match })),
      treeOptions: message.treeOptions?.map((option) => ({ ...option })),
      quickReplies: message.quickReplies ? [...message.quickReplies] : undefined
    }));
  }

  private scrollToLatest(): void {
    requestAnimationFrame(() => {
      const element = this.conversation?.nativeElement;
      if (element) {
        element.scrollTo({
          top: element.scrollHeight,
          behavior: this.theme.motionEnabled ? 'smooth' : 'auto'
        });
      }
    });
  }

  private scrollActiveSupportStepIntoView(): void {
    requestAnimationFrame(() => {
      const activeItem = this.supportProgressList?.nativeElement.querySelector('li.active');
      activeItem?.scrollIntoView({
        behavior: this.theme.motionEnabled ? 'smooth' : 'auto',
        block: 'nearest'
      });
    });
  }

  private showLoginWelcomeOnce(): void {
    const key = this.getWelcomeStorageKey();
    if (!key || sessionStorage.getItem(key)) return;

    this.welcomeOverlayVisible = true;
    this.welcomeTimer = setTimeout(() => {
      this.welcomeOverlayVisible = false;
      this.markWelcomeSeen();
      this.changeDetector.markForCheck();
    }, 3000);
  }

  private markWelcomeSeen(): void {
    const key = this.getWelcomeStorageKey();
    if (key) sessionStorage.setItem(key, 'true');
  }

  private getWelcomeStorageKey(): string | null {
    const username = this.auth.user?.username;
    return username ? `nava-welcome-seen:${username}` : null;
  }

  private resolveProjectKey(routeProjectKey: string | null): string {
    return this.normalizeProjectKey(routeProjectKey || this.readStoredProjectKey() || 'default');
  }

  private normalizeProjectKey(value: string): string {
    const key = value.trim().replace(/\s+/g, '-').slice(0, 80);
    return key || 'default';
  }

  private readStoredProjectKey(): string {
    try {
      return localStorage.getItem(this.projectStorageKey) ?? '';
    } catch {
      return '';
    }
  }

  private persistActiveProjectKey(projectKey: string): void {
    try {
      localStorage.setItem(this.projectStorageKey, projectKey);
    } catch {
      // Storage can be unavailable in restricted browser contexts.
    }
  }

  private restartConversationForProjectChange(): void {
    if (this.typingTimer) clearTimeout(this.typingTimer);
    this.typing = false;
    this.messages = [];
    this.question = '';
    this.error = '';
    this.diagnosticStep = null;
    this.diagnosticDraft = this.createEmptyDiagnostic();
    this.diagnosticCase = null;
    this.ticketDialogOpen = false;
    this.ticketSubmitting = false;
    this.ticketAutomationState = 'idle';
    this.ticketErrorMessage = '';
    this.ratingSubmitting = false;
    this.ratingMessage = '';
    this.supportStage = 'selecting';
    this.awaitingInitialProblem = true;
    this.treeIndex = null;
    this.treeStartNodeId = '';
    this.activeTreeOptions = [];
    this.treeTrail = [];
    this.currentTreeNodeId = '';
    this.currentTreeNodeText = '';
    this.conversationHistory = [];
  }

  private loadActiveExternalServices(): void {
    this.api.getActiveExternalServices().subscribe({
      next: (services) => {
        this.externalServices = services;
        this.changeDetector.markForCheck();
      },
      error: (error: unknown) => {
        const resolved = this.errorMessages.resolve(error, 'دریافت سرویس‌های فعال انجام نشد.');
        this.error = this.errorMessages.formatMessage(resolved);
        this.changeDetector.markForCheck();
      }
    });
  }

  private loadTroubleshootingTree(): void {
    const projectKey = this.activeProjectKey;
    this.treeService.load(projectKey).subscribe({
      next: (tree) => {
        if (projectKey !== this.activeProjectKey) return;
        this.treeIndex = this.treeService.createIndex(tree);
        this.treeStartNodeId = tree.startNodeId;
        if (!this.messages.length || this.awaitingInitialProblem) {
          this.showInitialProblemPrompt();
        }
      },
      error: () => {
        this.error = `دریافت درختواره پروژه ${projectKey} ممکن نبود.`;
        this.changeDetector.markForCheck();
      }
    });
  }

  private showTreeNode(nodeId: string, initial = false): void {
    const state = this.getTreeNodeState(nodeId);
    if (!state) return;

    this.currentTreeNodeId = state.node.id;
    this.currentTreeNodeText = state.node.text;
    const shouldSubmitTicket =
      !initial && (this.isResolutionCheckNode(state.node.text) || this.shouldSubmitTicketInsteadOfResolutionCheck(state));
    const displayText = this.stripResolutionCheckText(state.node.text);
    this.activeTreeOptions = shouldSubmitTicket ? [] : state.options;

    const message: ChatMessage | null = displayText
      ? {
          role: 'assistant',
          text: displayText,
          treeOptions: this.activeTreeOptions.length ? this.activeTreeOptions : undefined
        }
      : null;

    if (initial) {
      this.messages = message ? [message] : [];
      this.changeDetector.markForCheck();
      this.scrollToLatest();
      return;
    }

    this.typing = true;
    this.typingTimer = setTimeout(() => {
      if (message) this.messages.push(message);
      this.typing = false;
      this.changeDetector.markForCheck();
      this.scrollToLatest();

      if (shouldSubmitTicket) {
        this.confirmBeforeTicketFlow(
          this.buildTreeProblemText(state.node.text),
          state.node,
          'برای این مورد مسیر پیگیری باید با ثبت تیکت ادامه پیدا کند. فرم تیکت آماده می‌شود؛ برای ثبت نهایی در سهند باید دکمه Create را در پنجره تایید بزنید.'
        );
      }
    }, 300);
  }

  private showInitialProblemPrompt(): void {
    const state = this.treeStartNodeId ? this.resolveInitialTreeState(this.treeStartNodeId) : null;
    this.currentTreeNodeId = state?.node.id ?? '';
    this.currentTreeNodeText = state?.node.text ?? '';
    this.activeTreeOptions = state?.options ?? [];
    this.messages = [
      {
        role: 'assistant',
        text: 'سلام، حوزه مشکل را انتخاب کنید تا مرحله بعدی نمایش داده شود.',
        treeOptions: this.activeTreeOptions.length ? this.activeTreeOptions : undefined,
        quickReplies: this.activeTreeOptions.length
          ? undefined
          : ['اجرای جریان داده', 'محیط سیتریکس', 'دیتابیس یا خطای داده', 'کندی سامانه یا زیرساخت']
      }
    ];
    this.changeDetector.markForCheck();
    this.scrollToLatest();
  }

  private findTreeOption(value: string): { label: string; targetId: string } | null {
    const normalizedValue = this.normalizeTreeText(value);
    return (
      this.activeTreeOptions.find((option) => {
        const normalizedLabel = this.normalizeTreeText(option.label);
        return normalizedLabel === normalizedValue || normalizedLabel.includes(normalizedValue);
      }) ?? null
    );
  }

  private normalizeTreeText(value: string): string {
    return value.replace(/\s+/g, ' ').trim().toLocaleLowerCase('fa-IR');
  }

  private getDiagnosticPrompt(step: keyof DiagnosticPayload): string {
    if (step === 'processName' && this.isCitrixTicket()) {
      return 'محیط کاری سیتریکس را مشخص کنید: star-da1، star-da2، star-da3 یا star-da4';
    }

    if (step === 'scenario' && this.isCitrixTicket()) {
      return 'مسیر کاری داخل سیتریکس را بنویسید؛ وارد کدام محیط شدید، چه کاری انجام دادید و مشکل کجا رخ داد؟';
    }

    return this.diagnosticPrompts[step];
  }

  private getTreeNodeState(nodeId: string): {
    node: NonNullable<ReturnType<TroubleshootingTreeService['resolveDisplayNode']>>;
    options: Array<{ label: string; targetId: string }>;
  } | null {
    if (!this.treeIndex) return null;
    const node = this.treeService.resolveDisplayNode(this.treeIndex, nodeId);
    if (!node) return null;

    return {
      node,
      options: this.treeService.getOptions(this.treeIndex, node.id)
    };
  }

  /**
   * The opening message always shows a fixed greeting instead of any node's own text, so
   * intro/connector nodes here can be skipped purely by their single-unlabeled-edge shape —
   * unlike getTreeNodeState, node text length doesn't matter since we never display it.
   */
  private resolveInitialTreeState(startNodeId: string): {
    node: NonNullable<ReturnType<TroubleshootingTreeService['resolveDisplayNode']>>;
    options: Array<{ label: string; targetId: string }>;
  } | null {
    if (!this.treeIndex) return null;
    const visited = new Set<string>();
    let nodeId = startNodeId;

    while (!visited.has(nodeId)) {
      visited.add(nodeId);
      const node = this.treeIndex.nodes.get(nodeId);
      if (!node) return null;
      const options = this.treeService.getOptions(this.treeIndex, nodeId);
      const edges = this.treeIndex.outgoing.get(nodeId) ?? [];
      const isSingleUnlabeledEdge = options.length === 1 && !edges[0]?.label?.trim();
      const isSentinel = this.isTicketNode(node.text) || this.isResolutionCheckNode(node.text);
      if (!isSingleUnlabeledEdge || isSentinel) return { node, options };
      nodeId = options[0]!.targetId;
    }

    return null;
  }

  private isTicketNode(text: string): boolean {
    const normalizedText = this.normalizeTreeText(text);
    return normalizedText.includes('ثبت تیکت');
  }

  private isResolutionCheckNode(text: string): boolean {
    const normalizedText = this.normalizeTreeText(text);
    return (
      normalizedText.includes('مشکل برطرف شد') ||
      normalizedText.includes('پاسخ برای کاربر کافی بود')
    );
  }

  private stripResolutionCheckText(text: string): string {
    return text
      .replace(/\s*آیا\s+مشکل\s+برطرف\s+شد\s*؟?/gi, '')
      .replace(/\s*آیا\s+پاسخ\s+برای\s+کاربر\s+کافی\s+بود\s*؟?/gi, '')
      .replace(/\s+/g, ' ')
      .trim();
  }

  private shouldSubmitTicketInsteadOfResolutionCheck(state: {
    options: Array<{ label: string; targetId: string }>;
  }): boolean {
    if (!this.treeIndex) return false;
    return state.options.some((option) => {
      const target = this.treeIndex?.nodes.get(option.targetId);
      return this.isResolutionCheckNode(option.label) || Boolean(target && this.isResolutionCheckNode(target.text));
    });
  }

  private isEndNode(text: string): boolean {
    return this.normalizeTreeText(text).includes('پایان');
  }

  private buildTreeProblemText(currentText: string): string {
    const steps = [...this.treeTrail, currentText]
      .map((item) => this.stripResolutionCheckText(item))
      .filter(Boolean)
      .filter((item) => !this.isResolutionCheckNode(item));
    // currentText is the reached node's own text, which for leaf/category nodes
    // is often identical to the option label already at the end of treeTrail
    // (e.g. clicking "سیتریکس" lands on a node whose text is also "سیتریکس").
    return steps.filter((step, index) => step !== steps[index - 1]).join(' > ');
  }

  private answerFromFaqOrStartTicket(
    question: string,
    fromTree = false,
    sourceNode?: { id: string; text: string }
  ): void {
    this.typing = true;
    this.supportStage = 'faq';
    const { matches, answer, matchedFaq } = this.searchFaq(question);
    const reliableMatches = matches.filter((match) => match.score >= 0.55);

    this.typingTimer = setTimeout(() => {
      let faqMessage: ChatMessage | null = null;
      if (reliableMatches.length) {
        faqMessage = {
          role: 'assistant',
          text: fromTree
            ? 'این مورد را در FAQ بررسی کردم؛ پاسخ پیشنهادی:'
            : 'پاسخ پیشنهادی بر اساس FAQ موجود:',
          matches: reliableMatches,
          faqResolution: { question, sourceNode }
        };
        this.messages.push(faqMessage);
      } else {
        this.confirmBeforeTicketFlow(question, sourceNode);
      }

      this.typing = false;
      this.changeDetector.markForCheck();
      this.scrollToLatest();

      if (this.userWriteDisabled) return;

      this.api
        .logConversation(question, answer, reliableMatches.length ? (matchedFaq?.id ?? null) : null)
        .subscribe({
          next: (conversation) => {
            if (!faqMessage) return;
            faqMessage.conversationId = conversation.id;
            if (faqMessage.rating && !faqMessage.ratingSubmitted) {
              this.persistMessageRating(faqMessage);
              return;
            }
            this.changeDetector.markForCheck();
          },
          error: (error: unknown) => {
            const resolved = this.errorMessages.resolve(error, 'ثبت گزارش گفت‌وگو انجام نشد.');
            if (faqMessage) {
              faqMessage.ratingMessage = 'گزارش گفت‌وگو ثبت نشد؛ امتیاز قابل ذخیره نیست.';
            }
            this.error = `پاسخ نمایش داده شد، اما ${this.errorMessages.formatMessage(resolved)}`;
            this.changeDetector.markForCheck();
          }
        });
    }, 500);
  }

  private searchFaq(question: string): {
    matches: NonNullable<ChatMessage['matches']>;
    answer: string;
    matchedFaq: FaqRecord | null;
  } {
    const rows = this.faqs.map((faq) => ({
      سؤال: faq.question,
      پاسخ: faq.answer,
      دسته‌بندی: faq.category,
      'کلمات کلیدی': faq.keywords
    }));
    const matches = this.searchService.search(rows, question);
    const answer = matches[0]?.text ?? 'پاسخ قطعی در FAQ موجود پیدا نشد؛ مسیر ثبت تیکت شروع شد.';
    const matchedFaq = matches[0] ? (this.faqs.find((faq) => faq.answer === matches[0]?.text) ?? null) : null;

    return { matches, answer, matchedFaq };
  }

  private confirmBeforeTicketFlow(
    problem: string,
    sourceNode?: { id: string; text: string },
    noticeText?: string
  ): void {
    this.messages.push({
      role: 'assistant',
      text: 'پاسخ قطعی برای این مورد پیدا نشد. در صورتی که پاسخ مناسبی دریافت نکردید، تیکت سهند را ثبت کنید.',
      ticketConfirmation: { problem, sourceNode, noticeText }
    });
    this.changeDetector.markForCheck();
    this.scrollToLatest();
  }

  acceptAutoTicket(message: ChatMessage): void {
    if (!message.ticketConfirmation || message.ticketConfirmation.resolved) return;
    const { problem, sourceNode, noticeText } = message.ticketConfirmation;
    message.ticketConfirmation.resolved = 'accepted';
    this.startTicketFlow(problem, sourceNode, noticeText);
  }

  markFaqResolved(message: ChatMessage): void {
    if (!message.faqResolution || message.faqResolution.resolved) return;
    message.faqResolution.resolved = 'yes';
    this.changeDetector.markForCheck();
  }

  continueAfterFaq(message: ChatMessage): void {
    if (!message.faqResolution || message.faqResolution.resolved) return;
    message.faqResolution.resolved = 'no';
    const { question, sourceNode } = message.faqResolution;
    this.confirmBeforeTicketFlow(question, sourceNode);
  }

  private startTicketFlow(
    problem: string,
    sourceNode?: { id: string; text: string },
    noticeText = 'در FAQ پاسخ قطعی پیدا نشد. فرم تیکت با مسیر انتخاب‌شده آماده می‌شود؛ برای ثبت نهایی در سهند باید دکمه Create را در پنجره تایید بزنید.'
  ): void {
    this.diagnosticDraft = this.createAutomaticDiagnostic(problem, sourceNode);
    this.diagnosticCase = null;
    this.diagnosticStep = null;
    this.ticketDialogOpen = true;
    this.ticketAutomationState = 'preparing';
    this.ticketErrorMessage = '';
    this.ratingSubmitting = false;
    this.ratingMessage = '';
    this.supportStage = 'ticket';
    this.messages.push({
      role: 'assistant',
      text: noticeText
    });
    this.changeDetector.markForCheck();
    this.scrollToLatest();
  }

  private createAutomaticDiagnostic(
    problem: string,
    sourceNode?: { id: string; text: string }
  ): DiagnosticPayload {
    const mappedNodeId = sourceNode?.id || this.currentTreeNodeId;
    const mappedNodeText = this.stripResolutionCheckText(sourceNode?.text || this.currentTreeNodeText);
    const cleanPath = this.treeTrail
      .map((item) => this.stripResolutionCheckText(item.trim()))
      .filter((item) => item && !this.isDecisionLabel(item));
    const meaningfulPath = cleanPath.filter((item) => !this.isTicketNode(item));
    const problemText = this.stripResolutionCheckText(problem);
    const leaf = meaningfulPath[meaningfulPath.length - 1] || problemText || 'نیازمند بررسی پشتیبانی';
    const domain = meaningfulPath[0] || 'تحلیل داده';
    const middlePath = meaningfulPath.slice(1);
    // problemText (built by buildTreeProblemText) already IS the tree path joined
    // into one string, so appending it after meaningfulPath here would repeat the
    // whole path a second time. Only fall back to it when there's no tree path at
    // all (e.g. a free-text question that skipped the tree).
    const fullPath = meaningfulPath.length ? meaningfulPath.join(' > ') : problemText;

    return {
      title: this.limitText(`درخواست پشتیبانی - ${leaf}`, 120),
      problem: this.limitText(problemText || fullPath || leaf, 3000),
      systemName: this.resolveProjectScopedSystemName(domain),
      processName: this.limitText(middlePath.join(' / ') || leaf || 'مسیر درختواره پشتیبانی', 260),
      scenario: this.limitText(fullPath || leaf, 4000),
      serialNumber: 'در دسترس نیست',
      errorText: leaf.includes('خطا') ? leaf : 'خطای مشخصی در مسیر انتخاب‌شده ثبت نشده است.',
      treeNodeId: mappedNodeId,
      treeNodeText: mappedNodeText,
      evidence: this.limitText(
        [
          `ثبت خودکار از صفحه کاربر نوا`,
          `پروژه: ${this.activeProjectKey}`,
          `تعداد انتخاب‌های کاربر: ${this.treeTrail.length.toLocaleString('fa-IR')}`,
          `مسیر: ${fullPath || leaf}`,
          `Node: ${mappedNodeId || '-'}${mappedNodeText ? ` - ${mappedNodeText}` : ''}`
        ].join('\n'),
        4000
      )
    };
  }

  private resolveSystemName(domain: string): string {
    const normalizedDomain = this.normalizeTreeText(domain);
    if (normalizedDomain.includes('سیتریکس')) return 'محیط سیتریکس';
    if (normalizedDomain.includes('دیتابیس')) return 'دیتابیس';
    if (normalizedDomain.includes('زیرساخت')) return 'زیرساخت';
    return 'تحلیل داده';
  }

  private resolveProjectScopedSystemName(domain: string): string {
    const systemName = this.resolveSystemName(domain);
    return this.activeProjectKey === 'default'
      ? systemName
      : `${systemName} - پروژه ${this.activeProjectKey}`;
  }

  private isDecisionLabel(value: string): boolean {
    const normalizedValue = this.normalizeTreeText(value);
    return normalizedValue === 'بله' || normalizedValue === 'خیر';
  }

  private limitText(value: string, maxLength: number): string {
    const normalizedValue = value.replace(/\s+/g, ' ').trim();
    return normalizedValue.length > maxLength
      ? `${normalizedValue.slice(0, maxLength - 1)}…`
      : normalizedValue;
  }

  private openTicketDialog(): void {
    this.diagnosticStep = null;
    this.ticketDialogOpen = true;
    this.messages.push({
      role: 'assistant',
      text: 'اطلاعات تیکت آماده شد. لطفا فرم نهایی را بررسی کنید؛ بعد از تأیید، تیکت از طریق API سهند برای پیمانکار ارسال می‌شود.'
    });
    this.changeDetector.markForCheck();
    this.scrollToLatest();
  }
}
