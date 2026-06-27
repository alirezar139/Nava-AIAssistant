import { HttpErrorResponse } from '@angular/common/http';
import { Injectable } from '@angular/core';

interface ApiErrorBody {
  code?: string;
  message?: string;
  traceId?: string;
}

export interface UserFacingError {
  title: string;
  message: string;
  code?: string;
  traceId?: string;
}

@Injectable({ providedIn: 'root' })
export class ErrorMessageService {
  resolve(error: unknown, fallback = 'عملیات موردنظر انجام نشد.'): UserFacingError {
    if (!(error instanceof HttpErrorResponse)) {
      return { title: 'خطای غیرمنتظره', message: fallback };
    }

    const body = this.readBody(error.error);
    const serverMessage = body.message?.trim();
    const base = {
      code: body.code,
      traceId: body.traceId
    };

    if (error.status === 0) {
      return {
        ...base,
        title: 'ارتباط با سرور برقرار نیست',
        message: 'اتصال شبکه و فعال‌بودن API را بررسی کنید، سپس دوباره تلاش کنید.'
      };
    }

    if (error.status === 400) {
      return { ...base, title: 'اطلاعات نیاز به اصلاح دارد', message: serverMessage || fallback };
    }
    if (error.status === 401) {
      return {
        ...base,
        title: 'ورود نامعتبر است',
        message: serverMessage || 'دوباره وارد حساب کاربری شوید.'
      };
    }
    if (error.status === 403) {
      return {
        ...base,
        title: 'دسترسی مجاز نیست',
        message: serverMessage || 'برای این عملیات دسترسی کافی ندارید.'
      };
    }
    if (error.status === 404) {
      return {
        ...base,
        title: 'اطلاعات پیدا نشد',
        message: serverMessage || 'مورد درخواستی وجود ندارد یا حذف شده است.'
      };
    }
    if (error.status === 409) {
      return { ...base, title: 'تداخل اطلاعات', message: serverMessage || 'اطلاعات هم‌زمان تغییر کرده است.' };
    }
    if (error.status === 413) {
      return {
        ...base,
        title: 'حجم اطلاعات زیاد است',
        message: serverMessage || 'فایل یا درخواست ارسالی بیش از حد مجاز است.'
      };
    }
    if (error.status === 429) {
      return { ...base, title: 'تعداد درخواست زیاد است', message: 'کمی صبر کنید و دوباره تلاش کنید.' };
    }
    if (error.status >= 500) {
      return {
        ...base,
        title: 'خطای داخلی سامانه',
        message: serverMessage || 'سامانه قادر به تکمیل درخواست نبود. دوباره تلاش کنید.'
      };
    }

    return { ...base, title: 'عملیات ناموفق بود', message: serverMessage || fallback };
  }

  formatMessage(error: UserFacingError): string {
    return error.traceId ? `${error.message} (شناسه پیگیری: ${error.traceId})` : error.message;
  }

  private readBody(value: unknown): ApiErrorBody {
    return value && typeof value === 'object' ? (value as ApiErrorBody) : {};
  }
}
