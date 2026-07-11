# راهنمای اجرا و عملیات

## هدف

این سند نصب، اجرا، بررسی سلامت، build و رفع خطاهای رایج Nava AI Assistant را در
محیط توسعه ویندوز توضیح می‌دهد.

## پیش‌نیازها

- Node.js نسخه ۲۰ یا جدیدتر.
- npm.
- PowerShell یا ترمینال VS Code.
- دو ترمینال برای اجرای روزمره فرانت‌اند و بک‌اند، یا یک ترمینال برای اجرای
  نسخه build شده وب‌اپ.

مسیر workspace فعلی:

```text
C:\angular\Nava-AIAssistant
```

## نصب اولیه

```powershell
cd C:\angular\Nava-AIAssistant
npm install
npm --prefix server install
```

بعد از تغییر وابستگی‌ها این مرحله را دوباره اجرا کنید.

## متغیرهای محیطی

| متغیر                       | پیش‌فرض    | توضیح                                         |
| --------------------------- | ---------- | --------------------------------------------- |
| `PORT`                      | `3000`     | پورت API.                                     |
| `JWT_SECRET`                | مقدار محلی | کلید امضای JWT. خارج از توسعه باید تغییر کند. |
| `SAHAND_TICKET_URL`         | خالی       | endpoint ثبت request در سهند.                 |
| `SAHAND_AUTHORIZATION`      | خالی       | مقدار کامل هدر Authorization سهند.            |
| `SAHAND_AUTH_HEADER`        | خالی       | مقدار هدر اضافی `Auth` برای سامانه مقصد.      |
| `SAHAND_USERNAME`           | خالی       | نام کاربری سهند، اگر header آماده ندارید.     |
| `SAHAND_PASSWORD`           | خالی       | رمز سهند، اگر header آماده ندارید.            |
| `SAHAND_SERVICE_DESK_ID`    | خالی       | شناسه پروژه/Service Desk سهند.                |
| `SAHAND_REQUEST_TYPE_ID`    | خالی       | شناسه RequestType سهند.                       |
| `SAHAND_RAISE_ON_BEHALF_OF` | خالی       | کاربری که request از طرف او ثبت می‌شود.       |

مثال:

```powershell
$env:JWT_SECRET = "replace-with-local-secret"
$env:SAHAND_TICKET_URL = "https://sahand.dbaco.ir/rest/servicedeskapi/request"
$env:SAHAND_AUTHORIZATION = "Basic replace-with-base64-credentials"
$env:SAHAND_AUTH_HEADER = ""
$env:SAHAND_SERVICE_DESK_ID = "107"
$env:SAHAND_REQUEST_TYPE_ID = "1185"
$env:SAHAND_RAISE_ON_BEHALF_OF = "z.malmir"
```

## پیکربندی سرویس ثبت تیکت

مدیر می‌تواند از پنل مدیریت، تب «پیکربندی سرویس»، این مقدارها را بدون تغییر کد
یا rebuild کردن برنامه تغییر دهد:

- آدرس سرویس ثبت تیکت
- هدر `Authorization`
- هدر اضافی `Auth`
- شناسه پروژه/Service Desk
- شناسه RequestType
- نگاشت Node درختواره به RequestType

مقدارهای ذخیره‌شده در پنل، روی مقدارهای env اولویت دارند.

برای نگاشت Node به نوع درخواست سهند، در فیلد «نگاشت Node به RequestType» هر خط
را با این قالب وارد کنید:

```text
nodeId | serviceDeskId | requestTypeId | عنوان اختیاری
```

اگر `serviceDeskId` برای یک Node همان مقدار عمومی پنل است، به جای آن `-` قرار
دهید یا قالب کوتاه `nodeId | requestTypeId` را وارد کنید. هنگام ثبت تیکت، ابتدا
نگاشت Node انتخاب‌شده بررسی می‌شود؛ اگر ردیفی پیدا نشد، مقدارهای عمومی پنل و سپس
env استفاده می‌شوند.

## اجرای روزمره

### اجرای API

ترمینال اول:

```powershell
cd C:\angular\Nava-AIAssistant
npm run start:api
```

سلامت API:

```text
http://127.0.0.1:3000/api/health
```

### اجرای فرانت‌اند

ترمینال دوم:

```powershell
cd C:\angular\Nava-AIAssistant
npm start
```

آدرس برنامه:

```text
http://localhost:4200/
```

در اجرای توسعه، Angular مسیرهای `/api` را با تنظیمات `proxy.conf.json` به
`http://127.0.0.1:3000` منتقل می‌کند. بنابراین API باید قبل از استفاده از
فرانت‌اند اجرا شده باشد.

تا زمان استفاده از برنامه، هر دو ترمینال باید باز بمانند. توقف سرویس با `Ctrl+C`
در همان ترمینال انجام می‌شود.

## اجرای وب‌اپ روی ویندوز

برای اجرای نسخه build شده روی ویندوز، یک ترمینال کافی است. ابتدا خروجی کامل را
بسازید:

```powershell
cd C:\angular\Nava-AIAssistant
npm run build:webapp
```

بعد وب‌اپ را اجرا کنید:

```powershell
npm run start:webapp
```

در این حالت Express هم API و هم فایل‌های Angular را از یک آدرس سرو می‌کند:

```text
http://127.0.0.1:3000/
```

اسکریپت آماده ویندوز همین روند را ساده می‌کند. اگر خروجی build وجود نداشته
باشد، اسکریپت خودش `npm run build:all` را اجرا می‌کند:

```powershell
npm run webapp:windows
```

برای تغییر پورت اجرای build شده:

```powershell
$env:PORT = "3100"
npm run webapp:windows
```

چون فرانت‌اند از مسیر نسبی `/api` استفاده می‌کند، در اجرای build شده نیازی به
تغییر آدرس API در کد نیست.

## نصب PWA در ویندوز

PWA رابط کاربری Nava را مثل یک اپ مستقل در Chrome یا Microsoft Edge نصب می‌کند.
بک‌اند همچنان باید با `npm run webapp:windows` یا یک سرویس ویندوزی روشن باشد.

مراحل:

1. وب‌اپ build شده را اجرا کنید:

```powershell
npm run webapp:windows
```

2. آدرس برنامه را در Chrome یا Microsoft Edge باز کنید:

```text
http://127.0.0.1:3000/
```

3. از منوی مرورگر گزینه نصب app را انتخاب کنید. در Edge معمولا مسیر
   `Apps > Install this site as an app` است.

4. بعد از نصب، Nava از Start Menu و Taskbar مثل یک پنجره مستقل باز می‌شود.

اگر گزینه نصب نمایش داده نشد:

- صفحه را یک بار با `Ctrl+F5` تازه‌سازی کنید.
- بررسی کنید `manifest.webmanifest` از آدرس
  `http://127.0.0.1:3000/manifest.webmanifest` باز شود.
- بررسی کنید `nava-service-worker.js` از آدرس
  `http://127.0.0.1:3000/nava-service-worker.js` باز شود.
- اگر قبلا نسخه قدیمی را نصب کرده‌اید، آن را uninstall و دوباره نصب کنید.

## حساب‌های توسعه

| نقش   | نام کاربری | رمز عبور    |
| ----- | ---------- | ----------- |
| مدیر  | `admin`    | `Admin@123` |
| کاربر | `user`     | `User@123`  |

این حساب‌ها فقط برای توسعه هستند.

## بررسی سلامت

```powershell
Invoke-RestMethod http://127.0.0.1:3000/api/health
Invoke-WebRequest http://localhost:4200 -UseBasicParsing
```

انتظار:

- API مقدار `status: ok` برگرداند.
- فرانت‌اند status code `200` بدهد.
- در اجرای وب‌اپ تولیدی، `Invoke-WebRequest http://127.0.0.1:3000 -UseBasicParsing`
  هم status code `200` بدهد.

## Build

```powershell
npm run format:check
npm run build:all
```

خروجی‌ها:

- فرانت‌اند: `dist/nava-ai-assistant`
- بک‌اند: `server/dist`

بعد از build، `server/dist/main.js` خروجی Angular را از مسیر
`dist/nava-ai-assistant` شناسایی می‌کند و در صورت وجود `index.html`، برنامه را
از همان پردازش Node سرو می‌کند.

## Smoke Test

بعد از اجرای هر دو سرویس:

1. با کاربر `user` وارد شوید.
2. یک گزینه عیب‌یابی انتخاب کنید.
3. دکمه برگشت به مرحله قبل را تست کنید.
4. شروع دوباره گفتگو را تست کنید.
5. یک مسیر حل‌نشده را طی کنید و ایجاد رسید تیکت را ببینید.
6. با مدیر `admin` وارد شوید.
7. صفحه FAQ، گزارش‌ها و پرونده‌ها را باز کنید.
8. تغییر تم، پالت، Paint color، dark mode و عکس پروفایل را تست کنید.
9. گزینه نصب PWA را در Chrome یا Edge بررسی کنید.

## خطاهای رایج

### فرانت‌اند باز نمی‌شود

بررسی کنید `npm start` هنوز اجراست و پورت `4200` listen می‌کند:

```powershell
Get-NetTCPConnection -LocalPort 4200 -State Listen
```

### API در دسترس نیست

بررسی کنید `npm run start:api` هنوز اجراست و پورت `3000` listen می‌کند:

```powershell
Get-NetTCPConnection -LocalPort 3000 -State Listen
```

### پورت اشغال است

پردازش مالک پورت را پیدا کنید:

```powershell
Get-NetTCPConnection -LocalPort 4200,3000 -State Listen
```

فقط پردازشی را متوقف کنید که متعلق به خودتان است و دیگر لازم ندارید.

### خطای `EPERM unlink dist` در build

این خطا معمولا یعنی dev server، مرورگر یا file watcher فایلی در `dist` را نگه
داشته است.

راهکار:

1. dev serverهای Angular و API را متوقف کنید.
2. ابزارهایی که ممکن است `dist` را خوانده باشند ببندید.
3. دوباره `npm run build:all` را اجرا کنید.

### تغییرات UI دیده نمی‌شود

با `Ctrl+F5` صفحه را refresh کنید. اگر dev server متوقف شده، دوباره
`npm start` را اجرا کنید.

### تیکت خارجی ساخته نمی‌شود

بررسی کنید:

- `SAHAND_TICKET_URL` تنظیم شده باشد.
- `SAHAND_AUTHORIZATION` یا `SAHAND_USERNAME` و `SAHAND_PASSWORD` معتبر باشند.
- اگر سامانه مقصد هدر `Auth` می‌خواهد، مقدار آن در پنل ادمین یا
  `SAHAND_AUTH_HEADER` تنظیم شده باشد.
- شناسه پروژه/Service Desk و شناسه RequestType با سهند هماهنگ باشند.
- برای مسیرهایی که RequestType جدا دارند، نگاشت Node در پنل ادمین ثبت شده باشد.
- لاگ API خطای network یا schema نشان ندهد.

بدون تنظیم اتصال خارجی، سامانه همچنان رسید داخلی پرونده را می‌سازد.
