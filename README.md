# Nava AI Assistant

وب‌اپ فارسی و راست‌چین برای مدیریت FAQ و پاسخ‌گویی به کاربران. فرانت‌اند با Angular،
API با Express و ذخیره‌سازی محلی با LowDB پیاده‌سازی شده است.

## اجرای پروژه

```powershell
npm install
npm --prefix server install
```

بک‌اند و فرانت‌اند را در دو ترمینال اجرا کنید:

ترمینال اول، API:

```powershell
npm run start:api
```

ترمینال دوم، رابط کاربری:

```powershell
npm start
```

سپس آدرس `http://127.0.0.1:4200/login` را باز کنید. راهنمای کامل اجرا و رفع خطاها
در `docs/RUNBOOK.md` قرار دارد.

## حساب‌های اولیه

- مدیر: `admin` با رمز `Admin@123`
- کاربر: `user` با رمز `User@123`

رمزهای اولیه و مقدار `JWT_SECRET` باید پیش از استقرار واقعی تغییر کنند.

## کیفیت کد

- معماری: `docs/ARCHITECTURE.md`
- استانداردهای کدنویسی: `docs/CODING_STANDARDS.md`
- نیازمندی‌های سامانه: `docs/REQUIREMENTS.md`
- ماتریس ردیابی نیازمندی‌ها: `docs/REQUIREMENTS_TRACEABILITY.md`
- استاندارد پیام‌های Commit: `docs/GIT_COMMIT_CONVENTION.md`
- راهنمای اجرا و رفع خطا: `docs/RUNBOOK.md`
- ساختار پوشه‌های پروژه: `docs/PROJECT_STRUCTURE.md`
- استاندارد مدیریت خطا: `docs/ERROR_HANDLING.md`

## ساختار فایل Excel

- ردیف اول باید شامل نام ستون‌ها باشد.
- برنامه همه ستون‌ها را جست‌وجو می‌کند.
- ستون‌های `سؤال`، `عنوان`، `موضوع` و `نام سامانه` برای عنوان نتیجه مناسب‌اند.
- ستون‌های `پاسخ`، `جواب`، `راهکار`، `توضیحات` و `شرح` به‌عنوان متن پاسخ شناسایی می‌شوند.
- فرمت قابل قبول: `xlsx`.
