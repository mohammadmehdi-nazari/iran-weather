/* =====================================================
   سامانه نمایش آب‌وهوای ایران - منطق اصلی Frontend
   ===================================================== */

const APP_STATE = {
  provincesData: null,      // داده کامل استان‌ها و شهرها (از /api/provinces)
  mapPaths: null,           // مسیرهای SVG استان‌ها
  provinceWeatherSummary: {}, // خلاصه وضعیت آب‌وهوای هر استان (برای رنگ‌آمیزی)
  selectedProvinceId: null,
  allCitiesFlat: [],        // لیست تخت همه شهرها برای جستجو/Autocomplete
};

const WEATHER_COLORS = {
  extreme_hot: "#dc2626",
  hot: "#f59e0b",
  warm: "#fb923c",
  mild: "#14b8a6",
  cold: "#3b82f6",
  extreme_cold: "#1e3a8a",
  rain: "#60a5fa",
  heavy_rain: "#2563eb",
  snow: "#93c5fd",
  storm: "#6d28d9",
  unknown: "#9ca3af",
};

/* ===================== توابع کمکی عمومی ===================== */
function qs(selector) {
  return document.querySelector(selector);
}

function showElement(el) {
  el.style.display = "";
}

function hideElement(el) {
  el.style.display = "none";
}

async function fetchJSON(url) {
  const response = await fetch(url);
  if (!response.ok) {
    const errorBody = await response.json().catch(() => ({}));
    const error = new Error(errorBody.error || `خطای HTTP ${response.status}`);
    error.status = response.status;
    throw error;
  }
  return response.json();
}

/* ===================== Dark Mode ===================== */
function initDarkMode() {
  const toggleBtn = qs("#darkModeToggle");
  const saved = getStoredTheme();
  if (saved === "dark") {
    document.documentElement.setAttribute("data-theme", "dark");
  }

  toggleBtn.addEventListener("click", () => {
    const isDark = document.documentElement.getAttribute("data-theme") === "dark";
    if (isDark) {
      document.documentElement.removeAttribute("data-theme");
      storeTheme("light");
    } else {
      document.documentElement.setAttribute("data-theme", "dark");
      storeTheme("dark");
    }
  });
}

// از متغیر حافظه‌ای به‌جای localStorage استفاده می‌کنیم (سازگار با محیط‌های محدود)
let inMemoryTheme = null;
function getStoredTheme() {
  return inMemoryTheme;
}
function storeTheme(value) {
  inMemoryTheme = value;
}

/* ===================== بارگذاری داده اولیه ===================== */
async function loadInitialData() {
  const mapLoading = qs("#mapLoading");

  try {
    const [provincesResp, mapPathsResp] = await Promise.all([
      fetchJSON("/api/provinces"),
      fetch("/static/assets/iran_map_paths.json").then((r) => r.json()),
    ]);

    APP_STATE.provincesData = provincesResp;
    APP_STATE.mapPaths = mapPathsResp;

    buildFlatCityList();
    renderIranMap();

    hideElement(mapLoading);

    // دریافت خلاصه وضعیت آب‌وهوای استان‌ها (ممکن است چند ثانیه طول بکشد)
    loadProvinceWeatherSummary();
  } catch (err) {
    console.error("خطا در بارگذاری داده اولیه:", err);
    mapLoading.innerHTML = `<span style="color:#dc2626;">دریافت اطلاعات نقشه با مشکل مواجه شد. لطفاً صفحه را رفرش کنید.</span>`;
  }
}

function buildFlatCityList() {
  const flat = [];
  for (const province of APP_STATE.provincesData.provinces) {
    for (const city of province.cities) {
      flat.push({
        city_fa: city.name_fa,
        city_en: city.name_en,
        province_fa: province.name_fa,
        province_en: province.name_en,
      });
    }
  }
  APP_STATE.allCitiesFlat = flat;
}

async function loadProvinceWeatherSummary() {
  try {
    const data = await fetchJSON("/api/weather/all-provinces-summary");
    for (const item of data.summary) {
      APP_STATE.provinceWeatherSummary[item.province_id] = item;
    }
    applyProvinceColors();
    } catch (err) {
    console.warn("خلاصه وضعیت آب‌وهوای استان‌ها دریافت نشد:", err);
    // در صورت خطا، نقشه با رنگ خنثی نمایش داده می‌شود (بدون رنگ‌آمیزی) - مشکلی برای کاربر ایجاد نمی‌شود
  }
}

/* ===================== ترسیم نقشه SVG ===================== */
function renderIranMap() {
  const wrapper = qs("#iranMapWrapper");
  const paths = APP_STATE.mapPaths;

  let svgContent = `<svg viewBox="0 0 1000 620" xmlns="http://www.w3.org/2000/svg">`;

  // دریای خزر (بالای نقشه) و خلیج فارس/دریای عمان (پایین نقشه) به‌صورت تقریبی
  svgContent += `<ellipse class="sea-area" cx="620" cy="55" rx="140" ry="55"></ellipse>`; // دریای خزر (تقریبی)
  svgContent += `<path class="sea-area" d="M480,560 Q650,540 850,590 L850,620 L480,620 Z"></path>`; // خلیج فارس/دریای عمان (تقریبی)

  // رسم استان‌ها
  for (const [provinceId, info] of Object.entries(paths)) {
    svgContent += `<path class="province-path" id="province-${provinceId}" data-province-id="${provinceId}" d="${info.d}" fill="${WEATHER_COLORS.unknown}"></path>`;
  }

  svgContent += `</svg>`;
  wrapper.innerHTML = svgContent;

  attachMapEventListeners();
  setupMapZoomPan(wrapper);
}

function applyProvinceColors() {
  for (const [provinceId, weatherInfo] of Object.entries(APP_STATE.provinceWeatherSummary)) {
    const pathEl = document.getElementById(`province-${provinceId}`);
    if (pathEl) {
      const color = WEATHER_COLORS[weatherInfo.weather_category] || WEATHER_COLORS.unknown;
      pathEl.setAttribute("fill", color);
    }
  }
}

function attachMapEventListeners() {
  const provincePaths = document.querySelectorAll(".province-path");
  const tooltip = createTooltip();

  provincePaths.forEach((path) => {
    const provinceId = path.dataset.provinceId;
    const province = findProvinceById(provinceId);
    if (!province) return;

    path.addEventListener("mouseenter", (e) => {
      showTooltip(tooltip, province.name_fa);
    });

    path.addEventListener("mousemove", (e) => {
      moveTooltip(tooltip, e);
    });

    path.addEventListener("mouseleave", () => {
      hideTooltip(tooltip);
    });

    path.addEventListener("click", () => {
      selectProvince(provinceId);
    });
  });
}

function createTooltip() {
  const mapContainer = qs(".map-container");
  const tooltip = document.createElement("div");
  tooltip.className = "map-tooltip";
  mapContainer.appendChild(tooltip);
  return tooltip;
}

function showTooltip(tooltip, text) {
  tooltip.textContent = text;
  tooltip.style.display = "block";
}

function moveTooltip(tooltip, event) {
  const containerRect = qs(".map-container").getBoundingClientRect();
  tooltip.style.left = `${event.clientX - containerRect.left + 14}px`;
  tooltip.style.top = `${event.clientY - containerRect.top + 14}px`;
}

function hideTooltip(tooltip) {
  tooltip.style.display = "none";
}

function findProvinceById(provinceId) {
  return APP_STATE.provincesData.provinces.find((p) => p.id === provinceId);
}

/* ===================== Zoom / Pan نقشه ===================== */
function setupMapZoomPan(wrapper) {
  let scale = 1;
  let panX = 0;
  let panY = 0;
  let isDragging = false;
  let startX = 0;
  let startY = 0;
  const svg = wrapper.querySelector("svg");

  function applyTransform() {
    svg.style.transform = `translate(${panX}px, ${panY}px) scale(${scale})`;
    svg.style.transformOrigin = "center center";
  }

  wrapper.addEventListener("wheel", (e) => {
    e.preventDefault();
    const delta = e.deltaY > 0 ? -0.1 : 0.1;
    scale = Math.min(Math.max(scale + delta, 0.8), 4);
    applyTransform();
  }, { passive: false });

  wrapper.addEventListener("mousedown", (e) => {
    isDragging = true;
    startX = e.clientX - panX;
    startY = e.clientY - panY;
  });

  window.addEventListener("mousemove", (e) => {
    if (!isDragging) return;
    panX = e.clientX - startX;
    panY = e.clientY - startY;
    applyTransform();
  });

  window.addEventListener("mouseup", () => {
    isDragging = false;
  });
}

/* ===================== پنل استان ===================== */
function selectProvince(provinceId) {
  const province = findProvinceById(provinceId);
  if (!province) return;

  APP_STATE.selectedProvinceId = provinceId;

  // Highlight استان انتخاب‌شده
  document.querySelectorAll(".province-path").forEach((p) => p.classList.remove("selected"));
  const selectedPath = document.getElementById(`province-${provinceId}`);
  if (selectedPath) selectedPath.classList.add("selected");

  qs("#provincePanelTitle").textContent = province.name_fa;

  const cityListEl = qs("#cityList");
  cityListEl.innerHTML = "";

  province.cities.forEach((city) => {
    const li = document.createElement("li");
    li.className = "city-item";
    li.innerHTML = `
      <div>
        <span class="city-name">${city.name_fa}</span>
        <span class="city-name-en">${city.name_en}</span>
      </div>
      <span>→</span>
    `;
    li.addEventListener("click", () => {
      openWeatherModal(city.name_en, province.name_fa);
    });
    cityListEl.appendChild(li);
  });

  qs("#provincePanel").classList.add("open");
}

function closeProvincePanel() {
  qs("#provincePanel").classList.remove("open");
}

/* ===================== Modal آب‌وهوای شهر ===================== */
async function openWeatherModal(cityNameEn, provinceNameFa) {
  const overlay = qs("#weatherModalOverlay");
  const loadingEl = qs("#weatherLoading");
  const errorEl = qs("#weatherError");
  const contentEl = qs("#weatherContent");

  overlay.classList.add("open");
  showElement(loadingEl);
  hideElement(errorEl);
  hideElement(contentEl);

  try {
    const data = await fetchJSON(`/api/weather/city?name=${encodeURIComponent(cityNameEn)}`);
    populateWeatherModal(data, provinceNameFa);
    hideElement(loadingEl);
    showElement(contentEl);
  } catch (err) {
    hideElement(loadingEl);
    showElement(errorEl);
    qs("#weatherErrorText").textContent = err.message || "دریافت اطلاعات آب‌وهوا با مشکل مواجه شد. لطفاً دوباره تلاش کنید.";
  }
}

function populateWeatherModal(data, provinceNameFa) {
  qs("#wCityName").textContent = data.city_fa || data.city_en || "--";
  qs("#wProvinceName").textContent = provinceNameFa || data.province_fa || "";
  qs("#wTemp").textContent = data.temperature_c != null ? `${Math.round(data.temperature_c)}°` : "--°";
  qs("#wFeelsLike").textContent = data.feels_like_c != null ? `${Math.round(data.feels_like_c)}°` : "--°";
  qs("#wCondition").textContent = data.condition_text || "--";
  qs("#wUpdated").textContent = data.last_updated || "--";

  const iconEl = qs("#wConditionIcon");
  if (data.condition_icon) {
    iconEl.src = data.condition_icon.startsWith("//") ? `https:${data.condition_icon}` : data.condition_icon;
    iconEl.style.display = "";
  } else {
    iconEl.style.display = "none";
  }

  qs("#wHumidity").textContent = data.humidity != null ? `${data.humidity}%` : "--%";
  qs("#wWind").textContent = data.wind_kph != null ? `${Math.round(data.wind_kph)} km/h` : "-- km/h";
  qs("#wWindDir").textContent = data.wind_dir || "--";
  qs("#wRainChance").textContent = data.chance_of_rain != null ? `${data.chance_of_rain}%` : "--%";
  qs("#wPressure").textContent = data.pressure_mb != null ? `${Math.round(data.pressure_mb)} hPa` : "-- hPa";
  qs("#wUV").textContent = data.uv != null ? data.uv : "--";
  qs("#wAQI").textContent = data.aqi_label || "--";
}

function closeWeatherModal() {
  qs("#weatherModalOverlay").classList.remove("open");
}

/* ===================== جستجوی شهر و Autocomplete ===================== */
function initSearch() {
  const input = qs("#citySearchInput");
  const autocompleteList = qs("#autocompleteList");
  const searchBtn = qs("#citySearchBtn");

  input.addEventListener("input", () => {
    const query = input.value.trim().toLowerCase();
    if (query.length < 1) {
      autocompleteList.classList.remove("show");
      return;
    }

    const matches = APP_STATE.allCitiesFlat.filter((c) =>
      c.city_fa.includes(query) || c.city_en.toLowerCase().includes(query)
    ).slice(0, 8);

    renderAutocomplete(matches);
  });

  searchBtn.addEventListener("click", () => {
    performSearch(input.value.trim());
  });

  input.addEventListener("keydown", (e) => {
    if (e.key === "Enter") {
      performSearch(input.value.trim());
    }
  });

  document.addEventListener("click", (e) => {
    if (!e.target.closest(".search-box")) {
      autocompleteList.classList.remove("show");
    }
  });
}

function renderAutocomplete(matches) {
  const autocompleteList = qs("#autocompleteList");

  if (matches.length === 0) {
    autocompleteList.classList.remove("show");
    return;
  }

  autocompleteList.innerHTML = matches
    .map(
      (c) => `
      <div class="autocomplete-item" data-city-en="${c.city_en}" data-province-fa="${c.province_fa}">
        <span>${c.city_fa}</span>
        <small>${c.province_fa}</small>
      </div>`
    )
    .join("");

  autocompleteList.classList.add("show");

  autocompleteList.querySelectorAll(".autocomplete-item").forEach((item) => {
    item.addEventListener("click", () => {
      const cityEn = item.dataset.cityEn;
      const provinceFa = item.dataset.provinceFa;
      autocompleteList.classList.remove("show");
      qs("#citySearchInput").value = "";
      openWeatherModal(cityEn, provinceFa);
    });
  });
}

function performSearch(query) {
  if (!query) return;

  const lowerQuery = query.toLowerCase();
  const match = APP_STATE.allCitiesFlat.find(
    (c) => c.city_fa === query || c.city_en.toLowerCase() === lowerQuery
  );

  if (match) {
    openWeatherModal(match.city_en, match.province_fa);
  } else {
    // اگر دقیقاً پیدا نشد، مستقیم به Backend ارسال می‌شود (ممکن است WeatherAPI خودش پیدا کند)
    openWeatherModal(query, "");
  }

  qs("#autocompleteList").classList.remove("show");
}
/* ===================== ناوبری (Home / نقشه / درباره) ===================== */
function initNavigation() {
  const navLinks = document.querySelectorAll(".nav-link");
  const mapSection = qs("#mapSection");
  const creatorsSection = qs("#creatorsSection");
  const aboutSection = qs("#aboutSection");

  navLinks.forEach((link) => {
    link.addEventListener("click", (e) => {
      e.preventDefault();

      navLinks.forEach((l) => l.classList.remove("active"));
      link.classList.add("active");

      const view = link.dataset.view;

      if (view === "about") {
        hideElement(mapSection);
        hideElement(creatorsSection);
        showElement(aboutSection);
      } else {
        // "home" و "map" هر دو همان نمای اصلی نقشه را نشان می‌دهند
        showElement(mapSection);
        showElement(creatorsSection);
        hideElement(aboutSection);
      }
    });
  });
}
/* ===================== راه‌اندازی کلی برنامه ===================== */
document.addEventListener("DOMContentLoaded", () => {
  initDarkMode();
  initSearch();
  loadInitialData();
    initNavigation();

  qs("#closeProvincePanel").addEventListener("click", closeProvincePanel);
  qs("#closeWeatherModal").addEventListener("click", closeWeatherModal);

  qs("#weatherModalOverlay").addEventListener("click", (e) => {
    if (e.target.id === "weatherModalOverlay") {
      closeWeatherModal();
    }
  });
});