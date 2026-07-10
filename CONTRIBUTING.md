# راهنمای مشارکت

این پروژه یک سامانه داخلی پشتیبانی است. تغییرات باید روی صحت رفتار، خوانایی،
تجربه فارسی، امنیت و قابلیت نگهداری تمرکز داشته باشند.

## روند کار

1. شاخه خود را با شاخه مقصد sync کنید.
2. هر تغییر را محدود به یک هدف منطقی نگه دارید.
3. اگر رفتار، setup، API یا عملیات تغییر کرد، مستندات را هم به‌روز کنید.
4. قبل از تحویل، کنترل‌های کیفیت را اجرا کنید.
5. پیام commit را مطابق `docs/GIT_COMMIT_CONVENTION.md` بنویسید.

## نصب و اجرا

```powershell
npm install
npm --prefix server install
```

اجرای API:

```powershell
npm run start:api
```

اجرای فرانت‌اند:

```powershell
npm start
```

## کنترل کیفیت

قبل از commit یا تحویل:

```powershell
npm run format:check
npm run build:all
```

## پیام Commit

قالب:

```text
[emoji(optional)][type](optional scope): [subject]

[body(optional)]

[footer(optional)]
```

مثال:

```text
docs(readme): update setup instructions (#42)

- document local API and frontend startup commands

- add release verification notes
```

## چک‌لیست Pull Request

- کد format شده باشد.
- build پاس شود.
- تغییرات UI در چیدمان فارسی بررسی شده باشند.
- تغییرات API در `docs/API_REFERENCE.md` ثبت شده باشند.
- تغییرات عملیاتی در `docs/RUNBOOK.md` ثبت شده باشند.
- تغییر نیازمندی در `docs/REQUIREMENTS.md` و
  `docs/REQUIREMENTS_TRACEABILITY.md` ثبت شده باشد.
- هیچ secret یا credential واقعی commit نشده باشد.

## اصول بازبینی

- تغییرات کوچک و قابل review ترجیح دارند.
- مرز featureها حفظ شود.
- refactor نامرتبط انجام نشود.
- متن‌های قابل نمایش کوتاه، روشن و فارسی باشند.
- accessibility و رفتار keyboard خراب نشود.
