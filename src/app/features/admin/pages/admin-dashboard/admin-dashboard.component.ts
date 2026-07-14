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
import { DiagnosticCaseRecord } from '../../../../core/models/diagnostic.models';
import { ConversationRecord, FaqRecord } from '../../../../core/models/faq.models';
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

type PendingConfirmation =
  | { type: 'delete'; faq: FaqRecord }
  | { type: 'delete-service'; service: ExternalServiceRecord }
  | { type: 'bulk-delete'; ids: number[] }
  | { type: 'import'; payload: FaqPayload[] };

type AdminTab = 'faqs' | 'reports' | 'performance' | 'settings' | 'services';

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
  diagnosticCases: DiagnosticCaseRecord[] = [];
  externalServices: ExternalServiceRecord[] = [];
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
  saving = false;
  settingsSaving = false;
  searchTerm = '';
  reportSearchTerm = '';
  categoryFilter = '';
  currentPage = 1;
  pageSize = 10;
  readonly pageSizeOptions = [10, 20, 50];
  readonly serviceMethods: ExternalServiceMethod[] = ['GET', 'POST', 'PUT', 'PATCH', 'DELETE'];
  pendingConfirmation: PendingConfirmation | null = null;
  selectedFaqIds = new Set<number>();

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
    forkJoin({
      faqs: this.api.getFaqs(),
      conversations: this.api.getConversations(),
      diagnosticCases: this.api.getDiagnosticCases(),
      externalServices: this.api.getExternalServices(),
      ticketServiceSettings: this.api.getTicketServiceSettings()
    }).subscribe({
      next: ({ faqs, conversations, diagnosticCases, externalServices, ticketServiceSettings }) => {
        this.faqs = faqs;
        this.conversations = conversations;
        this.diagnosticCases = diagnosticCases;
        this.externalServices = externalServices;
        this.ticketServiceSettings = ticketServiceSettings;
        this.ticketServiceForm = {
          url: ticketServiceSettings.url,
          authorizationHeader: ticketServiceSettings.authorizationHeader,
          authHeader: ticketServiceSettings.authHeader,
          serviceDeskId: ticketServiceSettings.serviceDeskId,
          requestTypeId: ticketServiceSettings.requestTypeId,
          requestTypeMappings: ticketServiceSettings.requestTypeMappings
        };
        this.requestTypeMappingsText = this.formatRequestTypeMappings(
          ticketServiceSettings.requestTypeMappings
        );
        this.normalizePaginationPage();
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
        this.loadExternalServices();
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
          this.loadExternalServices();
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

  private loadFaqs(): void {
    this.api.getFaqs().subscribe({
      next: (faqs) => {
        this.faqs = faqs;
        const existingIds = new Set(faqs.map((faq) => faq.id));
        this.selectedFaqIds.forEach((id) => {
          if (!existingIds.has(id)) this.selectedFaqIds.delete(id);
        });
        this.normalizePaginationPage();
        this.saving = false;
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

  private loadExternalServices(): void {
    this.api.getExternalServices().subscribe({
      next: (services) => {
        this.externalServices = services;
        this.settingsSaving = false;
        this.serviceTestingId = null;
        this.changeDetector.markForCheck();
      },
      error: (error: unknown) => this.showError(error, 'به‌روزرسانی سرویس‌ها انجام نشد.')
    });
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
    this.saving = false;
    this.settingsSaving = false;
    this.serviceTestingId = null;
    this.changeDetector.markForCheck();
  }
}
