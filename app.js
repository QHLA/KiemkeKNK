/* ═══════════════════════════════════════════════════
   WebGIS Cơ Sở Sản Xuất Hà Nội — app.js
   ═══════════════════════════════════════════════════ */

// ── CẤU HÌNH NGÀNH ────────────────────────────────────────────────────────────
const NGANH_CFG = {
  "Ngành công thương": { mau: "#f59e0b", icon: "🏭" },
  "Ngành GTVT":        { mau: "#3b82f6", icon: "✈️" },
  "Ngành xây dựng":    { mau: "#8b5cf6", icon: "🏗️" },
  "Ngành TN&MT":       { mau: "#10b981", icon: "♻️" },
};

const TOE_MAX_DISPLAY = 50000; // để tính % thanh bar (clip outlier hàng không)

// ── KHỞI TẠO BẢN ĐỒ ───────────────────────────────────────────────
const map = L.map("map", {
  center: [21.02, 105.85],
  zoom: 10,
  zoomControl: false,

  minZoom: 9,
  maxZoom: 15,

  maxBounds: [
    [19.657407, 104.084877],   // góc Tây Nam
    [22.806574, 106.831159]    // góc Đông Bắc
  ],

  maxBoundsViscosity: 1.0
});

L.control.zoom({ 
  position: "bottomright" 
}).addTo(map);


// ── CÁC LỚP NỀN ───────────────────────────────────────────────────

// Nền tối Carto
const dark = L.tileLayer(
  "https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png",
  {
    maxZoom: 20,
    attribution: "CartoDB Dark"
  }
);
// Ảnh vệ tinh Google
const satellite = L.tileLayer(
  "https://mt1.google.com/vt/lyrs=s&x={x}&y={y}&z={z}",
  {
    maxZoom: 20,
    attribution: "Google Satellite"
  }
);
// Nền OSM (nếu muốn thêm)
const osm = L.tileLayer(
  "https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png",
  {
    maxZoom: 19,
    attribution: "OpenStreetMap"
  }
);

// ── LỚP MẶC ĐỊNH ──────────────────────────────────────────────────
dark.addTo(map);


// ── BỘ CHỌN BẢN ĐỒ ───────────────────────────────────────────────
const baseMaps = {
  "🌙 Bản đồ nền": dark,
  "🛰️ Ảnh vệ tinh": satellite,
  "🗺️ OpenStreetMap": osm
};

L.control.layers(baseMaps, null, {
  position: "topright"
}).addTo(map);

// ── BỘ CHỌN BACKGROUND ───────────────────────────────────────────────
const btn = document.getElementById("theme-btn");

btn.onclick = function(){

  document.body.classList.toggle("light");

  if(document.body.classList.contains("light")){
    btn.innerHTML="🌙";
  }
  else{
    btn.innerHTML="☀️";
  }

};

// ── STATE ─────────────────────────────────────────────────────────────────────
let allFeatures = [];       // KNK features gốc
let filteredFeatures = [];  // sau filter
let markerMap = {};         // id → L.Marker
let activeId = null;

const layerState = { polygon: true, points: true };
let polygonLayer = null;
const markerGroup = L.layerGroup().addTo(map);

// ── LOAD DỮ LIỆU ─────────────────────────────────────────────────────────────
Promise.all([
  fetch("Diaphanxa_HN_moi.geojson").then((r) => r.json()),
  fetch("KNK_HN.geojson").then((r) => r.json()),
]).then(([polygonData, knkData]) => {
  // --- Ranh giới xã ---
  polygonLayer = L.geoJSON(polygonData, {
    style: {
      color: "#2a7fd4",
      weight: 0.8,
      fillColor: "#2a7fd4",
      fillOpacity: 0.06,
    },
    onEachFeature(feature, layer) {
      const p = feature.properties;
      const name = p.TENCHU || p.DIADANH || "";
      if (name) {
        layer.bindTooltip(name, { sticky: true, opacity: 0.9 });
      }
      layer.on("mouseover", function () {
        this.setStyle({ fillOpacity: 0.18, weight: 1.5 });
      });
      layer.on("mouseout", function () {
        this.setStyle({ fillOpacity: 0.06, weight: 0.8 });
      });
    },
  }).addTo(map);

  // --- Điểm KNK ---
  allFeatures = knkData.features;
  filteredFeatures = [...allFeatures];

  renderStats(allFeatures);
  renderMarkers(allFeatures);
  renderList(allFeatures);

  // Cập nhật badge số điểm
  document.getElementById("badge-count").textContent =
    allFeatures.length + " cơ sở";
});

// ── MARKERS ───────────────────────────────────────────────────────────────────
// function makeIcon(nganh, toe) {
//   const cfg = NGANH_CFG[nganh] || { mau: "#6b7280", icon: "🏢" };
//   const sizeClass = toe > 100000 ? "mk-xl" : toe > 20000 ? "mk-lg" : toe > 5000 ? "mk-md" : "mk-sm";
//   return L.divIcon({
//     html: `<div class="mk-wrap ${sizeClass}" style="background:${cfg.mau}">
//              <span class="mk-icon">${cfg.icon}</span>
//            </div>`,
//     className: "",
//     iconSize: [0, 0],
//     iconAnchor: [15, 30],
//     popupAnchor: [0, -32],
//   });
// }

function makeIcon(nganh, toe) {
  const cfg = NGANH_CFG[nganh] || { 
    mau: "#6b7280", 
    icon: "🏢" 
  };

  return L.divIcon({
    html: `
      <div class="mk-wrap mk-md" style="background:${cfg.mau}">
        <span class="mk-icon">${cfg.icon}</span>
      </div>
    `,
    className: "",
    iconSize: [0, 0],
    iconAnchor: [15, 30],
    popupAnchor: [0, -32],
  });
}

function buildPopup(feat) {
  const p = feat.properties;
  const nganh = p.Nganh || "";
  const cfg = NGANH_CFG[nganh] || { mau: "#6b7280", icon: "🏢" };
  const toe = p.TieuthuTOE || 0;
  const toePct = Math.min((toe / TOE_MAX_DISPLAY) * 100, 100).toFixed(1);
  const hasLink = p.Link && p.Link.trim() !== "";

  return `
    <div class="popup-header">
      <div class="popup-nganh-tag" style="background:${cfg.mau}22;color:${cfg.mau};border:1px solid ${cfg.mau}44">
        ${cfg.icon} ${nganh}
      </div>
      <div class="popup-title">${p.Name || "Không rõ tên"}</div>
    </div>
    <div class="popup-body">
      <div class="popup-row">
        <span class="ic"> 📍 </span>
        <span class="val">${p.Diachi || "—"}</span>
      </div>
      <div class="popup-row">
        <span class="ic">🔧</span>
        
        <span class="val">${p.Nganhnghe || "—"}</span>
      </div>
      <div class="popup-toe-bar">
        <div class="popup-toe-label">
          Tiêu thụ năng lượng
          <span>${toe.toLocaleString("vi-VN")} TOE</span>
        </div>
        <div class="toe-track">
          <div class="toe-fill" style="width:${toePct}%;background:linear-gradient(90deg,${cfg.mau}aa,${cfg.mau})"></div>
        </div>
      </div>
    </div>
    <div class="popup-footer">
      ${
        hasLink
          ? `<a class="btn-report" href="${p.Link}" target="_blank" rel="noopener">
               📄 Xem báo cáo
             </a>`
          : `<span class="btn-report disabled">📄 Chưa có báo cáo</span>`
      }
    </div>
  `;
}

function renderMarkers(features) {
  markerGroup.clearLayers();
  markerMap = {};

  features.forEach((feat) => {
    const p = feat.properties;
    const coords = feat.geometry.coordinates; // [lng, lat, z?]
    const id = p.STT;

    const marker = L.marker([coords[1], coords[0]], {
      icon: makeIcon(p.Nganh, p.TieuthuTOE),
    });

    marker.bindPopup(buildPopup(feat), { maxWidth: 300 });

    marker.on("popupopen", () => {
      setActive(id);
    });

    marker.addTo(markerGroup);
    markerMap[id] = marker;
  });
}

// ── SIDEBAR LIST ──────────────────────────────────────────────────────────────
function renderList(features) {
  const el = document.getElementById("points-list");

  if (features.length === 0) {
    el.innerHTML = `<div class="empty-msg"><div class="ic">🔍</div>Không tìm thấy kết quả</div>`;
    return;
  }

  el.innerHTML = features
    .map((feat) => {
      const p = feat.properties;
      const cfg = NGANH_CFG[p.Nganh] || { mau: "#6b7280", icon: "🏢" };
      const toe = p.TieuthuTOE
        ? (p.TieuthuTOE >= 1000
            ? (p.TieuthuTOE / 1000).toFixed(0) + "k TOE"
            : p.TieuthuTOE + " TOE")
        : "";
      return `
        <div class="point-card" id="pc-${p.STT}" onclick="focusPoint(${p.STT})">
          <div class="point-icon" style="background:${cfg.mau}22">${cfg.icon}</div>
          <div class="point-info">
            <div class="point-name">${p.Name || "—"}</div>
            <div class="point-meta">${p.Nganh || ""}</div>
          </div>
          <div class="point-toe">${toe}</div>
        </div>
      `;
    })
    .join("");
}

// ── FOCUS POINT ───────────────────────────────────────────────────────────────
function focusPoint(id) {
  const marker = markerMap[id];
  if (!marker) return;
  map.flyTo(marker.getLatLng(), 15, { duration: 0.7 });
  setTimeout(() => marker.openPopup(), 750);
  setActive(id);
}

function setActive(id) {
  if (activeId) {
    const prev = document.getElementById("pc-" + activeId);
    if (prev) prev.classList.remove("active");
  }
  activeId = id;
  const cur = document.getElementById("pc-" + id);
  if (cur) {
    cur.classList.add("active");
    cur.scrollIntoView({ behavior: "smooth", block: "nearest" });
  }
}

// ── THỐNG KÊ ──────────────────────────────────────────────────────────────────
function renderStats(features) {
  // Đếm theo ngành
  const counts = {};
  features.forEach((f) => {
    const n = f.properties.Nganh || "Khác";
    counts[n] = (counts[n] || 0) + 1;
  });

  // Cập nhật legend counts
  document.querySelectorAll(".legend-item[data-nganh]").forEach((el) => {
    const n = el.dataset.nganh;
    const badge = el.querySelector(".legend-count");
    if (badge) badge.textContent = counts[n] || 0;
  });

  // Stats box
  document.getElementById("stat-total").textContent = features.length;
  const totalTOE = features.reduce(
    (s, f) => s + (f.properties.TieuthuTOE || 0),
    0
  );
  document.getElementById("stat-toe").textContent =
    (totalTOE / 1000).toFixed(0) + "k";
}

// ── TÌM KIẾM ─────────────────────────────────────────────────────────────────
document.getElementById("search-input").addEventListener("input", function () {
  applyFilter();
});

// ── FILTER NGÀNH ──────────────────────────────────────────────────────────────
let activeNganh = "all";

document.querySelectorAll(".chip").forEach((chip) => {
  chip.addEventListener("click", function () {
    document.querySelectorAll(".chip").forEach((c) => c.classList.remove("active"));
    this.classList.add("active");
    activeNganh = this.dataset.nganh;
    applyFilter();
  });
});

function applyFilter() {
  const q = document.getElementById("search-input").value.toLowerCase().trim();
  filteredFeatures = allFeatures.filter((feat) => {
    const p = feat.properties;
    const matchNganh = activeNganh === "all" || p.Nganh === activeNganh;
    const matchQ =
      !q ||
      (p.Name || "").toLowerCase().includes(q) ||
      (p.Diachi || "").toLowerCase().includes(q) ||
      (p.Nganhnghe || "").toLowerCase().includes(q);
    return matchNganh && matchQ;
  });

  renderMarkers(filteredFeatures);
  renderList(filteredFeatures);
  renderStats(filteredFeatures);
}

// ── LAYER TOGGLES ─────────────────────────────────────────────────────────────
window.toggleLayer = function (name) {
  layerState[name] = !layerState[name];
  const btn = document.getElementById("toggle-" + name);
  btn.classList.toggle("on",  layerState[name]);
  btn.classList.toggle("off", !layerState[name]);

  if (name === "polygon" && polygonLayer) {
    layerState[name] ? map.addLayer(polygonLayer) : map.removeLayer(polygonLayer);
  }
  if (name === "points") {
    layerState[name] ? map.addLayer(markerGroup) : map.removeLayer(markerGroup);
  }
};

// ── IN BẢN ĐỒ ─────────────────────────────────────────────────────────────────
let printHiddenIds = [];
let printOnlySelected = false;

function preparePrint() {
  // Thay vì check document.getElementById("print-only-selected").checked
  // Chúng ta mặc định logic: nếu có activeId thì chỉ in cơ sở đó, nếu không thì in tất cả
  printOnlySelected = (activeId !== null && markerMap[activeId]); 
  printHiddenIds = [];

  if (printOnlySelected) {
    Object.keys(markerMap).forEach((id) => {
      if (String(id) !== String(activeId)) {
        markerGroup.removeLayer(markerMap[id]);
        printHiddenIds.push(id);
      }
    });
  } else {
    map.closePopup();
  }

  const sub = document.getElementById("print-title-sub");
  if (printOnlySelected) {
    const feat = allFeatures.find((f) => String(f.properties.STT) === String(activeId));
    sub.textContent = feat ? feat.properties.Name || "" : "";
  } else {
    sub.textContent = `Tổng số cơ sở: ${filteredFeatures.length}`;
  }
}

function restoreAfterPrint() {
  document.body.classList.remove("printing");
  if (printHiddenIds.length) {
    printHiddenIds.forEach((id) => {
      if (markerMap[id]) markerGroup.addLayer(markerMap[id]);
    });
    printHiddenIds = [];
  }
  map.invalidateSize();
}

document.getElementById("btn-print").addEventListener("click", function () {
  preparePrint();

  // 1) Bật class "printing" → #map đổi kích thước thật trên DOM (chưa in)
  document.body.classList.add("printing");

  // 2) Đợi 1 nhịp để trình duyệt reflow xong rồi mới báo Leaflet tính lại pixel
  requestAnimationFrame(() => {
    setTimeout(() => {
      map.invalidateSize({ animate: false });

      if (printOnlySelected && activeId !== null && markerMap[activeId]) {
        map.setView(markerMap[activeId].getLatLng(), Math.max(map.getZoom(), 14), {
          animate: false,
        });
        markerMap[activeId].openPopup();
      }

      // 3) Đợi tile bản đồ load xong rồi mới mở hộp thoại in
      setTimeout(() => {
        window.print();
      }, 400);
    }, 60);
  });
});

window.addEventListener("afterprint", restoreAfterPrint);
