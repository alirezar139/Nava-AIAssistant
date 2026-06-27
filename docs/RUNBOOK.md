# راهنمای اجرای پروژه

## پیش‌نیازها

- Node.js نسخه ۲۰ یا جدیدتر
- npm
- دو پنجره PowerShell یا ترمینال VS Code

همه فرمان‌ها باید در پوشه زیر اجرا شوند:

```text
C:\project\nava-ai-assistant
```

## نصب اولیه

این مرحله فقط بار اول یا پس از تغییر وابستگی‌ها لازم است:

```powershell
cd C:\project\nava-ai-assistant
npm install
npm --prefix server install
```

## اجرای روزمره

### ۱. اجرای API

در ترمینال اول:

```powershell
cd C:\project\nava-ai-assistant
npm run start:api
```

API روی آدرس زیر در دسترس خواهد بود:

```text
http://127.0.0.1:3000/api/health
```

### ۲. اجرای رابط کاربری

در ترمینال دوم:

```powershell
cd C:\project\nava-ai-assistant
npm start
```

صفحه ورود:

```text
http://127.0.0.1:4200/login
```

هر دو ترمینال باید هنگام استفاده از سامانه باز بمانند. بستن هرکدام باعث توقف همان
سرویس می‌شود. برای توقف دستی نیز در ترمینال مربوطه `Ctrl+C` را بزنید.

## حساب‌های توسعه

| نقش | نام کاربری | رمز عبور |
| --- | --- | --- |
| مدیر | `admin` | `Admin@123` |
| کاربر | `user` | `User@123` |

این اطلاعات فقط برای محیط توسعه هستند و باید پیش از استقرار تغییر کنند.

## بررسی سلامت

در PowerShell:

```powershell
Invoke-RestMethod http://127.0.0.1:3000/api/health
Invoke-WebRequest http://127.0.0.1:4200 -UseBasicParsing
```

پاسخ API باید شامل `status: ok` و وضعیت فرانت‌اند باید `200` باشد.

## ساخت نسخه نهایی

```powershell
npm run format:check
npm run build:all
```

خروجی فرانت‌اند در `dist/nava-ai-assistant` و خروجی API در `server/dist` ساخته
می‌شود.

## خطاهای رایج

### صفحه باز نمی‌شود

مطمئن شوید هر دو ترمینال هنوز باز هستند و اجرای آن‌ها خطا نداده است.

### پورت اشغال است

پردازش استفاده‌کننده از پورت را پیدا کنید:

```powershell
Get-NetTCPConnection -LocalPort 4200,3000 -State Listen
```

### API در دسترس نیست

ابتدا `http://127.0.0.1:3000/api/health` را بررسی کنید. اگر پاسخ ندارد، فرمان
`npm run start:api` را دوباره اجرا کنید.

### تغییرات نمایش داده نمی‌شوند

صفحه را با `Ctrl+F5` بازنشانی کنید. در صورت توقف dev server، فرمان `npm start`
را دوباره اجرا کنید.
