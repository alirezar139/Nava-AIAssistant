# بسته استقرار Nava AI Assistant

این پوشه الگوی فایل‌های لازم برای اجرای نسخه build شده روی سرور ویندوز است.
خروجی نهایی با دستور `npm run release:webapp` ساخته می‌شود و داخل پوشه
`release/` قرار می‌گیرد.

## ساختار بسته

```text
nava-ai-assistant-webapp-YYYYMMDD-HHMMSS/
|-- dist/nava-ai-assistant/      خروجی Angular
|-- server/dist/                 خروجی کامپایل‌شده Express
|-- server/package.json          وابستگی‌های runtime بک‌اند
|-- server/package-lock.json     نسخه دقیق وابستگی‌ها
|-- .env.example                 نمونه تنظیمات محیطی
|-- install-dependencies.ps1     نصب وابستگی‌های production
|-- start-webapp.ps1             اجرای برنامه
`-- README.md                    راهنمای استقرار
```

## اجرای روی سرور

1. فایل zip ساخته‌شده در `release/` را روی سرور extract کنید.
2. Node.js نسخه ۲۰ یا جدیدتر روی سرور نصب باشد.
3. فایل `.env.example` را کنار همین فایل با نام `.env` کپی کنید و مقدارها را
   تنظیم کنید.
4. وابستگی‌های بک‌اند را نصب کنید:

```powershell
powershell -ExecutionPolicy Bypass -File .\install-dependencies.ps1
```

5. برنامه را اجرا کنید:

```powershell
powershell -ExecutionPolicy Bypass -File .\start-webapp.ps1
```

اگر `HOST=0.0.0.0` باشد، برنامه از شبکه سرور هم قابل دسترسی است. اگر فقط اجرای
محلی لازم است، `HOST=127.0.0.1` بگذارید.

## مسیرهای مهم

- صفحه برنامه: `http://SERVER_IP:3000/`
- سلامت API: `http://SERVER_IP:3000/api/health`
- داده runtime: `server/data/database.json`

پوشه `server/data` در اولین اجرای برنامه ساخته می‌شود و نباید بین نسخه‌های
جدید بدون backup حذف شود.
