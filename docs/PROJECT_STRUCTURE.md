# ساختار پوشه‌های پروژه

مسیر اصلی پروژه:

```text
C:\project\rahbari-assistant
```

## مسیرهای اصلی

| بخش                    | مسیر                                   |
| ---------------------- | -------------------------------------- |
| فرانت‌اند              | `C:\project\rahbari-assistant\src`     |
| کدهای Angular          | `src\app`                              |
| تنظیمات محیط           | `src\environments`                     |
| تصاویر و فایل‌های ثابت | `src\assets`                           |
| درختواره عیب‌یابی      | `src\assets\troubleshooting-tree.json` |
| بک‌اند و API           | `server`                               |
| دیتابیس محلی           | `server\data\database.json`            |
| مستندات                | `docs`                                 |
| خروجی Build            | `dist`                                 |

## ساختار فرانت‌اند

```text
src/app/
├── core/                 سرویس‌ها، مدل‌ها، Guardها و Interceptorها
├── features/
│   ├── auth/             ورود و احراز هویت
│   ├── admin/            پنل مدیریت FAQ و گزارش‌ها
│   └── assistant/        پنل کاربر و دستیار
├── shared/               کامپوننت‌های مشترک مانند لوگو و تنظیم تم
├── app.component.ts
├── app.config.ts
└── app.routes.ts
```

## ساختار بک‌اند

```text
server/
├── src/
│   ├── auth/             احراز هویت و CAPTCHA
│   ├── common/           نوع‌های مشترک
│   ├── config/           تنظیمات محیط اجرا
│   ├── conversations/    ثبت و گزارش گفتگوها
│   ├── database/         دسترسی به LowDB
│   ├── diagnostics/      ثبت پرونده، تحلیل اولیه و رسید تیکت
│   ├── faqs/             API مدیریت FAQ
│   ├── sahand/           اتصال اختیاری به API سهند
│   └── main.ts           نقطه شروع API
├── data/                 داده‌های محلی زمان اجرا
└── dist/                 خروجی Build بک‌اند
```

## پوشه‌های تولیدشده خودکار

پوشه‌های زیر بخشی از کد منبع نیستند و نباید دستی ویرایش شوند:

- `.angular/cache`: کش موقت Angular و Babel
- `node_modules`: وابستگی‌های نصب‌شده
- `dist`: خروجی Build
- `server/dist`: خروجی کامپایل API

فایل‌هایی با نام‌های طولانی مانند
`ff771f7e5e9434d3a32eff829fb656daa40e3736d350f284ef0cb2d4e4e80454.json`
در `.angular/cache` موقت هستند و با اجرای مجدد Build تغییر می‌کنند.
