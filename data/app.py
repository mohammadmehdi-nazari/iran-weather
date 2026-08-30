"""
سامانه حرفه‌ای نمایش آب‌وهوای ایران
Backend اصلی پروژه با Flask
"""

import os
import json
import logging
from datetime import datetime

import requests
from flask import Flask, render_template, jsonify, request
from flask_caching import Cache
from dotenv import load_dotenv

# ---------------------------------------------------------------------------
# بارگذاری متغیرهای محیطی از فایل .env
# ---------------------------------------------------------------------------
load_dotenv()

WEATHER_API_KEY = os.getenv("WEATHER_API_KEY")
WEATHER_API_BASE_URL = "https://api.weatherapi.com/v1"

# ---------------------------------------------------------------------------
# راه‌اندازی Flask
# ---------------------------------------------------------------------------
app = Flask(__name__)

app.config["CACHE_TYPE"] = "SimpleCache"
app.config["CACHE_DEFAULT_TIMEOUT"] = 600
cache = Cache(app)

logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)

# ---------------------------------------------------------------------------
# بارگذاری داده استان‌ها و شهرهای ایران
# ---------------------------------------------------------------------------
DATA_FILE_PATH = os.path.join(os.path.dirname(__file__), "data", "iran_provinces.json")


def load_iran_data():
    try:
        with open(DATA_FILE_PATH, "r", encoding="utf-8") as f:
            return json.load(f)
    except FileNotFoundError:
        logger.error("فایل data/iran_provinces.json پیدا نشد.")
        return {"provinces": []}
    except json.JSONDecodeError:
        logger.error("فایل data/iran_provinces.json دارای خطای فرمت JSON است.")
        return {"provinces": []}


IRAN_DATA = load_iran_data()


# ---------------------------------------------------------------------------
# توابع کمکی
# ---------------------------------------------------------------------------
def find_province_by_id(province_id):
    for province in IRAN_DATA.get("provinces", []):
        if province["id"] == province_id:
            return province
    return None


def classify_weather_color(temp_c, condition_text, precip_mm):
    condition_lower = (condition_text or "").lower()

    if precip_mm is not None and precip_mm >= 4:
        return "heavy_rain"
    if "storm" in condition_lower or "thunder" in condition_lower:
        return "storm"
    if "snow" in condition_lower or "sleet" in condition_lower or "ice" in condition_lower:
        return "snow"
    if "rain" in condition_lower or "drizzle" in condition_lower:
        return "rain"

    if temp_c is None:
        return "unknown"
    if temp_c >= 38:
        return "extreme_hot"
    if temp_c >= 30:
        return "hot"
    if temp_c >= 20:
        return "warm"
    if temp_c >= 10:
        return "mild"
    if temp_c >= 0:
        return "cold"
    return "extreme_cold"


# ---------------------------------------------------------------------------
# فراخوانی WeatherAPI.com
# ---------------------------------------------------------------------------
@cache.memoize(timeout=600)
def fetch_weather_from_api(city_query):
    if not WEATHER_API_KEY:
        raise RuntimeError("WEATHER_API_KEY تنظیم نشده است. فایل .env را بررسی کنید.")

    url = f"{WEATHER_API_BASE_URL}/current.json"
    params = {
        "key": WEATHER_API_KEY,
        "q": city_query,
        "aqi": "yes",
        "lang": "fa",
    }

    response = requests.get(url, params=params, timeout=10)

    if response.status_code == 400:
        return None

    response.raise_for_status()
    return response.json()


def format_weather_response(raw_data, province_fa=None, province_en=None):
    location = raw_data.get("location", {})
    current = raw_data.get("current", {})
    condition = current.get("condition", {})
    air_quality = current.get("air_quality", {})

    aqi_index = air_quality.get("us-epa-index")
    aqi_labels = {
        1: "Good",
        2: "Moderate",
        3: "Unhealthy for Sensitive Groups",
        4: "Unhealthy",
        5: "Very Unhealthy",
        6: "Hazardous",
    }
    aqi_label = aqi_labels.get(aqi_index, "Unknown")

    temp_c = current.get("temp_c")
    precip_mm = current.get("precip_mm")
    condition_text = condition.get("text")

    return {
        "city_fa": province_fa or location.get("name"),
        "city_en": location.get("name"),
        "province_fa": province_fa,
        "province_en": province_en,
        "country": location.get("country"),
        "last_updated": current.get("last_updated"),
        "temperature_c": temp_c,
        "feels_like_c": current.get("feelslike_c"),
        "condition_text": condition_text,
        "condition_icon": condition.get("icon"),
        "humidity": current.get("humidity"),
        "wind_kph": current.get("wind_kph"),
        "wind_dir": current.get("wind_dir"),
        "precip_mm": precip_mm,
        "chance_of_rain": current.get("chance_of_rain", 0),
        "pressure_mb": current.get("pressure_mb"),
        "uv": current.get("uv"),
        "aqi_label": aqi_label,
        "aqi_index": aqi_index,
        "weather_category": classify_weather_color(temp_c, condition_text, precip_mm),
    }


# ---------------------------------------------------------------------------
# مسیرهای صفحات
# ---------------------------------------------------------------------------
@app.route("/")
def index():
    return render_template("index.html")


# ---------------------------------------------------------------------------
# مسیرهای API داخلی
# ---------------------------------------------------------------------------
@app.route("/api/provinces")
def api_get_provinces():
    return jsonify(IRAN_DATA)


@app.route("/api/weather/city")
def api_get_weather_by_city():
    city_name = request.args.get("name", "").strip()

    if not city_name:
        return jsonify({"error": "نام شهر ارسال نشده است."}), 400

    try:
        raw_data = fetch_weather_from_api(city_name)
    except requests.exceptions.ConnectionError:
        return jsonify({"error": "اتصال به اینترنت برقرار نیست."}), 503
    except requests.exceptions.Timeout:
        return jsonify({"error": "دریافت اطلاعات آب‌وهوا با مشکل مواجه شد. لطفاً دوباره تلاش کنید."}), 504
    except Exception as exc:
        logger.exception("خطا در دریافت اطلاعات آب‌وهوا: %s", exc)
        return jsonify({"error": "دریافت اطلاعات آب‌وهوا با مشکل مواجه شد. لطفاً دوباره تلاش کنید."}), 500

    if raw_data is None:
        return jsonify({"error": "شهر موردنظر پیدا نشد."}), 404

    formatted = format_weather_response(raw_data)
    return jsonify(formatted)


@app.route("/api/weather/province/<province_id>")
def api_get_weather_by_province(province_id):
    province = find_province_by_id(province_id)
    if not province:
        return jsonify({"error": "استان موردنظر پیدا نشد."}), 404

    cities_weather = []
    for city in province.get("cities", []):
        try:
            raw_data = fetch_weather_from_api(city["name_en"])
        except Exception as exc:
            logger.warning("خطا در دریافت آب‌وهوای %s: %s", city["name_en"], exc)
            continue

        if raw_data is None:
            continue

        formatted = format_weather_response(
            raw_data,
            province_fa=province["name_fa"],
            province_en=province["name_en"],
        )
        cities_weather.append(formatted)

    return jsonify({
        "province_id": province["id"],
        "province_fa": province["name_fa"],
        "province_en": province["name_en"],
        "cities": cities_weather,
    })


@app.route("/api/weather/all-provinces-summary")
def api_get_all_provinces_summary():
    summary = []
    for province in IRAN_DATA.get("provinces", []):
        cities = province.get("cities", [])
        if not cities:
            continue

        main_city = cities[0]

        try:
            raw_data = fetch_weather_from_api(main_city["name_en"])
        except Exception as exc:
            logger.warning("خطا در دریافت آب‌وهوای مرکز استان %s: %s", province["name_en"], exc)
            summary.append({
                "province_id": province["id"],
                "weather_category": "unknown",
                "temperature_c": None,
            })
            continue

        if raw_data is None:
            summary.append({
                "province_id": province["id"],
                "weather_category": "unknown",
                "temperature_c": None,
            })
            continue

        current = raw_data.get("current", {})
        condition_text = current.get("condition", {}).get("text")
        temp_c = current.get("temp_c")
        precip_mm = current.get("precip_mm")

        summary.append({
            "province_id": province["id"],
            "weather_category": classify_weather_color(temp_c, condition_text, precip_mm),
            "temperature_c": temp_c,
            "condition_text": condition_text,
        })

    return jsonify({"summary": summary})


# ---------------------------------------------------------------------------
# مدیریت خطاهای عمومی
# ---------------------------------------------------------------------------
@app.errorhandler(404)
def handle_404(e):
    return jsonify({"error": "مسیر موردنظر پیدا نشد."}), 404


@app.errorhandler(500)
def handle_500(e):
    logger.exception("خطای داخلی سرور: %s", e)
    return jsonify({"error": "خطای داخلی سرور. لطفاً دوباره تلاش کنید."}), 500


# ---------------------------------------------------------------------------
# اجرای برنامه
# ---------------------------------------------------------------------------
if __name__ == "__main__":
    if not WEATHER_API_KEY:
        logger.warning(
            "⚠️  WEATHER_API_KEY در فایل .env تنظیم نشده است. "
            "درخواست‌های آب‌وهوا با خطا مواجه خواهند شد."
        )
    app.run(debug=True, host="127.0.0.1", port=5000)