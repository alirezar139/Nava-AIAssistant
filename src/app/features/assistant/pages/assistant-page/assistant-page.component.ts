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
import { ChatMessage, FaqRecord } from '../../../../core/models/faq.models';
import { ApiService } from '../../../../core/services/api.service';
import { AuthService } from '../../../../core/services/auth.service';
import { ErrorMessageService } from '../../../../core/services/error-message.service';
import { FaqSearchService } from '../../../../core/services/faq-search.service';
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
  private typingTimer?: ReturnType<typeof setTimeout>;

  constructor(
    readonly auth: AuthService,
    private readonly api: ApiService,
    private readonly errorMessages: ErrorMessageService,
    private readonly searchService: FaqSearchService,
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

  ask(): void {
    const question = this.question.trim();
    if (!question || this.typing) return;
    this.error = '';
    this.messages.push({ role: 'user', text: question });
    this.question = '';
    this.typing = true;
    this.scrollToLatest();

    const rows = this.faqs.map((faq) => ({
      سؤال: faq.question,
      پاسخ: faq.answer,
      دسته‌بندی: faq.category,
      'کلمات کلیدی': faq.keywords
    }));
    const matches = this.searchService.search(rows, question);
    const answer =
      matches[0]?.text ?? 'پاسخ مرتبطی در پایگاه دانش پیدا نشد. درخواست شما برای بررسی مدیر ثبت شد.';
    const matchedFaq = matches[0] ? this.faqs.find((faq) => faq.answer === matches[0]?.text) : null;

    this.typingTimer = setTimeout(() => {
      this.messages.push(
        matches.length
          ? { role: 'assistant', text: 'پاسخ پیشنهادی بر اساس پایگاه دانش:', matches }
          : { role: 'assistant', text: answer }
      );
      this.typing = false;
      this.changeDetector.markForCheck();
      this.scrollToLatest();

      this.api.logConversation(question, answer, matchedFaq?.id ?? null).subscribe({
        error: (error: unknown) => {
          const resolved = this.errorMessages.resolve(error, 'ثبت گزارش گفتگو انجام نشد.');
          this.error = `پاسخ نمایش داده شد، اما ${this.errorMessages.formatMessage(resolved)}`;
          this.changeDetector.markForCheck();
        }
      });
    }, 650);
  }

  useExample(value: string): void {
    this.question = value;
  }

  rateMessage(message: ChatMessage, feedback: 'helpful' | 'unhelpful'): void {
    message.feedback = feedback;
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
