# بسته استقرار نوا

این پوشه الگوی فایل‌های لازم برای اجرای نسخه build شده روی سرور ویندوز است.
خروجی نهایی با دستور `npm run release:webapp` ساخته می‌شود و داخل پوشه
`release/` قرار می‌گیرد.

## ساختار بسته

```text
nava-ai-assistant-webapp-YYYYMMDD-HHMMSS/
|-- dist/nava-ai-assistant/      خروجی Angular (شامل web.config برای IIS)
|-- server/dist/                 خروجی کامپایل‌شده Express
|-- server/prisma/               schema.prisma و migrations
|-- server/prisma.config.ts      تنظیمات CLI پریزما
|-- server/package.json          وابستگی‌های runtime بک‌اند
|-- server/package-lock.json     نسخه دقیق وابستگی‌ها
|-- .env.example                 نمونه تنظیمات محیطی
|-- install-dependencies.ps1     نصب وابستگی‌های بک‌اند + prisma generate
|-- apply-migrations.ps1         اعمال migration های پریزما روی دیتابیس
|-- start-webapp.ps1             اجرای دستی/تعاملی برنامه (بدون IIS)
|-- install-service.ps1          نصب بک‌اند به‌عنوان Windows Service با NSSM
|-- uninstall-service.ps1        حذف Windows Service
`-- README.md                    راهنمای استقرار
```

## پیش‌نیازها

- Node.js نسخه ۲۰ یا جدیدتر
- یک نمونه MySQL در دسترس (مثلاً از طریق XAMPP) با phpMyAdmin برای مدیریت
- برای هاست‌کردن زیر IIS: ماژول‌های **URL Rewrite** و **Application Request
  Routing (ARR)** روی IIS، و ابزار **NSSM** (https://nssm.cc) برای اجرای
  بک‌اند به‌عنوان Windows Service

## مراحل استقرار

1. فایل zip ساخته‌شده در `release/` را روی سرور extract کنید.
2. فایل `.env.example` را کنار همین فایل با نام `.env` کپی کنید و مقدارها
   (به‌خصوص `DATABASE_URL` و `JWT_SECRET`) را تنظیم کنید.
3. وابستگی‌های بک‌اند را نصب کنید (این مرحله `prisma generate` را هم روی همین
   ماشین اجرا می‌کند):

   ```powershell
   powershell -ExecutionPolicy Bypass -File .\install-dependencies.ps1
   ```

4. Migration های دیتابیس را روی MySQL هدف اعمال کنید:

   ```powershell
   powershell -ExecutionPolicy Bypass -File .\apply-migrations.ps1
   ```

5. برنامه را اجرا کنید — دو روش ممکن است:

   **الف) اجرای دستی/تعاملی (بدون IIS):**

   ```powershell
   powershell -ExecutionPolicy Bypass -File .\start-webapp.ps1
   ```

   آدرس برنامه: `http://HOST:PORT/` طبق مقدارهای `.env`.

   **ب) هاست دائمی زیر IIS (توصیه‌شده برای production):**

   ```powershell
   powershell -ExecutionPolicy Bypass -File .\install-service.ps1
   ```

   این اسکریپت بک‌اند را به‌عنوان Windows Service (با NSSM) نصب و اجرا می‌کند.
   سپس یک IIS Site با physical path به پوشه `dist/nava-ai-assistant`
   بسازید — فایل `web.config` همان‌جا از قبل موجود است و مسیرهای `/api/*` را
   به پورت بک‌اند (پیش‌فرض 4300) reverse-proxy می‌کند و بقیه مسیرها را برای
   مسیریابی سمت کلاینت Angular به `index.html` هدایت می‌کند.

## مسیرهای مهم

- صفحه برنامه (بدون IIS): `http://SERVER_IP:4300/`
- صفحه برنامه (با IIS): آدرس/پورت تنظیم‌شده روی IIS Site
- سلامت API: `.../api/health`
- داده‌ها در MySQL نگهداری می‌شوند؛ پشتیبان‌گیری از دیتابیس با ابزارهای
  استاندارد MySQL (mysqldump یا phpMyAdmin) انجام شود.
