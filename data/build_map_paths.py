"""
اسکریپت تبدیل فایل GeoJSON مرز استان‌های ایران به مسیرهای SVG
این اسکریپت فقط یک‌بار اجرا می‌شود و خروجی آن در static/assets/iran_map_paths.json ذخیره می‌گردد.
"""

import json
import math
import os

CURRENT_DIR = os.path.dirname(__file__)
GEOJSON_PATH = os.path.join(CURRENT_DIR, "iran_boundaries.geojson")
PROVINCES_PATH = os.path.join(CURRENT_DIR, "iran_provinces.json")
OUTPUT_PATH = os.path.join(CURRENT_DIR, "..", "static", "assets", "iran_map_paths.json")

# ابعاد ViewBox نقشه SVG خروجی
VIEWBOX_WIDTH = 1000
VIEWBOX_HEIGHT = 620
MARGIN = 25

# نگاشت نام‌هایی که در GeoJSON با فایل داده خودمان فرق دارند
NAME_OVERRIDES = {
    "Razavi Khorasan": "Khorasan Razavi",
}


def load_json(path):
    with open(path, "r", encoding="utf-8") as f:
        return json.load(f)


def collect_all_points(features):
    """جمع‌آوری تمام مختصات lon/lat برای محاسبه محدوده کلی نقشه"""
    points = []
    for feature in features:
        geom = feature["geometry"]
        gtype = geom["type"]
        coords = geom["coordinates"]

        if gtype == "Polygon":
            rings = coords
        elif gtype == "MultiPolygon":
            rings = [ring for polygon in coords for ring in polygon]
        else:
            continue

        for ring in rings:
            for lon, lat in ring:
                points.append((lon, lat))
    return points


def build_projection(points):
    """ساخت تابع تصویر (Projection) ساده Equirectangular با مقیاس یکنواخت"""
    lons = [p[0] for p in points]
    lats = [p[1] for p in points]

    min_lon, max_lon = min(lons), max(lons)
    min_lat, max_lat = min(lats), max(lats)

    center_lat = (min_lat + max_lat) / 2
    cos_center_lat = math.cos(math.radians(center_lat))

    # محاسبه عرض/ارتفاع خام (قبل از مقیاس‌دهی) بر اساس تصویر Equirectangular
    raw_width = (max_lon - min_lon) * cos_center_lat
    raw_height = (max_lat - min_lat)

    available_width = VIEWBOX_WIDTH - 2 * MARGIN
    available_height = VIEWBOX_HEIGHT - 2 * MARGIN

    scale = min(available_width / raw_width, available_height / raw_height)

    # برای وسط‌چین کردن نقشه در ViewBox
    scaled_width = raw_width * scale
    scaled_height = raw_height * scale
    offset_x = MARGIN + (available_width - scaled_width) / 2
    offset_y = MARGIN + (available_height - scaled_height) / 2

    def project(lon, lat):
        x = (lon - min_lon) * cos_center_lat * scale + offset_x
        y = (max_lat - lat) * scale + offset_y  # y معکوس چون در SVG محور y رو به پایین است
        return round(x, 2), round(y, 2)

    return project


def ring_to_path_d(ring, project):
    points = [project(lon, lat) for lon, lat in ring]
    if not points:
        return ""
    d = f"M{points[0][0]},{points[0][1]} "
    d += " ".join(f"L{x},{y}" for x, y in points[1:])
    d += " Z"
    return d


def feature_to_path_d(feature, project):
    geom = feature["geometry"]
    gtype = geom["type"]
    coords = geom["coordinates"]

    if gtype == "Polygon":
        rings = coords
    elif gtype == "MultiPolygon":
        rings = [ring for polygon in coords for ring in polygon]
    else:
        return ""

    return " ".join(ring_to_path_d(ring, project) for ring in rings)


def main():
    print("در حال خواندن فایل GeoJSON...")
    geo_data = load_json(GEOJSON_PATH)
    features = geo_data["features"]

    print("در حال خواندن فایل استان‌ها...")
    provinces_data = load_json(PROVINCES_PATH)
    # ساخت نگاشت name_en -> province_id
    name_to_id = {p["name_en"]: p["id"] for p in provinces_data["provinces"]}

    print("در حال محاسبه تصویر (Projection) نقشه...")
    all_points = collect_all_points(features)
    project = build_projection(all_points)

    print("در حال ساخت مسیرهای SVG برای هر استان...")
    result = {}
    unmatched = []

    for feature in features:
        shape_name = feature["properties"].get("shapeName", "")
        # اعمال نگاشت نام در صورت وجود اختلاف نام‌گذاری
        lookup_name = NAME_OVERRIDES.get(shape_name, shape_name)
        province_id = name_to_id.get(lookup_name)

        path_d = feature_to_path_d(feature, project)

        if province_id is None:
            unmatched.append(shape_name)
            continue

        # اگر استانی (مثل مازندران) چند بخش جدا از هم داشته باشد، مسیرها را ترکیب می‌کنیم
        if province_id in result:
            result[province_id]["d"] += " " + path_d
        else:
            result[province_id] = {
                "d": path_d,
                "shape_name": shape_name,
            }

    if unmatched:
        print("\n⚠️  هشدار: این نام‌ها در فایل iran_provinces.json پیدا نشدند:")
        for name in unmatched:
            print(f"   - {name}")

    print(f"\nتعداد استان‌های تبدیل‌شده: {len(result)}")

    os.makedirs(os.path.dirname(OUTPUT_PATH), exist_ok=True)
    with open(OUTPUT_PATH, "w", encoding="utf-8") as f:
        json.dump(result, f, ensure_ascii=False, indent=2)

    print(f"\n✅ فایل خروجی با موفقیت ذخیره شد در:\n{OUTPUT_PATH}")


if __name__ == "__main__":
    main()