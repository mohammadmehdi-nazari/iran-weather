# سامانه نمایش آب‌وهوای ایران 🌤️

یک وب‌سایت مدرن و Responsive برای نمایش وضعیت آب‌وهوای شهرهای ایران، با نقشه تعاملی، رنگ‌آمیزی استان‌ها بر اساس وضعیت آب‌وهوا، و جستجوی شهر.

## تکنولوژی‌ها

- **Backend:** Python + Flask + Flask-Caching
- **Frontend:** HTML5 + CSS3 + JavaScript خالص (Vanilla JS)
- **نقشه:** SVG مبتنی بر مرز واقعی استان‌ها (منبع: [geoBoundaries](https://www.geoboundaries.org))
- **API آب‌وهوا:** [WeatherAPI.com](https://www.weatherapi.com)

## پیش‌نیازها

- Python 3.10 یا بالاتر (نصب‌شده و در PATH ویندوز)
- اتصال به اینترنت
- یک ویرایشگر مثل VS Code

## نصب پروژه (Windows / PowerShell)

### ۱. کلون یا دانلود پروژه
پروژه را در مسیر دلخواه (مثلاً Desktop) قرار دهید.

### ۲. ساخت و فعال‌سازی محیط مجازی

```powershell
cd iran-weather
python -m venv venv
.\venv\Scripts\Activate.ps1
```

> اگر خطای Execution Policy گرفتید:
> ```powershell
> Set-ExecutionPolicy -ExecutionPolicy RemoteSigned -Scope CurrentUser
> ```

### ۳. نصب کتابخانه‌ها

```powershell
pip install -r requirements.txt
```

### ۴. تنظیم API Key

1. یک حساب رایگان در [weatherapi.com/signup.aspx](https://www.weatherapi.com/signup.aspx) بسازید.
2. کلید API خود را از Dashboard کپی کنید.
3. فایل `.env` را باز کرده و مقدار زیر را با کلید خودتان جایگزین کنید:
b9ad90348fdb46debf8114341262808

### ۵. اجرای Backend

```powershell
python app.py
```

### ۶. باز کردن سایت

مرورگر را باز کرده و به آدرس زیر بروید: 
http://127.0.0.1:5000/
 
## ساختار پروژه
iran-weather/
├── app.py # Backend اصلی Flask
├── requirements.txt
├── .env # کلید API (در Git قرار نمی‌گیرد)
├── .env.example
├── .gitignore
├── templates/
│ └── index.html
├── static/
│ ├── css/style.css
│ ├── js/app.js
│ └── assets/iran_map_paths.json # مسیرهای SVG استان‌ها
└── data/
├── iran_provinces.json # داده استان‌ها و شهرها
├── iran_boundaries.geojson # مرز خام استان‌ها (منبع geoBoundaries)
└── build_map_paths.py # اسکریپت تبدیل GeoJSON به SVG

## مشکلات احتمالی

| مشکل | راه‌حل |
|---|---|
| نقشه نمایش داده نمی‌شود | Console مرورگر (F12) را برای خطای JavaScript بررسی کنید |
| "شهر موردنظر پیدا نشد" | نام انگلیسی شهر را امتحان کنید (مثلاً Tehran به‌جای تهران) |
| رنگ استان‌ها همیشه خاکستری است | اتصال اینترنت و صحت `WEATHER_API_KEY` را بررسی کنید |
| خطای Execution Policy در PowerShell | دستور بخش ۲ بالا را اجرا کنید |

## قابلیت‌های آینده (پیشنهادی)

- افزودن پیش‌بینی ۷ روزه
- نمایش نمودار روند دما
- افزودن زبان انگلیسی (چندزبانه)

## سازندگان

- محمد پاکان معظمی گودرزی
- محمد مهدی نظری