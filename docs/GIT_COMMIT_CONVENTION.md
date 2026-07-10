# استاندارد پیام Commit

این پروژه از قالبی نزدیک به Conventional Commits استفاده می‌کند. قالب با فایل
راهنمای commit پروژه هماهنگ است و body می‌تواند bullet داشته باشد.

## قالب

```text
[emoji(optional)][type](optional scope): [subject]

[body(optional)]

[footer(optional)]
```

## قواعد Header

- emoji اختیاری است.
- `type` اجباری است.
- `scope` اختیاری است و داخل پرانتز نوشته می‌شود.
- `subject` باید در فرم دستوری و کوتاه باشد.
- حرف اول `subject` انگلیسی باید lowercase باشد.
- `subject` بهتر است حداکثر ۵۰ کاراکتر باشد.
- انتهای `subject` نقطه گذاشته نمی‌شود.
- شماره issue در صورت وجود انتهای subject و داخل پرانتز می‌آید.

مثال:

```text
feat(faq): add Excel import validation (#42)
```

## نوع‌های مجاز

| Type       | کاربرد                                  |
| ---------- | --------------------------------------- |
| `build`    | تغییر سیستم build یا وابستگی‌های خارجی. |
| `ci`       | تغییر تنظیمات و scriptهای CI.           |
| `docs`     | تغییر فقط در مستندات.                   |
| `feat`     | قابلیت جدید.                            |
| `fix`      | رفع باگ.                                |
| `perf`     | بهبود performance.                      |
| `refactor` | بازنویسی بدون تغییر رفتار یا قابلیت.    |
| `style`    | تغییرات ظاهری کد بدون تغییر رفتار.      |
| `test`     | افزودن یا اصلاح تست.                    |

scopeهای پیشنهادی:

- `assistant`
- `admin`
- `auth`
- `faq`
- `tickets`
- `theme`
- `api`
- `docs`
- `build`

## قواعد Body

- Body اختیاری است، اما برای تغییرات مهم توصیه می‌شود.
- طول هر خط حدود ۷۲ کاراکتر باشد.
- توضیح دهد چه چیزی تغییر کرده و چرا.
- جزئیات سطح پایین که از کد مشخص است تکرار نشود.
- بین header و body یک خط خالی باشد.
- بین پاراگراف‌ها و bulletهای بلند خط خالی باشد.
- bullet با `-` یا `*` مجاز است.

## قواعد Footer

برای تغییر ناسازگار:

```text
BREAKING CHANGE: describe the incompatible change
```

برای ارجاع به issue، PR یا Jira:

```text
PR Close: #45114, Resolves: #36173
See also: DOC-123, DOC-124
```

## مثال کامل

```text
feat(assistant): redesign support triage flow (#42)

- redesign the user assistant workspace with a clearer support layout

- add conversation step navigation so users can go back when they choose the
  wrong path

- auto-create Sahand tickets when FAQ triage has no reliable answer

Resolves: #42
```

## مثال برای مستندات

```text
docs(readme): update setup and release documentation (#43)

- add a global documentation index

- document API contracts, release checks, and environment variables

- align commit guidance with the project convention
```
