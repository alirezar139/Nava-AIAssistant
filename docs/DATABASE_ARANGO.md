# پایگاه داده ArangoDB

## هدف

ArangoDB برای نگهداری درختواره عیب‌یابی و آماده‌سازی مسیر دیتابیس تولیدی اضافه
شده است. درختواره ذاتاً ساختار گراف دارد: هر گره یک مرحله، سؤال یا نتیجه است و
هر ارتباط یک انتخاب کاربر یا مسیر انتقال به مرحله بعد را نشان می‌دهد.

## وضعیت فعلی

| بخش                   | وضعیت                                                                                   |
| --------------------- | --------------------------------------------------------------------------------------- |
| اجرای پیش‌فرض         | `lowdb`، بدون نیاز به ArangoDB.                                                         |
| اجرای ArangoDB        | با `DB_PROVIDER=arango` فعال می‌شود.                                                    |
| درختواره عیب‌یابی     | از API خوانده می‌شود و در حالت Arango از graph برمی‌گردد.                               |
| Seed اولیه            | اگر graph خالی باشد، فایل `src/assets/troubleshooting-tree.json` خوانده و ذخیره می‌شود. |
| سایر داده‌های عملیاتی | فعلاً از repositoryهای LowDB-backed استفاده می‌کنند.                                    |

## متغیرهای محیطی

| متغیر             | پیش‌فرض                 | توضیح                                 |
| ----------------- | ----------------------- | ------------------------------------- |
| `DB_PROVIDER`     | `lowdb`                 | برای فعال‌سازی Arango مقدار `arango`. |
| `ARANGO_URL`      | `http://127.0.0.1:8529` | آدرس HTTP سرور ArangoDB.              |
| `ARANGO_DATABASE` | `rahyar`                | نام دیتابیس برنامه.                   |
| `ARANGO_USERNAME` | `root`                  | نام کاربری اتصال.                     |
| `ARANGO_PASSWORD` | خالی                    | رمز کاربر ArangoDB.                   |
| `RAHYAR_DATA_DIR` | `server/data`           | مسیر فایل LowDB در حالت fallback.     |
| `RAHYAR_DB_FILE`  | `database.json`         | نام فایل LowDB.                       |

## راه‌اندازی روی ویندوز

ابتدا مطمئن شوید ArangoDB واقعاً در حال اجرا است. آدرس پیش‌فرض پنل وب:

```text
http://127.0.0.1:8529
```

بررسی اتصال:

```powershell
Invoke-RestMethod http://127.0.0.1:8529/_api/version
```

اگر پاسخ نگرفتید، سرویس ArangoDB هنوز بالا نیست یا روی پورت دیگری اجرا شده است.

اجرای API با ArangoDB:

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

سلامت API:

```powershell
Invoke-RestMethod http://127.0.0.1:3000/api/health
```

پاسخ موفق در حالت Arango شامل `storage` و اطلاعات نسخه ArangoDB است:

```json
{
  "status": "ok",
  "storage": "arango",
  "arango": {
    "ok": true,
    "version": "3.x.x"
  }
}
```

## مدل گراف درختواره

| Collection              | نوع      | کاربرد                                |
| ----------------------- | -------- | ------------------------------------- |
| `troubleshooting_nodes` | document | گره‌های درختواره.                     |
| `troubleshooting_edges` | edge     | ارتباط بین گره‌ها و انتخاب‌های کاربر. |
| `settings`              | document | تنظیمات گراف، مثل `startNodeId`.      |

### نمونه گره

```json
{
  "_key": "9",
  "nodeId": "9",
  "id": "9",
  "text": "لطفا حوزه بروز مشکل خود را انتخاب نمایید.",
  "x": 69.12,
  "y": 60.75,
  "sortOrder": 0
}
```

### نمونه ارتباط

```json
{
  "_key": "9_14_0",
  "_from": "troubleshooting_nodes/9",
  "_to": "troubleshooting_nodes/14",
  "from": "9",
  "to": "14",
  "label": "نرم افزار",
  "sortOrder": 0
}
```

## API مرتبط

فرانت‌اند درختواره را از این مسیر می‌خواند:

```text
GET /api/troubleshooting-tree
```

در حالت `lowdb` خروجی از فایل JSON خوانده می‌شود. در حالت `arango`، اگر
collectionها خالی باشند، همان فایل JSON یک‌بار seed می‌شود و سپس پاسخ از Arango
برمی‌گردد.

## قواعد نگهداری

- شناسه گره‌ها باید پایدار بماند، چون برای نگاشت RequestType سهند استفاده
  می‌شوند.
- `_key` در Arango از شناسه گره ساخته می‌شود؛ از تغییر بی‌دلیل شناسه‌ها پرهیز
  شود.
- هر edge باید `_from` و `_to` معتبر داشته باشد.
- ترتیب نمایش گزینه‌ها با `sortOrder` کنترل می‌شود.
- اگر درختواره از پنل ادمین ویرایش شد، validation برای گره orphan، چرخه ناخواسته
  و مقصد نامعتبر لازم است.

## مسیر فایل‌های مالک

| فایل                                                                 | مسئولیت                                    |
| -------------------------------------------------------------------- | ------------------------------------------ |
| `server/src/database/arango.ts`                                      | اتصال، ساخت دیتابیس، collection و indexها. |
| `server/src/troubleshooting-tree/troubleshooting-tree.repository.ts` | خواندن و seed کردن graph درختواره.         |
| `server/src/troubleshooting-tree/troubleshooting-tree.routes.ts`     | endpoint خواندن درختواره.                  |
| `src/app/core/services/troubleshooting-tree.service.ts`              | دریافت درختواره از API و پیمایش سمت UI.    |
