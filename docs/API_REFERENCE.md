# مرجع API

## آدرس پایه

```text
http://127.0.0.1:3000/api
```

در اجرای build شده، همین API از همان host و port وب‌اپ سرو می‌شود. مقدار
پیش‌فرض فرانت‌اند در `src/environments/environment.ts` مسیر نسبی `/api` است.
در توسعه، `proxy.conf.json` این مسیر را به `http://127.0.0.1:3000` منتقل می‌کند.

## احراز هویت

مسیرهای محافظت‌شده به توکن Bearer نیاز دارند:

```http
Authorization: Bearer <jwt>
```

توکن از مسیر `POST /auth/login` دریافت می‌شود.

## قالب خطا

خطاهای جدید API باید تا حد امکان از این قالب پایدار پیروی کنند:

```json
{
  "code": "FAQ_NOT_FOUND",
  "message": "FAQ موردنظر پیدا نشد.",
  "traceId": "a1b2c3d4"
}
```

| فیلد      | توضیح                                  |
| --------- | -------------------------------------- |
| `code`    | شناسه پایدار برای استفاده در کد و تست. |
| `message` | پیام قابل نمایش به کاربر.              |
| `traceId` | شناسه پیگیری برای پشتیبانی و لاگ.      |

## سلامت سرویس

### `GET /health`

وضعیت سلامت API را برمی‌گرداند.

```json
{
  "status": "ok",
  "storage": "lowdb"
}
```

در حالت `DB_PROVIDER=arango`، پاسخ سلامت شامل وضعیت اتصال ArangoDB است:

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

## احراز هویت

### `GET /auth/captcha`

یک چالش CAPTCHA محلی ایجاد می‌کند.

| فیلد پاسخ  | نوع    | توضیح                     |
| ---------- | ------ | ------------------------- |
| `token`    | string | توکن CAPTCHA برای login.  |
| `question` | string | پرسش قابل نمایش به کاربر. |

### `POST /auth/login`

کاربر را احراز هویت می‌کند.

درخواست:

```json
{
  "username": "admin",
  "password": "Admin@123",
  "captchaToken": "uuid",
  "captchaAnswer": "12"
}
```

پاسخ:

```json
{
  "token": "jwt",
  "user": {
    "id": 1,
    "username": "admin",
    "fullName": "Admin User",
    "role": "admin"
  }
}
```

## FAQ

### `GET /faqs`

نقش مجاز: کاربر احراز هویت‌شده یا مدیر.

FAQها را بر اساس آخرین به‌روزرسانی برمی‌گرداند.

### `POST /faqs`

نقش مجاز: مدیر.

یک FAQ جدید ایجاد می‌کند.

| فیلد       | نوع    |
| ---------- | ------ |
| `question` | string |
| `answer`   | string |
| `category` | string |
| `keywords` | string |

### `POST /faqs/import`

نقش مجاز: مدیر.

داده‌های FAQ را با ردیف‌های import شده جایگزین می‌کند. تبدیل Excel به payload در
فرانت‌اند انجام می‌شود.

### `POST /faqs/bulk-delete`

نقش مجاز: مدیر.

چند FAQ را حذف می‌کند.

```json
{
  "ids": [1, 2, 3]
}
```

### `PUT /faqs/:id`

نقش مجاز: مدیر. FAQ مشخص‌شده را ویرایش می‌کند.

### `DELETE /faqs/:id`

نقش مجاز: مدیر. یک FAQ را حذف می‌کند.

## درختواره عیب‌یابی

### `GET /troubleshooting-tree`

نقش مجاز: عمومی در سطح API داخلی برنامه.

درختواره مرحله‌ای پشتیبانی را برمی‌گرداند. فرانت‌اند از این مسیر برای ساخت
گزینه‌های گفتگوی کاربر استفاده می‌کند.

```json
{
  "startNodeId": "9",
  "introNodeIds": ["1", "2"],
  "nodes": [
    {
      "id": "9",
      "text": "لطفا حوزه بروز مشکل خود را انتخاب نمایید.",
      "x": 69.12,
      "y": 60.75
    }
  ],
  "edges": [
    {
      "from": "9",
      "to": "14",
      "label": "نرم افزار"
    }
  ]
}
```

در حالت پیش‌فرض، داده از فایل fallback خوانده می‌شود. در حالت `DB_PROVIDER=arango`
داده از graph خوانده می‌شود و اگر graph خالی باشد، فایل fallback یک‌بار seed
می‌شود.

## گفتگوها

### `GET /conversations`

نقش مجاز: مدیر.

گزارش گفتگوها را همراه با اطلاعات کاربر برمی‌گرداند.

### `POST /conversations`

نقش مجاز: کاربر احراز هویت‌شده یا مدیر.

پرسش و پاسخ گفتگو را ثبت می‌کند.

```json
{
  "question": "چطور رمز عبور را بازیابی کنم؟",
  "answer": "از مسیر بازیابی رمز عبور استفاده کنید.",
  "matchedFaqId": 1
}
```

## پرونده‌های تشخیصی

### `GET /diagnostics`

نقش مجاز: مدیر.

پرونده‌های تشخیصی را همراه با اطلاعات کاربر برمی‌گرداند.

### `POST /diagnostics`

نقش مجاز: کاربر احراز هویت‌شده یا مدیر.

پرونده تشخیصی ایجاد می‌کند و در صورت تنظیم بودن اتصال خارجی، تیکت سهند/Jira را
هم ارسال می‌کند.

```json
{
  "title": "درخواست پشتیبانی - خطای جریان داده",
  "problem": "جریان انتخاب‌شده هنگام اجرا خطا می‌دهد.",
  "systemName": "پلتفرم تحلیل روابط",
  "processName": "اجرای جریان داده",
  "scenario": "مسیر انتخاب‌شده از درختواره",
  "serialNumber": "در دسترس نیست",
  "errorText": "متن خطای مشخصی وارد نشده است.",
  "evidence": "ثبت خودکار از صفحه کاربر",
  "treeNodeId": "node-123",
  "treeNodeText": "خطای اجرای جریان داده"
}
```

فیلدهای مهم پاسخ:

| فیلد                   | توضیح                                   |
| ---------------------- | --------------------------------------- |
| `id`                   | شناسه پرونده داخلی.                     |
| `externalTicketId`     | شماره تیکت سامانه مقصد، در صورت وجود.   |
| `externalTrackingId`   | شماره پیگیری سامانه مقصد، در صورت وجود. |
| `externalTicketStatus` | وضعیت ارسال به سامانه مقصد.             |

### `POST /diagnostics/:id/analyze`

نقش مجاز: کاربر احراز هویت‌شده یا مدیر.

تحلیل اولیه، سطح اهمیت و پیشنهاد پیگیری را به پرونده اضافه می‌کند.

## تنظیمات سامانه

### `GET /settings/ticket-service`

نقش مجاز: مدیر.

تنظیمات فعال سرویس ثبت تیکت خارجی را برمی‌گرداند.

```json
{
  "url": "https://sahand.dbaco.ir/rest/servicedeskapi/request",
  "authorizationHeader": "Basic replace-with-base64-credentials",
  "authHeader": "",
  "serviceDeskId": "107",
  "requestTypeId": "1185",
  "requestTypeMappings": [
    {
      "nodeId": "node-123",
      "nodeLabel": "خطای اجرای جریان داده",
      "serviceDeskId": "107",
      "requestTypeId": "1185"
    }
  ],
  "updatedAt": "2026-07-11T08:57:06.000Z"
}
```

### `PUT /settings/ticket-service`

نقش مجاز: مدیر.

آدرس سرویس، هدر `Authorization` و هدر اضافی `Auth` را برای ثبت تیکت خارجی ذخیره
می‌کند.

```json
{
  "url": "https://sahand.dbaco.ir/rest/servicedeskapi/request",
  "authorizationHeader": "Basic replace-with-base64-credentials",
  "authHeader": "",
  "serviceDeskId": "107",
  "requestTypeId": "1185",
  "requestTypeMappings": [
    {
      "nodeId": "node-123",
      "nodeLabel": "خطای اجرای جریان داده",
      "serviceDeskId": "107",
      "requestTypeId": "1185"
    }
  ]
}
```

## کاتالوگ سرویس‌ها

### `GET /services`

نقش مجاز: مدیر.

همه سرویس‌های تعریف‌شده را همراه با تنظیمات کامل مدیریتی برمی‌گرداند.

### `GET /services/active`

نقش مجاز: کاربر احراز هویت‌شده یا مدیر.

فقط سرویس‌هایی را برمی‌گرداند که `isActive` و `showInAssistant` باشند. مقدارهای
محرمانه مثل `authorizationHeader`، `authHeader`، `headersText` و `bodyTemplate`
در پاسخ این مسیر ارسال نمی‌شوند.

### `POST /services`

نقش مجاز: مدیر.

یک سرویس عملیاتی جدید ایجاد می‌کند.

```json
{
  "key": "sahand-ticket",
  "title": "ثبت درخواست سهند",
  "purpose": "ثبت درخواست در سامانه سهند برای مسیرهای حل‌نشده",
  "sectionTitle": "ثبت درخواست",
  "method": "POST",
  "url": "https://sahand.dbaco.ir/rest/servicedeskapi/request",
  "authorizationHeader": "Basic replace-with-base64-credentials",
  "authHeader": "",
  "headersText": "X-System: Rahyar",
  "bodyTemplate": "{ \"username\": \"{{username}}\", \"fullName\": \"{{fullName}}\" }",
  "isActive": true,
  "showInAssistant": true
}
```

فیلد `headersText` هم قالب خطی `Key: Value` و هم JSON object ساده را می‌پذیرد.
قالب بدنه قبل از اجرا در بک‌اند با متغیرهای `username`، `fullName`، `userId`،
`role` و `now` پر می‌شود.

### `PUT /services/:id`

نقش مجاز: مدیر.

سرویس مشخص‌شده را با همان payload مسیر ایجاد سرویس ویرایش می‌کند. کلید سرویس
باید بین سرویس‌ها یکتا باشد.

### `DELETE /services/:id`

نقش مجاز: مدیر.

سرویس مشخص‌شده را حذف می‌کند.

### `POST /services/:id/test`

نقش مجاز: مدیر.

سرویس را با context کاربر مدیر اجرا می‌کند و نتیجه HTTP، زمان اجرا و پیش‌نمایش
پاسخ را برمی‌گرداند.

### `POST /services/:id/run`

نقش مجاز: کاربر احراز هویت‌شده یا مدیر.

فقط سرویس فعال و قابل نمایش در دستیار را اجرا می‌کند.

پاسخ نمونه اجرای سرویس:

```json
{
  "ok": true,
  "status": 200,
  "statusText": "OK",
  "durationMs": 248,
  "bodyPreview": "{\"id\":\"REQ-123\"}",
  "executedAt": "2026-07-14T08:30:00.000Z"
}
```

## نکات اتصال سهند/Jira

- پنل ادمین بخش «پیکربندی سرویس» مقدارهای فعال را در دیتابیس داخلی ذخیره می‌کند.
- تنظیمات پنل برای آدرس سرویس، هدر `Authorization`، هدر `Auth`، شناسه پروژه و
  شناسه RequestType نسبت به env اولویت دارند.
- اگر `treeNodeId` پرونده با یک ردیف `requestTypeMappings` برابر باشد، همان
  `serviceDeskId` و `requestTypeId` برای ارسال سهند استفاده می‌شود. اگر برای
  آن Node نگاشت ثبت نشده باشد، مقدارهای عمومی پنل و سپس env استفاده می‌شوند.
- پنل مدیریت برای ورود نگاشت‌ها قالب کامل `nodeId | serviceDeskId | requestTypeId`
  و قالب کوتاه `nodeId | requestTypeId` را می‌پذیرد.
- `SAHAND_TICKET_URL` مقدار پیش‌فرض ارسال خارجی تیکت است.
- `SAHAND_AUTHORIZATION` مقدار کامل هدر Authorization سهند است؛ برای نمونه
  `Basic replace-with-base64-credentials`.
- `SAHAND_AUTH_HEADER` مقدار پیش‌فرض هدر اضافی `Auth` است.
- اگر header آماده ندارید، می‌توانید `SAHAND_USERNAME` و `SAHAND_PASSWORD` را
  تنظیم کنید تا هدر Basic ساخته شود.
- `SAHAND_SERVICE_DESK_ID` شناسه پروژه/Service Desk و `SAHAND_REQUEST_TYPE_ID`
  شناسه RequestType است.
- `SAHAND_RAISE_ON_BEHALF_OF` در صورت تنظیم بودن در payload ارسال می‌شود.
- بدون تنظیم اتصال خارجی، پرونده داخلی و رسید محلی همچنان ساخته می‌شود.
- پاسخ سامانه مقصد برای فیلدهای رایج ticket و tracking تفسیر می‌شود.
