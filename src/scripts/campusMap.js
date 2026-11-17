const OSM_TILE_URL = 'https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png';
const OSM_ATTRIBUTION = '&copy; <a href="https://www.openstreetmap.org/copyright" target="_blank" rel="noopener noreferrer">OpenStreetMap contributors</a>';
let leafletModulePromise;

const loadLeaflet = () => {
  leafletModulePromise ||= Promise.all([
    import('leaflet'),
    import('leaflet/dist/leaflet.css')
  ]).then(([leaflet]) => leaflet.default);
  return leafletModulePromise;
};
const escapeHtml = (value) => String(value ?? '').replace(/[&<>"']/g, (character) => ({
  '&': '&amp;',
  '<': '&lt;',
  '>': '&gt;',
  '"': '&quot;',
  "'": '&#39;'
}[character]));

const campusCenter = (campus) => {
  if (Number.isFinite(campus?.latitude) && Number.isFinite(campus?.longitude)) {
    return [campus.latitude, campus.longitude];
  }
  const building = campus?.buildings?.find((item) => Number.isFinite(item.latitude) && Number.isFinite(item.longitude));
  return building ? [building.latitude, building.longitude] : null;
};

export class CampusMapView {
  constructor(openMap) {
    this.openMap = openMap;
    this.data = { campuses: [] };
    this.mapPageVisible = true;
    this.selectedCampusId = '';
    this.selectedBuildingId = '';
    this.selectedFloorId = '';
    this.activeLayer = 'outdoor';
    this.zoom = 1;
    this.maps = new Map();
    this.mapLoading = new Set();
    this.bind();
  }

  bind() {
    document.querySelectorAll('[data-open-campus-map]').forEach((button) => {
      button.addEventListener('click', () => this.openMap());
    });
    document.getElementById('campus-map-campus')?.addEventListener('change', (event) => {
      this.selectedCampusId = event.currentTarget.value;
      this.selectedBuildingId = '';
      this.selectedFloorId = '';
      this.render();
    });
    document.getElementById('campus-map-building')?.addEventListener('change', (event) => {
      this.selectedBuildingId = event.currentTarget.value;
      this.selectedFloorId = '';
      this.render();
    });
    document.getElementById('campus-map-floor')?.addEventListener('change', (event) => {
      this.selectedFloorId = event.currentTarget.value;
      this.activeLayer = 'indoor';
      this.render();
    });
    document.querySelectorAll('[data-campus-map-layer]').forEach((button) => {
      button.addEventListener('click', () => {
        this.activeLayer = button.dataset.campusMapLayer;
        this.render();
      });
    });
    document.getElementById('campus-map-floorplan')?.addEventListener('click', (event) => {
      const feature = event.target.closest('[data-map-feature]');
      if (feature) this.showFeature(feature.dataset.mapFeature);
    });
    document.getElementById('campus-map-zoom-out')?.addEventListener('click', () => this.setZoom(this.zoom / 1.2));
    document.getElementById('campus-map-zoom-in')?.addEventListener('click', () => this.setZoom(this.zoom * 1.2));
  }

  setData(data, { mapPageVisible = true } = {}) {
    this.data = data && Array.isArray(data.campuses) ? data : { campuses: [] };
    this.mapPageVisible = mapPageVisible;
    if (!this.data.campuses.some(({ id }) => id === this.selectedCampusId)) this.selectedCampusId = this.data.campuses[0]?.id || '';
    this.render();
  }

  activate() {
    requestAnimationFrame(() => {
      for (const map of this.maps.values()) map.invalidateSize();
      this.renderOutdoor();
    });
  }

  getSelectedCampus() {
    return this.data.campuses.find(({ id }) => id === this.selectedCampusId) || null;
  }

  getSelectedBuilding() {
    const campus = this.getSelectedCampus();
    if (!campus) return null;
    if (!campus.buildings.some(({ id }) => id === this.selectedBuildingId)) this.selectedBuildingId = campus.buildings[0]?.id || '';
    return campus.buildings.find(({ id }) => id === this.selectedBuildingId) || null;
  }

  getSelectedFloor() {
    const building = this.getSelectedBuilding();
    if (!building) return null;
    if (!building.floors.some(({ id }) => id === this.selectedFloorId)) this.selectedFloorId = building.floors[0]?.id || '';
    return building.floors.find(({ id }) => id === this.selectedFloorId) || null;
  }

  render() {
    this.renderSummary();
    this.renderSelectors();
    this.renderIndoor();
    this.renderLayerState();
    this.renderOutdoor();
  }

  renderSummary() {
    const widget = document.getElementById('sidebar-campus-map-widget');
    if (widget) widget.hidden = this.data.publicWidgetVisible === false || !this.mapPageVisible;
    const navigationLabel = document.querySelector('.nav-link[data-tab="campus-map"] span:last-child');
    if (navigationLabel) navigationLabel.textContent = this.data.navigationLabel || 'Peta Kampus';
    const widgetTitle = document.getElementById('sidebar-campus-map-title');
    if (widgetTitle) widgetTitle.textContent = this.data.navigationLabel || 'Peta Kampus';
    const summary = document.getElementById('sidebar-campus-map-summary');
    if (summary) {
      const campus = this.getSelectedCampus();
      summary.textContent = campus
        ? `${campus.name} · ${campus.buildings.length} gedung`
        : 'Peta kampus belum dikonfigurasi.';
    }
    const sidebarCampusCount = document.getElementById('sidebar-campus-map-campus-count');
    if (sidebarCampusCount) sidebarCampusCount.textContent = String(this.data.campuses.length);
    const campusCount = document.getElementById('campus-map-campus-count');
    if (campusCount) campusCount.textContent = String(this.data.campuses.length);
    const buildingCount = document.getElementById('campus-map-building-count');
    if (buildingCount) buildingCount.textContent = String(this.data.campuses.reduce((total, campus) => total + campus.buildings.length, 0));
    const floorCount = document.getElementById('campus-map-floor-count');
    if (floorCount) floorCount.textContent = String(this.data.campuses.reduce((total, campus) => (
      total + campus.buildings.reduce((buildingTotal, building) => buildingTotal + building.floors.length, 0)
    ), 0));
    const description = document.getElementById('campus-map-summary');
    if (description) description.textContent = this.data.summary || 'Jelajahi lokasi, gedung, lantai, dan fasilitas kampus.';
  }

  renderSelectors() {
    const campusSelect = document.getElementById('campus-map-campus');
    const buildingSelect = document.getElementById('campus-map-building');
    const floorSelect = document.getElementById('campus-map-floor');
    if (!campusSelect || !buildingSelect || !floorSelect) return;
    const campus = this.getSelectedCampus();
    const building = this.getSelectedBuilding();
    const floor = this.getSelectedFloor();
    campusSelect.replaceChildren(...this.data.campuses.map((item) => new Option(item.name, item.id)));
    campusSelect.value = campus?.id || '';
    buildingSelect.replaceChildren(...(campus?.buildings || []).map((item) => new Option(item.name, item.id)));
    buildingSelect.value = building?.id || '';
    floorSelect.replaceChildren(...(building?.floors || []).map((item) => new Option(item.name, item.id)));
    floorSelect.value = floor?.id || '';
    campusSelect.disabled = this.data.campuses.length === 0;
    buildingSelect.disabled = !campus?.buildings.length;
    floorSelect.disabled = !building?.floors.length;
  }

  renderLayerState() {
    for (const button of document.querySelectorAll('[data-campus-map-layer]')) {
      const active = button.dataset.campusMapLayer === this.activeLayer;
      button.setAttribute('aria-pressed', String(active));
    }
    const outdoor = document.getElementById('campus-map-outdoor-panel');
    const indoor = document.getElementById('campus-map-indoor-panel');
    if (outdoor) outdoor.hidden = this.activeLayer !== 'outdoor';
    if (indoor) indoor.hidden = this.activeLayer !== 'indoor';
  }

  renderIndoor() {
    const viewport = document.getElementById('campus-map-floorplan');
    const empty = document.getElementById('campus-map-floorplan-empty');
    const floor = this.getSelectedFloor();
    if (!viewport || !empty) return;
    if (!floor) {
      viewport.replaceChildren();
      empty.hidden = false;
      empty.textContent = 'Tambahkan kampus, gedung, dan denah lantai melalui Site Studio.';
      return;
    }
    empty.hidden = true;
    const image = floor.planImage
      ? `<image href="${escapeHtml(floor.planImage)}" x="0" y="0" width="1000" height="700" preserveAspectRatio="none" />`
      : '';
    const shapes = floor.features.map((feature) => {
      const color = floor.legend.find(({ id }) => id === feature.legendId)?.color || '#00e5ff';
      const label = escapeHtml(feature.label);
      const description = escapeHtml(feature.description);
      const shared = `tabindex="0" role="button" aria-label="${label}${description ? `: ${description}` : ''}" data-map-feature="${escapeHtml(feature.id)}"`;
      if (feature.kind === 'marker') {
        return `<g ${shared}><circle cx="${feature.x}" cy="${feature.y}" r="12" fill="${color}" stroke="#111723" stroke-width="4" /><text x="${feature.x + 18}" y="${feature.y + 5}">${label}</text></g>`;
      }
      if (feature.kind === 'area') {
        return `<g ${shared}><rect x="${feature.x}" y="${feature.y}" width="${feature.width}" height="${feature.height}" fill="${color}" fill-opacity=".26" stroke="${color}" stroke-width="4" /><text x="${feature.x + 8}" y="${feature.y + 26}">${label}</text></g>`;
      }
      const points = feature.points.map(({ x, y }) => `${x},${y}`).join(' ');
      return `<g ${shared}><polyline points="${points}" fill="none" stroke="${color}" stroke-width="8" stroke-linecap="round" stroke-linejoin="round" /><text x="${feature.points[0].x + 8}" y="${feature.points[0].y - 8}">${label}</text></g>`;
    }).join('');
    viewport.innerHTML = `
      <svg viewBox="0 0 1000 700" role="group" aria-label="Denah ${escapeHtml(floor.name)}" style="transform:scale(${this.zoom})">
        <rect x="0" y="0" width="1000" height="700" fill="#101722" />
        ${image}${shapes}
      </svg>`;
    const heading = document.getElementById('campus-map-floor-title');
    if (heading) heading.textContent = `${this.getSelectedBuilding()?.name || ''} · ${floor.name}`;
    const scale = document.getElementById('campus-map-scale');
    if (scale) scale.textContent = `1:${floor.scaleDenominator} · ${floor.widthMeters} × ${floor.heightMeters} m`;
    const scaleBar = document.getElementById('campus-map-scale-bar');
    if (scaleBar) scaleBar.textContent = `${Math.max(1, Math.round(floor.widthMeters / 5))} m`;
    this.renderLegend(floor);
  }

  renderLegend(floor) {
    const legend = document.getElementById('campus-map-legend');
    if (!legend) return;
    legend.replaceChildren(...floor.legend.map((item) => {
      const row = document.createElement('span');
      row.className = 'campus-map-legend-item';
      const swatch = document.createElement('i');
      swatch.style.backgroundColor = item.color;
      swatch.setAttribute('aria-hidden', 'true');
      const label = document.createElement('span');
      label.textContent = item.label;
      row.append(swatch, label);
      return row;
    }));
    legend.hidden = floor.legend.length === 0;
  }

  showFeature(id) {
    const feature = this.getSelectedFloor()?.features.find((item) => item.id === id);
    const details = document.getElementById('campus-map-feature-details');
    if (!feature || !details) return;
    details.replaceChildren();
    const title = document.createElement('strong');
    title.textContent = feature.label;
    const description = document.createElement('span');
    description.textContent = feature.description || 'Informasi fasilitas belum ditambahkan.';
    details.append(title, description);
    details.hidden = false;
  }

  setZoom(value) {
    this.zoom = Math.max(0.65, Math.min(2.5, value));
    const svg = document.querySelector('#campus-map-floorplan svg');
    if (svg) svg.style.transform = `scale(${this.zoom})`;
  }

  renderOutdoor() {
    this.renderLeafletMap('sidebar-campus-map', true).catch((error) => this.showMapError('sidebar-campus-map-empty', error));
    this.renderLeafletMap('campus-map-outdoor', false).catch((error) => this.showMapError('campus-map-outdoor-empty', error));
  }

  showMapError(emptyId, error) {
    console.error('[CAMPUS MAP] Peta geografi gagal dimuat:', error);
    const empty = document.getElementById(emptyId);
    if (empty) {
      empty.hidden = false;
      empty.textContent = 'Peta dasar gagal dimuat. Periksa koneksi, lalu coba kembali.';
    }
  }

  async renderLeafletMap(containerId, compact) {
    const container = document.getElementById(containerId);
    const empty = document.getElementById(compact ? 'sidebar-campus-map-empty' : 'campus-map-outdoor-empty');
    if (!container || !empty) return;
    const campus = this.getSelectedCampus();
    const center = campusCenter(campus);
    if (!campus || !center) {
      empty.hidden = false;
      empty.textContent = campus ? 'Koordinat lokasi belum diatur di Site Studio.' : 'Lokasi kampus belum ditambahkan.';
      container.hidden = true;
      return;
    }
    if (this.mapLoading.has(containerId)) return;
    empty.hidden = true;
    container.hidden = false;
    this.mapLoading.add(containerId);
    try {
      const L = await loadLeaflet();
      const currentCampus = this.getSelectedCampus();
      const currentCenter = campusCenter(currentCampus);
      if (!currentCampus || !currentCenter) return;
      let map = this.maps.get(containerId);
      if (!map) {
        map = L.map(container, {
          zoomControl: !compact,
          attributionControl: true,
          scrollWheelZoom: !compact,
          dragging: true,
          tap: true
        }).setView(currentCenter, compact ? Math.min(this.data.defaultZoom || 17, 16) : this.data.defaultZoom || 17);
        L.tileLayer(OSM_TILE_URL, {
          maxZoom: 19,
          attribution: OSM_ATTRIBUTION
        }).addTo(map);
        this.maps.set(containerId, map);
      }
      map.setView(currentCenter, compact ? Math.min(this.data.defaultZoom || 17, 16) : this.data.defaultZoom || 17);
      map.eachLayer((layer) => {
        if (layer instanceof L.CircleMarker) map.removeLayer(layer);
      });
      L.circleMarker(currentCenter, { radius: compact ? 7 : 10, color: '#111723', weight: 3, fillColor: '#00e5ff', fillOpacity: 0.95 })
        .addTo(map)
        .bindTooltip(currentCampus.name, { direction: 'top' });
      if (!compact) {
        for (const building of currentCampus.buildings) {
          if (!Number.isFinite(building.latitude) || !Number.isFinite(building.longitude)) continue;
          const point = [building.latitude, building.longitude];
          const marker = L.circleMarker(point, { radius: 8, color: '#111723', weight: 2, fillColor: '#ffde00', fillOpacity: 0.95 }).addTo(map);
          marker.bindTooltip(building.name, { direction: 'top' });
          marker.on('click', () => {
            this.selectedBuildingId = building.id;
            this.selectedFloorId = building.floors[0]?.id || '';
            this.activeLayer = 'indoor';
            this.renderSelectors();
            this.renderIndoor();
            this.renderLayerState();
          });
        }
      }
      requestAnimationFrame(() => map.invalidateSize());
    } finally {
      this.mapLoading.delete(containerId);
    }
  }
}
