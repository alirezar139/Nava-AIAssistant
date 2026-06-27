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
  private typingTimer?: ReturnType<typeof setTimeout>;

  private readonly diagnosticPrompts: Record<keyof DiagnosticPayload, string> = {
    problem: 'مشکل را با جزئیات بنویسید؛ دقیقا چه اتفاقی افتاده است؟',
    systemName: 'نام سامانه یا ابزار تحلیل داده‌ای که مشکل در آن رخ داده چیست؟',
    scenario: 'سناریو یا مسیر انجام کار را مرحله‌به‌مرحله بنویسید.',
    serialNumber: 'سریال، شناسه گزارش، کد رهگیری یا شماره درخواست را وارد کنید. اگر ندارید بنویسید: ندارم',
    evidence: 'متن خطا، لاگ، توضیح screenshot یا مستندات مرتبط را وارد کنید. اگر ندارید بنویسید: ندارم'
  };

  private readonly diagnosticFlow: Array<keyof DiagnosticPayload> = ['problem', 'systemName', 'scenario', 'serialNumber', 'evidence'];

  constructor(
    readonly auth: AuthService,
    private readonly api: ApiService,
    private readonly errorMessages: ErrorMessageService,
    private readonly searchService: FaqSearchService,
    private readonly wordReader: WordReaderService,
    private readonly router: Router,
    private readonly changeDetector: ChangeDetectorRef
  ) {}

  ngOnInit(): void {
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
  }

  get inputPlaceholder(): string {
    return this.diagnosticStep ? this.diagnosticPrompts[this.diagnosticStep] : 'مشکل یا سؤال خود را بنویسید...';
  }

  ask(): void {
    const question = this.question.trim();
    if (!question || this.typing) return;
    this.error = '';
    this.messages.push({ role: 'user', text: question });
    this.question = '';
    this.scrollToLatest();

    if (this.diagnosticStep) {
      this.captureDiagnosticAnswer(question);
      return;
    }

    this.typing = true;
    const rows = this.faqs.map((faq) => ({
      سؤال: faq.question,
      پاسخ: faq.answer,
      دسته‌بندی: faq.category,
      'کلمات کلیدی': faq.keywords
    }));
    const matches = this.searchService.search(rows, question);
    const answer =
      matches[0]?.text ??
      'پاسخ قطعی در پایگاه دانش پیدا نشد. برای بررسی دقیق‌تر، یک پرونده تحلیل مشکل می‌سازم و چند سؤال تکمیلی می‌پرسم.';
    const matchedFaq = matches[0] ? this.faqs.find((faq) => faq.answer === matches[0]?.text) : null;

    this.typingTimer = setTimeout(() => {
      this.messages.push(
        matches.length
          ? { role: 'assistant', text: 'پاسخ پیشنهادی بر اساس پایگاه دانش:', matches }
          : { role: 'assistant', text: `${answer}\n\n${this.diagnosticPrompts.problem}` }
      );
      if (!matches.length) {
        this.diagnosticDraft = this.createEmptyDiagnostic();
        this.diagnosticStep = 'problem';
      }
      this.typing = false;
      this.changeDetector.markForCheck();
      this.scrollToLatest();

      this.api.logConversation(question, answer, matchedFaq?.id ?? null).subscribe({
        error: (error: unknown) => {
          const resolved = this.errorMessages.resolve(error, 'ثبت گزارش گفت‌وگو انجام نشد.');
          this.error = `پاسخ نمایش داده شد، اما ${this.errorMessages.formatMessage(resolved)}`;
          this.changeDetector.markForCheck();
        }
      });
    }, 650);
  }

  private captureDiagnosticAnswer(value: string): void {
    const step = this.diagnosticStep;
    if (!step) return;
    this.diagnosticDraft = { ...this.diagnosticDraft, [step]: value };
    const nextStep = this.getNextDiagnosticStep(step);

    if (nextStep) {
      this.diagnosticStep = nextStep;
      this.pushAssistantMessage(this.diagnosticPrompts[nextStep]);
      return;
    }

    this.diagnosticStep = null;
    this.submitDiagnosticCase();
  }

  private submitDiagnosticCase(): void {
    this.typing = true;
    this.changeDetector.markForCheck();
    this.api.createDiagnosticCase(this.diagnosticDraft).subscribe({
      next: (createdCase) => {
        this.api.analyzeDiagnosticCase(createdCase.id).subscribe({
          next: (analyzedCase) => {
            const severityLabel = this.formatSeverity(analyzedCase.severity);
            this.messages.push({
              role: 'assistant',
              text: `پرونده بررسی #${analyzedCase.id} ثبت و تحلیل اولیه انجام شد.\nسطح اهمیت: ${severityLabel}\n${analyzedCase.analysisSummary ?? ''}\nپیشنهاد: ${analyzedCase.recommendation ?? '-'}`
            });
            this.typing = false;
            this.changeDetector.markForCheck();
            this.scrollToLatest();
          },
          error: (error: unknown) => this.handleDiagnosticError(error, 'پرونده ثبت شد، اما تحلیل اولیه انجام نشد.')
        });
      },
      error: (error: unknown) => this.handleDiagnosticError(error, 'ثبت پرونده بررسی انجام نشد.')
    });
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
    return { problem: '', systemName: '', scenario: '', serialNumber: '', evidence: '' };
  }

  private formatSeverity(severity: 'low' | 'medium' | 'high' | null): string {
    if (severity === 'high') return 'بالا - نیازمند ارجاع';
    if (severity === 'medium') return 'متوسط';
    return 'پایین';
  }

  private handleDiagnosticError(error: unknown, fallback: string): void {
    const resolved = this.errorMessages.resolve(error, fallback);
    this.messages.push({ role: 'assistant', text: this.errorMessages.formatMessage(resolved) });
    this.typing = false;
    this.changeDetector.markForCheck();
    this.scrollToLatest();
  }

  useExample(value: string): void {
    this.question = value;
  }

  rateMessage(message: ChatMessage, feedback: 'helpful' | 'unhelpful'): void {
    message.feedback = feedback;
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

  private scrollToLatest(): void {
    requestAnimationFrame(() => {
      const element = this.conversation?.nativeElement;
      if (element) element.scrollTo({ top: element.scrollHeight, behavior: 'smooth' });
    });
  }
}
