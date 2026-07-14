# راهنمای اجرا و عملیات

## هدف

این سند نصب، اجرا، بررسی سلامت، build و رفع خطاهای رایج راهیار را در
محیط توسعه ویندوز توضیح می‌دهد.

## پیش‌نیازها

- Node.js نسخه ۲۰ یا جدیدتر.
- npm.
- PowerShell یا ترمینال VS Code.
- ArangoDB در صورت اجرای پروژه با `DB_PROVIDER=arango`.
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

| متغیر                       | پیش‌فرض                 | توضیح                                         |
| --------------------------- | ----------------------- | --------------------------------------------- |
| `PORT`                      | `3000`                  | پورت API.                                     |
| `JWT_SECRET`                | مقدار محلی              | کلید امضای JWT. خارج از توسعه باید تغییر کند. |
| `DB_PROVIDER`               | `lowdb`                 | نوع ذخیره‌سازی. برای Arango مقدار `arango`.   |
| `RAHYAR_DATA_DIR`           | خالی                    | مسیر فایل LowDB در صورت نیاز به تغییر.        |
| `RAHYAR_DB_FILE`            | `database.json`         | نام فایل LowDB.                               |
| `ARANGO_URL`                | `http://127.0.0.1:8529` | آدرس ArangoDB.                                |
| `ARANGO_DATABASE`           | `rahyar`                | نام دیتابیس ArangoDB.                         |
| `ARANGO_USERNAME`           | `root`                  | نام کاربری ArangoDB.                          |
| `ARANGO_PASSWORD`           | خالی                    | رمز عبور ArangoDB.                            |
| `SAHAND_TICKET_URL`         | خالی                    | endpoint ثبت request در سهند.                 |
| `SAHAND_AUTHORIZATION`      | خالی                    | مقدار کامل هدر Authorization سهند.            |
| `SAHAND_AUTH_HEADER`        | خالی                    | مقدار هدر اضافی `Auth` برای سامانه مقصد.      |
| `SAHAND_USERNAME`           | خالی                    | نام کاربری سهند، اگر header آماده ندارید.     |
| `SAHAND_PASSWORD`           | خالی                    | رمز سهند، اگر header آماده ندارید.            |
| `SAHAND_SERVICE_DESK_ID`    | خالی                    | شناسه پروژه/Service Desk سهند.                |
| `SAHAND_REQUEST_TYPE_ID`    | خالی                    | شناسه RequestType سهند.                       |
| `SAHAND_RAISE_ON_BEHALF_OF` | خالی                    | کاربری که request از طرف او ثبت می‌شود.       |

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

## اجرای پروژه با ArangoDB

اجرای پیش‌فرض پروژه به ArangoDB نیاز ندارد. برای فعال‌سازی ArangoDB:

```powershell
cd C:\angular\Nava-AIAssistant
$env:DB_PROVIDER = "arango"
$env:ARANGO_URL = "http://127.0.0.1:8529"
$env:ARANGO_DATABASE = "rahyar"
$env:ARANGO_USERNAME = "root"
$env:ARANGO_PASSWORD = "your-arango-password"
npm --prefix server run build
node server/dist/main.js
```

قبل از اجرای API، اتصال ArangoDB را بررسی کنید:

```powershell
Invoke-RestMethod http://127.0.0.1:8529/_api/version
```

اگر این دستور پاسخ ندهد، ArangoDB نصب شده اما سرویس آن بالا نیست یا روی پورت
دیگری اجرا شده است. در حالت Arango، API هنگام startup دیتابیس و collectionهای
لازم را می‌سازد. درختواره از `GET /api/troubleshooting-tree` خوانده می‌شود و اگر
graph خالی باشد، فایل JSON فعلی به عنوان seed اولیه ذخیره می‌شود.

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

## کاتالوگ سرویس‌های سامانه

تب «سرویس‌ها» در پنل مدیریت برای تعریف سرویس‌های مستقل استفاده می‌شود؛ برای
نمونه سرویس ثبت درخواست، سرویس استعلام وضعیت یا هر endpoint داخلی دیگر که باید
از داخل راهیار اجرا شود.

برای هر سرویس این مقدارها ثبت می‌شود:

- کلید یکتا برای استفاده فنی و نگهداری.
- عنوان و هدف سرویس برای توضیح کاربرد.
- عنوان بخش نمایشی که در صفحه کاربر ساخته می‌شود.
- متد HTTP و آدرس سرویس مقصد.
- هدر `Authorization` و هدر اضافی `Auth` در صورت نیاز.
- هدرهای اضافه با قالب `Key: Value` در هر خط یا JSON object ساده.
- قالب بدنه درخواست.
- وضعیت فعال بودن سرویس.
- وضعیت نمایش سرویس در صفحه دستیار.

وقتی هر دو گزینه «فعال» و «نمایش در صفحه کاربر» روشن باشند، کاربر بعد از ورود
کارت همان سرویس را در پنل اطلاعات پشتیبانی می‌بیند و می‌تواند آن را اجرا کند.
اجرای سرویس از بک‌اند انجام می‌شود؛ بنابراین مقدارهای محرمانه سرویس در مرورگر
کاربر دیده نمی‌شوند.

در قالب بدنه می‌توان از این متغیرها استفاده کرد:

```text
{{username}}
{{fullName}}
{{userId}}
{{role}}
{{now}}
```

بعد از تغییر کد بک‌اند یا routeهای سرویس‌ها، اگر API از `server/dist` اجرا شده
باشد، باید دوباره build گرفته و سرور restart شود:

```powershell
npm --prefix server run build
node server/dist/main.js
```

## اجرای روزمره

### اجرای API

ترمینال اول:

```powershell
cd C:\angular\Nava-AIAssistant
npm run start:api
```

این فرمان API را در حالت watch اجرا می‌کند و برای توسعه معمولی مناسب است.

سلامت API:

```text
http://127.0.0.1:3000/api/health
```

### اجرای API از خروجی build شده

اگر روی ویندوز اجرای watch با خطای `spawn EPERM` از سمت `tsx` یا `esbuild`
متوقف شد، API را از خروجی TypeScript اجرا کنید. این روش برای تست دستی و دمو
پایدارتر است، اما بعد از هر تغییر در کد بک‌اند باید دوباره build گرفته شود.

ترمینال اول:

```powershell
cd C:\angular\Nava-AIAssistant
npm --prefix server run build
node server/dist/main.js
```

انتظار:

```text
API listening on http://127.0.0.1:3000
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

### اجرای تاییدشده در همین ماشین

در این محیط ویندوزی، مسیر تاییدشده برای بالا آوردن کامل پروژه این است:

1. بک‌اند را build و از `dist` اجرا کنید:

```powershell
cd C:\angular\Nava-AIAssistant
npm --prefix server run build
node server/dist/main.js
```

2. در ترمینال دوم Angular را اجرا کنید:

```powershell
cd C:\angular\Nava-AIAssistant
npm start
```

3. سلامت سرویس‌ها را بررسی کنید:

```powershell
Invoke-RestMethod http://127.0.0.1:3000/api/health
Invoke-WebRequest http://localhost:4200 -UseBasicParsing
```

خروجی قابل قبول:

- API مقدار `{"status":"ok"}` برگرداند.
- فرانت‌اند status code `200` بدهد.
- پورت `3000` برای API و پورت `4200` برای Angular در وضعیت `LISTENING` باشند.

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

PWA رابط کاربری راهیار را مثل یک اپ مستقل در Chrome یا Microsoft Edge نصب می‌کند.
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

4. بعد از نصب، راهیار از Start Menu و Taskbar مثل یک پنجره مستقل باز می‌شود.

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
8. تب ارزیابی عملکرد را باز کنید و KPI، قیف پشتیبانی و روند ۷ روزه را بررسی کنید.
9. تغییر تم، پالت، Paint color، dark mode و عکس پروفایل را تست کنید.
10. گزینه نصب PWA را در Chrome یا Edge بررسی کنید.

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

اگر لاگ API خطای زیر را نشان داد:

```text
Error [TransformError]: spawn EPERM
```

راهکار سریع برای ادامه کار:

```powershell
cd C:\angular\Nava-AIAssistant
npm --prefix server run build
node server/dist/main.js
```

این خطا معمولا از اجرای watcher/transformer در ویندوز یا محدودیت دسترسی پردازش
می‌آید. اجرای `dist` از `tsx` عبور می‌کند و برای تست پروژه کافی است.

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
- شبکه دستگاه بتواند دامنه سهند را resolve کند:

```powershell
Resolve-DnsName sahand.dbaco.ir
Test-NetConnection sahand.dbaco.ir -Port 443
```

اگر DNS خطا داد یا `TcpTestSucceeded` برابر `False` بود، باید VPN، DNS داخلی یا
آی‌پی سرویس سهند از سمت زیرساخت فراهم شود. تا قبل از حل شدن شبکه، کد ثبت تیکت
اجرا می‌شود اما درخواست واقعی به سهند نمی‌رسد.

بدون تنظیم اتصال خارجی، سامانه همچنان رسید داخلی پرونده را می‌سازد.
