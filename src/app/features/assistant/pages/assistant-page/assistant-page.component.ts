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
import { DiagnosticPayload } from '../../../../core/models/diagnostic.models';
import { ChatMessage, FaqRecord } from '../../../../core/models/faq.models';
import { ApiService } from '../../../../core/services/api.service';
import { AuthService } from '../../../../core/services/auth.service';
import { ErrorMessageService } from '../../../../core/services/error-message.service';
import { FaqSearchService } from '../../../../core/services/faq-search.service';
import {
  TroubleshootingTreeIndex,
  TroubleshootingTreeService
} from '../../../../core/services/troubleshooting-tree.service';
import { WordReaderService } from '../../../../core/services/word-reader.service';
import { ThemeToggleComponent } from '../../../../shared/components/theme-toggle/theme-toggle.component';
import { BrandLogoComponent } from '../../../../shared/components/brand-logo/brand-logo.component';

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
  @ViewChild('questionInput') questionInput?: ElementRef<HTMLInputElement>;

  faqs: FaqRecord[] = [];
  messages: ChatMessage[] = [];
  question = '';
  loading = true;
  error = '';
  typing = false;
  diagnosticStep: keyof DiagnosticPayload | null = null;
  diagnosticDraft: DiagnosticPayload = this.createEmptyDiagnostic();
  documentReading = false;
  documentError = '';
  ticketDialogOpen = false;
  ticketSubmitting = false;
  welcomeOverlayVisible = false;
  private treeIndex: TroubleshootingTreeIndex | null = null;
  private treeStartNodeId = '';
  private awaitingInitialProblem = true;
  private activeTreeOptions: Array<{ label: string; targetId: string }> = [];
  private treeTrail: string[] = [];
  private typingTimer?: ReturnType<typeof setTimeout>;
  private welcomeTimer?: ReturnType<typeof setTimeout>;

  private readonly diagnosticPrompts: Record<keyof DiagnosticPayload, string> = {
    title: 'عنوان کوتاه مشکل را بنویسید؛ مثلا «خطا در اجرای جریان داده فروش».',
    problem: 'مشکل را با جزئیات بنویسید؛ دقیقا چه اتفاقی افتاده است؟',
    systemName: 'نام سامانه یا ابزار تحلیل داده‌ای که مشکل در آن رخ داده چیست؟',
    processName: 'نام سناریو، فرآیند، جریان داده، گزارش یا پلاگین مرتبط چیست؟ اگر ندارید بنویسید: ندارم',
    scenario: 'سناریوی اجرا را مرحله‌به‌مرحله بنویسید؛ از کجا شروع کردید، چه گزینه‌ای زدید و کجا خطا رخ داد؟',
    serialNumber: 'سریال، شناسه گزارش، کد رهگیری یا شماره درخواست را وارد کنید. اگر ندارید بنویسید: ندارم',
    errorText: 'متن دقیق خطا یا پیام سیستم را وارد کنید. اگر خطایی نمایش داده نشده بنویسید: خطا ندارد',
    evidence: 'متن خطا، لاگ، توضیح screenshot یا مستندات مرتبط را وارد کنید. اگر ندارید بنویسید: ندارم'
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

  focusAssistantInput(): void {
    this.closeWelcomeOverlay();
    requestAnimationFrame(() => {
      this.questionInput?.nativeElement.focus();
      this.scrollToLatest();
    });
  }

  get inputPlaceholder(): string {
    return this.diagnosticStep
      ? this.getDiagnosticPrompt(this.diagnosticStep)
      : 'مشکل یا سؤال خود را بنویسید...';
  }

  ask(): void {
    const question = this.question.trim();
    if (!question || this.typing) return;
    this.error = '';

    const matchedTreeOption = this.findTreeOption(question);
    if (matchedTreeOption) {
      this.question = '';
      this.selectTreeOption(matchedTreeOption);
      return;
    }

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
    if (this.ticketSubmitting || !this.isTicketDraftValid()) return;

    this.ticketSubmitting = true;
    this.changeDetector.markForCheck();
    this.api.createDiagnosticCase(this.diagnosticDraft).subscribe({
      next: (createdCase) => {
        this.api.analyzeDiagnosticCase(createdCase.id).subscribe({
          next: (analyzedCase) => {
            const severityLabel = this.formatSeverity(analyzedCase.severity);
            const ticketStatus = this.formatExternalTicketStatus(
              analyzedCase.externalTicketStatus,
              analyzedCase.externalTicketId
            );
            this.messages.push({
              role: 'assistant',
              text: `پرونده بررسی #${analyzedCase.id} ثبت و تحلیل اولیه انجام شد.\n${ticketStatus}\nسطح اهمیت: ${severityLabel}\n${analyzedCase.analysisSummary ?? ''}\nپیشنهاد: ${analyzedCase.recommendation ?? '-'}`
            });
            this.ticketDialogOpen = false;
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
      evidence: ''
    };
  }

  private formatSeverity(severity: 'low' | 'medium' | 'high' | null): string {
    if (severity === 'high') return 'بالا - نیازمند ارجاع';
    if (severity === 'medium') return 'متوسط';
    return 'پایین';
  }

  private formatExternalTicketStatus(
    status: 'not_configured' | 'submitted' | 'failed' | null | undefined,
    ticketId: string | null | undefined
  ): string {
    if (status === 'submitted') return `تیکت سهند ثبت شد${ticketId ? `؛ کد پیگیری: ${ticketId}` : '.'}`;
    if (status === 'failed') return 'ارسال به سهند ناموفق بود؛ پرونده داخلی ثبت شد و قابل پیگیری است.';
    return 'اتصال سهند هنوز تنظیم نشده؛ پرونده داخلی ثبت شد.';
  }

  private handleDiagnosticError(error: unknown, fallback: string): void {
    const resolved = this.errorMessages.resolve(error, fallback);
    this.messages.push({ role: 'assistant', text: this.errorMessages.formatMessage(resolved) });
    this.typing = false;
    this.ticketSubmitting = false;
    this.changeDetector.markForCheck();
    this.scrollToLatest();
  }

  useExample(value: string): void {
    this.question = value;
  }

  rateMessage(message: ChatMessage, feedback: 'helpful' | 'unhelpful'): void {
    message.feedback = feedback;
  }

  selectTreeOption(option: { label: string; targetId: string }): void {
    if (this.typing) return;
    this.messages.push({ role: 'user', text: option.label });
    this.treeTrail.push(option.label);

    const state = this.getTreeNodeState(option.targetId);
    if (!state) return;

    if (this.isTicketNode(state.node.text)) {
      this.startTicketFlow(this.buildTreeProblemText(state.node.text));
      return;
    }

    if (!state.options.length && !this.isEndNode(state.node.text)) {
      this.answerFromFaqOrStartTicket(this.buildTreeProblemText(state.node.text), true);
      return;
    }

    this.showTreeNode(option.targetId);
  }

  onWordFileSelected(event: Event): void {
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
    this.activeTreeOptions = [];
    this.messages = [
      {
        role: 'assistant',
        text: 'سلام، من دستیار هوشمند پلتفرم تحلیل داده هستم. ابتدا مشکل خود را با چند جمله توضیح دهید؛ بعد مرحله‌به‌مرحله حوزه و جزئیات را مشخص می‌کنم.'
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

  private answerFromFaqOrStartTicket(question: string, fromTree = false): void {
    this.typing = true;
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
        this.startTicketFlow(question);
      }

      this.typing = false;
      this.changeDetector.markForCheck();
      this.scrollToLatest();

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

  private startTicketFlow(problem: string): void {
    this.diagnosticDraft = {
      ...this.createEmptyDiagnostic(),
      problem,
      scenario: this.treeTrail.length ? this.treeTrail.join(' > ') : ''
    };
    this.diagnosticStep = 'title';
    this.messages.push({
      role: 'assistant',
      text: `در FAQ پاسخ قابل اتکا پیدا نشد. قبل از ثبت تیکت، مشخصات کامل مشکل را مرحله‌ای می‌گیرم.\n\n${this.diagnosticPrompts.title}`
    });
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
