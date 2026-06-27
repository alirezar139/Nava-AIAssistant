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
import { forkJoin } from 'rxjs';
import { ConversationRecord, FaqRecord } from '../../../../core/models/faq.models';
import { ApiService, FaqPayload } from '../../../../core/services/api.service';
import { AuthService } from '../../../../core/services/auth.service';
import { ExcelReaderService } from '../../../../core/services/excel-reader.service';
import { ErrorMessageService } from '../../../../core/services/error-message.service';
import { NotificationService } from '../../../../core/services/notification.service';
import { WordReaderService } from '../../../../core/services/word-reader.service';
import { ThemeToggleComponent } from '../../../../shared/components/theme-toggle/theme-toggle.component';
import { BrandLogoComponent } from '../../../../shared/components/brand-logo/brand-logo.component';
import { FaqImportMapperService } from '../../services/faq-import-mapper.service';

type PendingConfirmation =
  | { type: 'delete'; faq: FaqRecord }
  | { type: 'bulk-delete'; ids: number[] }
  | { type: 'import'; payload: FaqPayload[] };

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

  faqs: FaqRecord[] = [];
  conversations: ConversationRecord[] = [];
  activeTab: 'faqs' | 'reports' = 'faqs';
  editingId: number | null = null;
  form: FaqPayload = this.emptyForm();
  loading = true;
  saving = false;
  searchTerm = '';
  categoryFilter = '';
  pendingConfirmation: PendingConfirmation | null = null;
  selectedFaqIds = new Set<number>();

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
      const searchable = `${faq.question} ${faq.answer} ${faq.keywords}`.toLocaleLowerCase('fa');
      return matchesCategory && (!query || searchable.includes(query));
    });
  }

  get selectedCount(): number {
    return this.selectedFaqIds.size;
  }

  get allFilteredSelected(): boolean {
    return Boolean(this.filteredFaqs.length) && this.filteredFaqs.every((faq) => this.selectedFaqIds.has(faq.id));
  }

  get someFilteredSelected(): boolean {
    return this.filteredFaqs.some((faq) => this.selectedFaqIds.has(faq.id));
  }

  get confirmationTitle(): string {
    if (this.pendingConfirmation?.type === 'delete') return '??? FAQ';
    if (this.pendingConfirmation?.type === 'bulk-delete') return '??? ????? FAQ';
    return '???????? ?????? ????';
  }

  get confirmationText(): string {
    if (this.pendingConfirmation?.type === 'delete') {
      return `FAQ ?${this.pendingConfirmation.faq.question}? ???? ????? ??? ????`;
    }
    if (this.pendingConfirmation?.type === 'bulk-delete') {
      const count = this.pendingConfirmation.ids.length;
      return `${count.toLocaleString('fa-IR')} FAQ ?????????? ???? ????? ??? ?????`;
    }
    const count = this.pendingConfirmation?.payload.length ?? 0;
    return `${count.toLocaleString('fa-IR')} ???? ??????? FAQ??? ???? ?????`;
  }

  constructor(
    readonly auth: AuthService,
    private readonly api: ApiService,
    private readonly excelReader: ExcelReaderService,
    private readonly wordReader: WordReaderService,
    private readonly faqImportMapper: FaqImportMapperService,
    private readonly errorMessages: ErrorMessageService,
    private readonly notifications: NotificationService,
    private readonly router: Router,
    private readonly changeDetector: ChangeDetectorRef
  ) {}

  ngOnInit(): void {
    this.refresh();
  }

  refresh(showNotification = false): void {
    this.loading = true;
    forkJoin({ faqs: this.api.getFaqs(), conversations: this.api.getConversations() }).subscribe({
      next: ({ faqs, conversations }) => {
        this.faqs = faqs;
        this.conversations = conversations;
        this.loading = false;
        if (showNotification) {
          this.notifications.info('اطلاعات به‌روز شد', 'آخرین FAQها و گزارش‌های کاربران دریافت شدند.');
        }
        this.changeDetector.markForCheck();
      },
      error: (error: unknown) => this.showError(error, 'دریافت اطلاعات از سرور ممکن نبود.')
    });
  }

  saveFaq(): void {
    if (!this.form.question.trim() || !this.form.answer.trim()) {
      this.notifications.error('??????? ???? ???', '???? ????? FAQ? ???? ? ???? ?? ???? ????.');
      return;
    }
    this.saving = true;
    const editingId = this.editingId;
    const isEditing = editingId !== null;
    const request = isEditing ? this.api.updateFaq(editingId, this.form) : this.api.createFaq(this.form);
    request.subscribe({
      next: () => {
        this.resetForm();
        this.notifications.success(
          isEditing ? 'FAQ ??????????? ??' : 'FAQ ????? ??',
          isEditing ? '??????? ???? ? ???? ????? ??.' : '???? ? ???? ???? ?? ?????? ???? ????? ??.'
        );
        this.loadFaqs();
      },
      error: (error: unknown) => this.showError(error, '????? FAQ ????? ???.')
    });
  }

  editFaq(faq: FaqRecord): void {
    this.editingId = faq.id;
    this.form = {
      question: faq.question,
      answer: faq.answer,
      category: faq.category,
      keywords: faq.keywords
    };
    window.scrollTo({ top: 0, behavior: 'smooth' });
  }

  deleteFaq(faq: FaqRecord): void {
    this.pendingConfirmation = { type: 'delete', faq };
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

  resetForm(): void {
    this.form = this.emptyForm();
    this.editingId = null;
    this.saving = false;
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
        this.notifications.error('?????? ???? ????? ????', '???? ? ???? ???? ???? ?? ???? ???? ???.');
        return;
      }
      this.pendingConfirmation = { type: 'import', payload };
      this.changeDetector.markForCheck();
    } catch {
      this.notifications.error('?????? ???? ???? ????', '???? ???? Excel ?? ???? .xlsx ?? Word ?? ???? .docx ????.');
    }
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
          this.notifications.success('FAQ ??? ??', '???? ?????????? ?? ?????? ???? ??? ??.');
          this.loadFaqs();
        },
        error: (error: unknown) => this.showError(error, '??? FAQ ????? ???.')
      });
      return;
    }

    if (confirmation.type === 'bulk-delete') {
      this.api.deleteFaqs(confirmation.ids).subscribe({
        next: ({ count }) => {
          confirmation.ids.forEach((id) => this.selectedFaqIds.delete(id));
          this.notifications.success('FAQ?? ??? ????', `${count.toLocaleString('fa-IR')} ???? ?? ?????? ???? ??? ??.`);
          this.loadFaqs();
        },
        error: (error: unknown) => this.showError(error, '??? ????? FAQ ????? ???.')
      });
      return;
    }

    this.api.importFaqs(confirmation.payload).subscribe({
      next: ({ count }) => {
        this.selectedFaqIds.clear();
        this.notifications.success(
          '???? ???? ????? ??',
          `${count.toLocaleString('fa-IR')} FAQ ?? ?????? ???? ?????? ???? ??.`
        );
        this.loadFaqs();
      },
      error: (error: unknown) => this.showError(error, '???? ??????? ???? ????? ???.')
    });
  }

  cancelConfirmation(): void {
    this.pendingConfirmation = null;
  }

  private loadFaqs(): void {
    this.api.getFaqs().subscribe({
      next: (faqs) => {
        this.faqs = faqs;
        const existingIds = new Set(faqs.map((faq) => faq.id));
        this.selectedFaqIds.forEach((id) => {
          if (!existingIds.has(id)) this.selectedFaqIds.delete(id);
        });
        this.saving = false;
        this.changeDetector.markForCheck();
      },
      error: (error: unknown) => this.showError(error, 'به‌روزرسانی فهرست انجام نشد.')
    });
  }

  private emptyForm(): FaqPayload {
    return { question: '', answer: '', category: '', keywords: '' };
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
    this.saving = false;
    this.changeDetector.markForCheck();
  }
}
