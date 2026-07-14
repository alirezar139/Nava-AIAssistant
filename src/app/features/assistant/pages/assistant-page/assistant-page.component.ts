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
import { Router, RouterLink } from '@angular/router';
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

  faqs: FaqRecord[] = [];
  messages: ChatMessage[] = [];
  question = '';
  loading = true;
  error = '';
  typing = false;
  diagnosticStep: keyof DiagnosticPayload | null = null;
  diagnosticDraft: DiagnosticPayload = this.createEmptyDiagnostic();
  diagnosticCase: DiagnosticCaseRecord | null = null;
  documentReading = false;
  documentError = '';
  ticketDialogOpen = false;
  ticketSubmitting = false;
  ticketAutomationState: TicketAutomationState = 'idle';
  ticketErrorMessage = '';
  externalServices: PublicExternalServiceRecord[] = [];
  serviceRunResult: ExternalServiceExecutionResult | null = null;
  runningServiceId: number | null = null;
  supportStage: SupportStage = 'selecting';
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
  private typingTimer?: ReturnType<typeof setTimeout>;
  private welcomeTimer?: ReturnType<typeof setTimeout>;

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
    systemName: 'نام سامانه یا ابزار تحلیل داده‌ای که مشکل در آن رخ داده چیست؟',
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
    'systemName',
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
    private readonly router: Router,
    private readonly changeDetector: ChangeDetectorRef
  ) {}

  ngOnInit(): void {
    this.showLoginWelcomeOnce();

    this.loadTroubleshootingTree();
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
      `سامانه/ابزار: ${this.diagnosticDraft.systemName || '-'}`,
      `فرآیند/سناریو: ${this.diagnosticDraft.processName || '-'}`,
      `شناسه/سریال: ${this.diagnosticDraft.serialNumber || '-'}`,
      `متن خطا: ${this.diagnosticDraft.errorText || '-'}`,
      `مستندات: ${this.diagnosticDraft.evidence || '-'}`
    ].join('\n');
  }

  get ticketStatusText(): string {
    if (this.ticketAutomationState === 'preparing') return 'در حال آماده‌سازی اطلاعات';
    if (this.ticketAutomationState === 'submitting') return 'در حال ارسال به سهند';
    if (this.ticketAutomationState === 'analyzing') return 'ثبت شد؛ تحلیل اولیه در حال انجام است';
    if (this.ticketAutomationState === 'submitted') return 'تیکت ثبت و آماده پیگیری است';
    if (this.ticketAutomationState === 'failed') return 'ثبت تیکت انجام نشد';
    return 'در انتظار مسیر پشتیبانی';
  }

  get ticketStatusHint(): string {
    if (this.ticketAutomationState === 'submitted') return this.formatTicketReceiptText();
    if (this.ticketAutomationState === 'failed')
      return this.ticketErrorMessage || 'خطای ثبت تیکت را بررسی کنید.';
    if (this.ticketAutomationState === 'idle') return 'هنوز مسیر به مرحله ثبت تیکت نرسیده است.';
    return 'کاربر نیازی به تکمیل یا تایید فرم ندارد؛ ثبت به صورت خودکار انجام می‌شود.';
  }

  get ticketPrimaryActionLabel(): string {
    if (this.ticketAutomationState === 'submitted') return 'ثبت شد';
    if (this.ticketAutomationState === 'failed') return 'ناموفق';
    if (this.ticketSubmitting) return 'در حال ثبت خودکار';
    return 'Create';
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
      this.treeTrail = [question];
      this.showTreeNode(this.treeStartNodeId);
      return;
    }

    if (this.diagnosticStep) {
      this.captureDiagnosticAnswer(question);
      return;
    }

    this.treeTrail = [];
    this.answerFromFaqOrStartTicket(question);
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

    this.ticketSubmitting = true;
    this.ticketAutomationState = 'submitting';
    this.ticketErrorMessage = '';
    this.supportStage = 'ticket';
    this.changeDetector.markForCheck();

    this.api.createDiagnosticCase(this.diagnosticDraft).subscribe({
      next: (createdCase) => {
        this.diagnosticCase = createdCase;
        this.ticketAutomationState = 'analyzing';
        this.changeDetector.markForCheck();

        this.api.analyzeDiagnosticCase(createdCase.id).subscribe({
          next: (analyzedCase) => {
            this.diagnosticCase = analyzedCase;
            this.ticketAutomationState = 'submitted';
            this.supportStage = 'handoff';
            const severityLabel = this.formatSeverity(analyzedCase.severity);
            const ticketReceipt = this.formatTicketReceipt(
              analyzedCase.id,
              analyzedCase.externalTicketStatus,
              analyzedCase.externalTicketId,
              analyzedCase.externalTrackingId
            );
            this.messages.push({
              role: 'assistant',
              text: `تیکت ثبت شد و تحلیل اولیه انجام شد.\n${ticketReceipt}\nسطح اهمیت: ${severityLabel}\n${analyzedCase.analysisSummary ?? ''}\nپیشنهاد: ${analyzedCase.recommendation ?? '-'}`
            });
            this.ticketSubmitting = false;
            this.changeDetector.markForCheck();
            this.scrollToLatest();
          },
          error: (error: unknown) =>
            this.handleDiagnosticError(error, 'پرونده ثبت شد، اما تحلیل اولیه انجام نشد.')
        });
      },
      error: (error: unknown) => this.handleDiagnosticError(error, 'ثبت پرونده بررسی انجام نشد.')
    });
  }

  closeTicketDialog(): void {
    if (this.ticketSubmitting) return;
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
      systemName: '',
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

  rateMessage(message: ChatMessage, feedback: 'helpful' | 'unhelpful'): void {
    message.feedback = feedback;
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
      this.startTicketFlow(this.buildTreeProblemText(state.node.text), state.node);
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
      this.diagnosticDraft.systemName.trim() &&
      this.diagnosticDraft.processName.trim() &&
      this.diagnosticDraft.scenario.trim()
    );
  }

  isCitrixTicket(): boolean {
    const source = `${this.treeTrail.join(' ')} ${this.diagnosticDraft.problem} ${this.diagnosticDraft.systemName}`;
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
      if (element) element.scrollTo({ top: element.scrollHeight, behavior: 'smooth' });
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
    this.treeService.load().subscribe({
      next: (tree) => {
        this.treeIndex = this.treeService.createIndex(tree);
        this.treeStartNodeId = tree.startNodeId;
        this.showInitialProblemPrompt();
      },
      error: () => {
        this.changeDetector.markForCheck();
      }
    });
  }

  private showTreeNode(nodeId: string, initial = false): void {
    const state = this.getTreeNodeState(nodeId);
    if (!state) return;

    this.currentTreeNodeId = state.node.id;
    this.currentTreeNodeText = state.node.text;
    this.activeTreeOptions = state.options;

    const message: ChatMessage = {
      role: 'assistant',
      text: state.node.text,
      treeOptions: this.activeTreeOptions.length ? this.activeTreeOptions : undefined
    };

    if (initial) {
      this.messages = [message];
      this.changeDetector.markForCheck();
      this.scrollToLatest();
      return;
    }

    this.typing = true;
    this.typingTimer = setTimeout(() => {
      this.messages.push(message);
      this.typing = false;
      this.changeDetector.markForCheck();
      this.scrollToLatest();
    }, 300);
  }

  private showInitialProblemPrompt(): void {
    const state = this.treeStartNodeId ? this.getTreeNodeState(this.treeStartNodeId) : null;
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

  private isTicketNode(text: string): boolean {
    const normalizedText = this.normalizeTreeText(text);
    return normalizedText.includes('ثبت تیکت');
  }

  private isEndNode(text: string): boolean {
    return this.normalizeTreeText(text).includes('پایان');
  }

  private buildTreeProblemText(currentText: string): string {
    return [...this.treeTrail, currentText].filter(Boolean).join(' > ');
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
      if (reliableMatches.length) {
        this.messages.push({
          role: 'assistant',
          text: fromTree
            ? 'این مورد را در FAQ بررسی کردم؛ پاسخ پیشنهادی:'
            : 'پاسخ پیشنهادی بر اساس FAQ موجود:',
          matches: reliableMatches
        });
      } else {
        this.startTicketFlow(question, sourceNode);
      }

      this.typing = false;
      this.changeDetector.markForCheck();
      this.scrollToLatest();

      if (this.userWriteDisabled) return;

      this.api
        .logConversation(question, answer, reliableMatches.length ? (matchedFaq?.id ?? null) : null)
        .subscribe({
          error: (error: unknown) => {
            const resolved = this.errorMessages.resolve(error, 'ثبت گزارش گفت‌وگو انجام نشد.');
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

  private startTicketFlow(problem: string, sourceNode?: { id: string; text: string }): void {
    this.diagnosticDraft = this.createAutomaticDiagnostic(problem, sourceNode);
    this.diagnosticCase = null;
    this.diagnosticStep = null;
    this.ticketDialogOpen = true;
    this.ticketAutomationState = 'preparing';
    this.ticketErrorMessage = '';
    this.supportStage = 'ticket';
    this.messages.push({
      role: 'assistant',
      text: 'در FAQ پاسخ قطعی پیدا نشد. تیکت سهند به صورت خودکار با مسیر انتخاب‌شده در حال ثبت است.'
    });
    this.changeDetector.markForCheck();
    this.scrollToLatest();
    this.submitAutomaticTicket();
  }

  private createAutomaticDiagnostic(
    problem: string,
    sourceNode?: { id: string; text: string }
  ): DiagnosticPayload {
    const mappedNodeId = sourceNode?.id || this.currentTreeNodeId;
    const mappedNodeText = sourceNode?.text || this.currentTreeNodeText;
    const cleanPath = this.treeTrail
      .map((item) => item.trim())
      .filter((item) => item && !this.isDecisionLabel(item));
    const meaningfulPath = cleanPath.filter((item) => !this.isTicketNode(item));
    const leaf = meaningfulPath[meaningfulPath.length - 1] || problem || 'نیازمند بررسی پشتیبانی';
    const domain = meaningfulPath[0] || 'پلتفرم تحلیل روابط';
    const middlePath = meaningfulPath.slice(1);
    const fullPath = [...meaningfulPath, problem].filter(Boolean).join(' > ');

    return {
      title: this.limitText(`درخواست پشتیبانی - ${leaf}`, 120),
      problem: this.limitText(problem || fullPath || leaf, 3000),
      systemName: this.resolveSystemName(domain),
      processName: this.limitText(middlePath.join(' / ') || leaf || 'مسیر درختواره پشتیبانی', 260),
      scenario: this.limitText(fullPath || leaf, 4000),
      serialNumber: 'در دسترس نیست',
      errorText: leaf.includes('خطا') ? leaf : 'خطای مشخصی در مسیر انتخاب‌شده ثبت نشده است.',
      treeNodeId: mappedNodeId,
      treeNodeText: mappedNodeText,
      evidence: this.limitText(
        [
          `ثبت خودکار از صفحه کاربر راهیار`,
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
    return 'پلتفرم تحلیل روابط';
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
