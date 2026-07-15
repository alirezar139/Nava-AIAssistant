# پایگاه داده ArangoDB

## هدف

ArangoDB برای اجرای واقعی داده‌های عملیاتی و مدل گرافی درختواره راهبری استفاده می‌شود. اجرای پیش‌فرض پروژه همچنان با LowDB کار می‌کند تا توسعه محلی ساده بماند؛ اما وقتی `DB_PROVIDER=arango` تنظیم شود، API داده‌ها را از ArangoDB می‌خواند و در همان‌جا ذخیره می‌کند.

## محدوده داده‌ها

در حالت Arango، این بخش‌ها داخل دیتابیس `rahyar` نگهداری می‌شوند:

| Collection              | نوع      | کاربرد |
| ----------------------- | -------- | ------ |
| `users`                 | document | کاربران، نقش‌ها و hash رمز عبور. |
| `faqs`                  | document | پایگاه دانش و پاسخ‌های FAQ. |
| `conversations`         | document | گفتگوهای کاربر، نتیجه FAQ و امتیاز پاسخ. |
| `diagnostic_cases`      | document | پرونده‌های پشتیبانی، وضعیت سهند و امتیاز نهایی. |
| `external_services`     | document | سرویس‌های قابل تعریف توسط مدیر. |
| `settings`              | document | تنظیمات سرویس سهند و تنظیمات هر درختواره. |
| `troubleshooting_nodes` | document | نودهای درختواره هر پروژه. |
| `troubleshooting_edges` | edge     | ارتباط بین نودهای درختواره. |

## متغیرهای محیطی

| متغیر | پیش‌فرض | توضیح |
| ----- | ------- | ----- |
| `DB_PROVIDER` | `lowdb` | برای فعال‌سازی Arango مقدار `arango` قرار دهید. |
| `ARANGO_URL` | `http://127.0.0.1:8529` | آدرس HTTP سرور ArangoDB. |
| `ARANGO_DATABASE` | `rahyar` | نام دیتابیس برنامه. |
| `ARANGO_USERNAME` | `root` | نام کاربری اتصال. |
| `ARANGO_PASSWORD` | خالی | رمز اتصال. مقدار واقعی نباید commit شود. |
| `RAHYAR_DATA_DIR` | خالی | مسیر فایل LowDB برای fallback و seed اولیه. |
| `RAHYAR_DB_FILE` | `database.json` | نام فایل LowDB. |

## راه‌اندازی محلی

ابتدا مطمئن شوید ArangoDB روی پورت پیش‌فرض بالا است:

```powershell
Invoke-RestMethod http://127.0.0.1:8529/_api/version
```

اگر احراز هویت فعال باشد، پاسخ بدون credential ممکن است `401` باشد؛ این یعنی سرویس بالا است اما رمز لازم دارد.

برای ساخت دیتابیس، collectionها، indexها و seed اولیه:

```powershell
cd C:\angular\Nava-AIAssistant
$env:DB_PROVIDER = "arango"
$env:ARANGO_URL = "http://127.0.0.1:8529"
$env:ARANGO_DATABASE = "rahyar"
$env:ARANGO_USERNAME = "root"
$env:ARANGO_PASSWORD = "your-arango-password"
npm run db:arango:init
```

خروجی موفق شامل نام دیتابیس، نسخه Arango و شمارش collectionها است.

برای اجرای API روی Arango:

```powershell
$env:DB_PROVIDER = "arango"
$env:ARANGO_URL = "http://127.0.0.1:8529"
$env:ARANGO_DATABASE = "rahyar"
$env:ARANGO_USERNAME = "root"
$env:ARANGO_PASSWORD = "your-arango-password"
npm --prefix server run dev
```

بررسی سلامت API:

```powershell
Invoke-RestMethod http://127.0.0.1:3000/api/health
```

نمونه پاسخ:

```json
{
  "status": "ok",
  "storage": "arango",
  "arango": {
    "ok": true,
    "version": "3.12.9-4"
  }
}
```

## Seed اولیه

وقتی collectionها خالی باشند، داده‌های فعلی LowDB به Arango منتقل می‌شوند:

- کاربران آزمایشی `admin` و `user`
- FAQها
- گفتگوها
- پرونده‌های پشتیبانی
- سرویس‌های خارجی تعریف‌شده
- تنظیمات سهند

درختواره از `src/assets/troubleshooting-tree.json` یا داده فعلی LowDB خوانده می‌شود و در `troubleshooting_nodes` و `troubleshooting_edges` ذخیره می‌شود. این کار به‌صورت idempotent انجام می‌شود؛ اجرای مجدد bootstrap داده موجود را بی‌دلیل پاک نمی‌کند.

## ایندکس‌ها

ایندکس‌های اصلی هنگام bootstrap یا startup ساخته می‌شوند:

- `users.username` یکتا
- `users.id` یکتا
- `faqs.id` یکتا
- `faqs.category`
- `faqs.updatedAt`
- `conversations.id` یکتا
- `conversations.userId, conversations.createdAt`
- `diagnostic_cases.id` یکتا
- `diagnostic_cases.userId, diagnostic_cases.createdAt`
- `diagnostic_cases.treeNodeId`
- `diagnostic_cases.status, diagnostic_cases.createdAt`
- `external_services.id` یکتا
- `external_services.key` یکتا
- `troubleshooting_nodes.projectKey, troubleshooting_nodes.nodeId` یکتا
- `troubleshooting_nodes.projectKey, troubleshooting_nodes.sortOrder`
- `troubleshooting_edges.projectKey, troubleshooting_edges.sortOrder`
- `troubleshooting_edges.projectKey, troubleshooting_edges.from, troubleshooting_edges.to`

نکته: ایندکس قدیمی یکتای `nodeId` در صورت وجود حذف می‌شود، چون برای چند پروژه مستقل درست نیست. شناسه نود ممکن است در دو پروژه متفاوت تکرار شود؛ یکتایی باید با ترکیب `projectKey + nodeId` کنترل شود.

## مدل درختواره

نمونه نود:

```json
{
  "_key": "default_9",
  "projectKey": "default",
  "nodeId": "9",
  "id": "9",
  "text": "لطفا حوزه بروز مشکل خود را انتخاب نمایید.",
  "shape": "process",
  "x": 69.12,
  "y": 60.75,
  "sortOrder": 0
}
```

نمونه ارتباط:

```json
{
  "_key": "default_9_14_0",
  "_from": "troubleshooting_nodes/default_9",
  "_to": "troubleshooting_nodes/default_14",
  "projectKey": "default",
  "from": "9",
  "to": "14",
  "label": "نرم افزار",
  "sortOrder": 0
}
```

## قواعد نگهداری

- رمز Arango فقط در environment یا secret manager نگهداری شود.
- فایل‌های `.env` واقعی نباید commit شوند.
- قبل از deployment، `JWT_SECRET` و رمزهای آزمایشی تغییر کنند.
- برای هر پروژه، `projectKey` مستقل استفاده شود تا درختواره‌ها با هم تداخل نکنند.
- شناسه نودها پایدار بماند، چون برای نگاشت RequestType سهند استفاده می‌شود.
- اگر درختواره از فایل Visio، JSON، CSV یا Mermaid وارد شد، پس از تایید مدیر باید با دکمه ذخیره نهایی در Arango ثبت شود.
- عملیات CRUD از طریق API انجام شود؛ تغییر مستقیم collectionها فقط برای migration کنترل‌شده مجاز است.

## تست سریع

پس از راه‌اندازی API با Arango:

```powershell
Invoke-RestMethod http://127.0.0.1:3000/api/health
```

سپس با حساب مدیر وارد شوید و این بخش‌ها را بررسی کنید:

- مدیریت FAQ: خواندن، ایجاد، و حذف یک رکورد تستی
- مدیریت درختواره: خواندن نودها و ذخیره نسخه نهایی
- پیکربندی سرویس: ذخیره تنظیمات سهند
- گزارش کاربران: مشاهده گفتگوها و پرونده‌ها

اگر `storage` در health برابر `lowdb` بود، API با env درست اجرا نشده است.
