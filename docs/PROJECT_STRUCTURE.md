# ساختار پروژه

## مسیر اصلی

مسیر workspace فعلی:

```text
C:\angular\Nava-AIAssistant
```

## چیدمان سطح بالا

| مسیر                        | کاربرد                                        |
| --------------------------- | --------------------------------------------- |
| `src`                       | سورس فرانت‌اند Angular.                       |
| `src/app`                   | کد اصلی برنامه Angular.                       |
| `src/assets`                | فایل‌های static و fallback درختواره عیب‌یابی. |
| `server`                    | سورس API با Express.                          |
| `server/data/database.json` | داده محلی LowDB.                              |
| `scripts`                   | اسکریپت‌های کمکی اجرا و عملیات.               |
| `deploy`                    | الگوی فایل‌های بسته استقرار.                  |
| `docs`                      | مستندات محصول، فنی، API و عملیات.             |
| `release`                   | بسته‌های zip و پوشه‌های آماده استقرار.        |
| `dist`                      | خروجی build فرانت‌اند.                        |
| `proxy.conf.json`           | proxy مسیرهای `/api` در اجرای توسعه.          |
| `.angular`                  | cache مربوط به Angular.                       |
| `node_modules`              | وابستگی‌های نصب‌شده.                          |

## ساختار فرانت‌اند

```text
src/app/
|-- core/
|   |-- models/       مدل‌های TypeScript مشترک
|   `-- services/     سرویس‌های برنامه
|-- features/
|   |-- auth/         ورود و احراز هویت
|   |-- admin/        مدیریت FAQ، گزارش‌ها و پرونده‌ها
|   `-- assistant/    دستیار پشتیبانی کاربر
|-- shared/           کامپوننت‌های مشترک
|-- app.component.ts
|-- app.config.ts
`-- app.routes.ts
```

قواعد مالکیت:

- `core` مالک سرویس‌ها و مدل‌های مشترک است.
- `features` مالک workflowهای route-level است.
- `shared` فقط اجزای نمایشی مشترک مثل لوگو و تنظیم تم را نگه می‌دارد.
- featureها می‌توانند از `core` و `shared` استفاده کنند.
- `core` نباید از featureها import کند.

## ساختار بک‌اند

```text
server/
|-- src/
|   |-- auth/             احراز هویت، CAPTCHA و JWT middleware
|   |-- common/           ابزارهای مشترک API
|   |-- config/           تنظیمات زمان اجرا
|   |-- conversations/    ثبت و گزارش گفتگو
|   |-- database/         LowDB، repositoryها، اتصال ArangoDB و seed data
|   |-- diagnostics/      پرونده تشخیصی و تحلیل تیکت
|   |-- faqs/             API مربوط به FAQ
|   |-- sahand/           اتصال اختیاری به سامانه تیکت
|   |-- services/         کاتالوگ سرویس‌های قابل تعریف
|   |-- settings/         تنظیمات قابل تغییر سامانه
|   |-- troubleshooting-tree/ API و repository درختواره عیب‌یابی
|   `-- main.ts           راه‌انداز Express
|-- data/                 داده محلی زمان اجرا
`-- dist/                 خروجی build بک‌اند
```

## مسیرهای تولیدشده

این مسیرها خروجی ابزارها هستند و نباید دستی ویرایش شوند:

- `.angular/cache`
- `node_modules`
- `dist`
- `server/dist`
- `release`

## فایل‌های مهم

| فایل                                                    | کاربرد                                       |
| ------------------------------------------------------- | -------------------------------------------- |
| `src/assets/troubleshooting-tree.json`                  | درخت تصمیم عیب‌یابی.                         |
| `src/manifest.webmanifest`                              | اطلاعات نصب PWA.                             |
| `src/nava-service-worker.js`                            | cache سبک فایل‌های رابط و fallback.          |
| `src/app/core/services/theme.service.ts`                | تنظیمات تم و avatar هر کاربر.                |
| `src/app/core/services/troubleshooting-tree.service.ts` | پیمایش درخت و تشخیص گره قابل نمایش.          |
| `src/app/features/assistant/pages/assistant-page/`      | workflow اصلی پشتیبانی کاربر.                |
| `src/app/features/admin/pages/admin-dashboard/`         | UI مدیریت FAQ، گزارش‌ها و پرونده‌ها.         |
| `scripts/package-webapp-release.ps1`                    | ساخت بسته zip قابل انتقال به سرور.           |
| `scripts/start-webapp-windows.ps1`                      | build در صورت نیاز و اجرای وب‌اپ روی ویندوز. |
| `server/src/diagnostics/diagnostic.routes.ts`           | endpointهای پرونده و تیکت.                   |
| `server/src/sahand/sahand-ticket.service.ts`            | ارسال اختیاری تیکت خارجی.                    |
| `server/src/services/service-catalog.routes.ts`         | API تعریف، تست و اجرای سرویس‌های سامانه.     |
| `server/src/settings/settings.routes.ts`                | API تنظیمات سرویس ثبت تیکت.                  |
| `server/src/database/arango.ts`                         | اتصال و schema دیتابیس ArangoDB.             |
| `server/src/troubleshooting-tree/`                      | API، seed و خواندن graph درختواره.           |

## بسته استقرار

برای گرفتن خروجی قابل انتقال به سرور، دستور زیر اجرا می‌شود:

```powershell
npm run release:webapp
```

این دستور build فرانت‌اند و بک‌اند را می‌سازد، سپس فقط فایل‌های لازم برای اجرا
را داخل `release/nava-ai-assistant-webapp-YYYYMMDD-HHMMSS` و یک فایل zip هم‌نام
قرار می‌دهد. این بسته شامل سورس خام، `node_modules`، cache ابزارها و داده
runtime نیست.

## مسیر مستندات

نقطه شروع مستندات:

```text
docs/README.md
```

`README.md` ریشه، نقطه ورود سریع پروژه است و پوشه `docs` جزئیات محصول، معماری،
API و عملیات را نگهداری می‌کند.
