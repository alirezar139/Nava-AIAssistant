# سیاست امنیتی

## دامنه

این repository برای توسعه و اجرای داخلی Nava AI Assistant نگهداری می‌شود. قبل
از استقرار وسیع‌تر، hardening امنیتی باید کامل شود.

## قواعد داده حساس

- secret، API key، JWT secret یا credential تولیدی commit نشود.
- داده واقعی کاربران در فایل نمونه ذخیره نشود.
- stack trace یا پاسخ خام سامانه‌های بیرونی به کاربر نمایش داده نشود.
- secretهای زمان اجرا فقط از environment variable خوانده شوند.
- حساب‌های توسعه قبل از استفاده در محیط مشترک تغییر کنند.

## تنظیمات لازم

برای محیط غیرمحلی، `JWT_SECRET` قوی تنظیم شود:

```powershell
$env:JWT_SECRET = "replace-with-a-strong-secret"
```

اطلاعات اتصال سهند/Jira فقط از environment variable تنظیم شود:

```powershell
$env:SAHAND_TICKET_URL = "https://ticket.example.local/api"
$env:SAHAND_API_KEY = "replace-with-token"
```

## احراز هویت و دسترسی

- مسیرهای محافظت‌شده API باید `requireAuth` داشته باشند.
- مسیرهای فقط مدیر باید `requireAuth(['admin'])` داشته باشند.
- credential سهند/Jira نباید به مرورگر ارسال شود.
- حساب‌های پیش‌فرض نباید در محیط مشترک استفاده شوند.

## بررسی وابستگی‌ها

وقتی دسترسی registry وجود دارد:

```powershell
npm audit --omit=dev
npm --prefix server audit --omit=dev
```

نتیجه audit قبل از انتشار باید بررسی شود.

## گزارش مشکل امنیتی

در استفاده داخلی، مشکل امنیتی را به مالک پروژه یا مسئول پشتیبانی گزارش کنید و
این موارد را بنویسید:

- محیط درگیر
- مراحل بازتولید
- رفتار مورد انتظار
- رفتار مشاهده‌شده
- log یا trace id در صورت وجود

رمز عبور، token یا داده خصوصی کاربر را در گزارش ننویسید.

## موارد باقی‌مانده برای تولید

- اتصال SSO یا identity provider سازمانی.
- سیاست password و session.
- جایگزین تولیدی LowDB یا سیاست backup/restore.
- نیازمندی audit log.
- مدیریت secret در استقرار.
- سیاست rotation برای credential سهند/Jira.
