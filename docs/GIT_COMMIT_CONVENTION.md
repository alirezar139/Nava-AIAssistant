# Git Commit Message Convention

پیام‌های Commit این پروژه از قالب زیر پیروی می‌کنند:

```text
[emoji(optional)][type](optional scope): [subject]

[body(optional)]

[footer(optional)]
```

## Header

نوع Commit یکی از مقادیر زیر است:

| Type | کاربرد |
| --- | --- |
| `build` | تغییرات سیستم Build یا وابستگی‌های خارجی |
| `ci` | تغییرات تنظیمات و اسکریپت‌های CI |
| `docs` | تغییرات مستندات |
| `feat` | افزودن قابلیت جدید |
| `fix` | رفع اشکال |
| `perf` | بهبود عملکرد |
| `refactor` | بازنویسی بدون افزودن قابلیت یا رفع اشکال |
| `style` | تغییرات ظاهری کد بدون تغییر رفتار |
| `test` | افزودن یا اصلاح آزمون‌ها |

- ایموجی ابتدای Header اختیاری است.
- `scope` بعد از نوع و داخل پرانتز نوشته می‌شود؛ مانند `auth`، `faq` یا `assistant`.
- عنوان حداکثر ۵۰ کاراکتر دارد.
- اولین حرف عنوان انگلیسی کوچک است.
- عنوان با فعل امری نوشته می‌شود.
- شماره Issue در انتهای عنوان و داخل پرانتز قرار می‌گیرد.
- عنوان با نقطه تمام نمی‌شود.

```text
feat(faq): add Excel import validation (#42)
```

## Body

- هر خط حداکثر ۷۲ کاراکتر دارد.
- دلیل و نتیجه تغییر را توضیح می‌دهد؛ جزئیات پیاده‌سازی ضروری نیست.
- Header و Body با یک خط خالی جدا می‌شوند.
- پاراگراف‌ها با خط خالی از یکدیگر جدا می‌شوند.
- استفاده از فهرست با `-` یا `*` مجاز است.

## Footer

تغییرات ناسازگار با نسخه‌های قبلی با عبارت زیر شروع می‌شوند:

```text
BREAKING CHANGE: describe the incompatible change
```

ارجاع به سامانه مدیریت کار یا Pull Request نیز در Footer نوشته می‌شود:

```text
PR Close: #45114, Resolves: #36173
See also: DOC-123, DOC-124
```

## Full Example

```text
feat(faq): add Excel column validation (#42)

Reject files that do not contain the required question and answer
columns. This prevents incomplete records from entering the database.

- show a clear validation message
- keep previously imported FAQs unchanged

Resolves: #42
```

