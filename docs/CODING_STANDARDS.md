# استانداردهای کدنویسی

## اصول عمومی

- TypeScript و Angular templates همیشه در حالت `strict` باقی می‌مانند.
- هر فایل فقط یک مسئولیت اصلی دارد؛ منطق دامنه داخل component نوشته نمی‌شود.
- وابستگی‌ها از `features` به `core` مجازند، اما `core` نباید به feature وابسته شود.
- مقادیر محیطی مانند آدرس API فقط از `environment` یا تنظیمات سرور خوانده می‌شوند.
- خطاهای HTTP و هدر احراز هویت به‌صورت مرکزی در interceptor مدیریت می‌شوند.

## نام‌گذاری

- کلاس‌ها و typeها: `PascalCase`
- متغیرها، توابع و propertyها: `camelCase`
- فایل‌ها و پوشه‌ها: `kebab-case`
- Observableها باید نوع خروجی صریح داشته باشند.

## رابط کاربری

- کامپوننت‌ها از `ChangeDetectionStrategy.OnPush` استفاده می‌کنند.
- برای کارهای غیرنمایشی سرویس مستقل ساخته می‌شود.
- عناصر تعاملی باید label، focus state و متن خطای قابل دسترس داشته باشند.
- انیمیشن‌ها باید با `prefers-reduced-motion` سازگار باشند.

## بررسی قبل از تحویل

```bash
npm run format:check
npm run build:all
npm audit --omit=dev
```

قالب‌بندی دستی ملاک نیست؛ فرمان `npm run format` منبع نهایی فرمت پروژه است.
