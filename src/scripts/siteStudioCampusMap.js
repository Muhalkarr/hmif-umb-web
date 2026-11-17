const escapeHtml = (value) => String(value ?? '').replace(/[&<>"']/g, (character) => ({
  '&': '&amp;',
  '<': '&lt;',
  '>': '&gt;',
  '"': '&quot;',
  "'": '&#39;'
}[character]));

const createMapId = (prefix) => `${prefix}-${crypto.randomUUID().replaceAll('-', '')}`;

const numberField = (name, label, value, { min = 0, max = 10000, step = 1 } = {}) => `
  <label class="form-group"><span class="form-label">${label}</span>
    <input class="form-input" type="number" name="${name}" min="${min}" max="${max}" step="${step}" value="${value ?? ''}" />
  </label>`;

const textField = (name, label, value, maxLength = 160) => `
  <label class="form-group"><span class="form-label">${label}</span>
    <input class="form-input" type="text" name="${name}" maxlength="${maxLength}" value="${escapeHtml(value)}" />
  </label>`;

const selectField = (name, label, options, value) => `
  <label class="form-group"><span class="form-label">${label}</span>
    <select class="form-select" name="${name}">${options.map(([optionValue, optionLabel]) => `
      <option value="${escapeHtml(optionValue)}" ${value === optionValue ? 'selected' : ''}>${escapeHtml(optionLabel)}</option>`).join('')}
    </select>
  </label>`;

const renderFloorCanvas = (floor, campusIndex, buildingIndex, floorIndex, selectedFeatureId) => {
  const image = floor.planImage
    ? `<image href="${escapeHtml(floor.planImage)}" x="0" y="0" width="1000" height="700" preserveAspectRatio="none" />`
    : '';
  const features = floor.features.map((feature) => {
    const color = floor.legend.find(({ id }) => id === feature.legendId)?.color || '#00e5ff';
    const selected = feature.id === selectedFeatureId;
    const focusStyle = selected ? 'stroke="#ffffff" stroke-width="8"' : '';
    if (feature.kind === 'marker') {
      return `<g data-map-editor-feature="${escapeHtml(feature.id)}" tabindex="0" role="button" aria-label="${escapeHtml(feature.label)}"><circle cx="${feature.x}" cy="${feature.y}" r="14" fill="${color}" ${focusStyle} /><text x="${feature.x + 20}" y="${feature.y + 5}">${escapeHtml(feature.label)}</text></g>`;
    }
    if (feature.kind === 'area') {
      return `<g data-map-editor-feature="${escapeHtml(feature.id)}" tabindex="0" role="button" aria-label="${escapeHtml(feature.label)}"><rect x="${feature.x}" y="${feature.y}" width="${feature.width}" height="${feature.height}" fill="${color}" fill-opacity=".26" stroke="${color}" stroke-width="4" ${focusStyle} /><text x="${feature.x + 8}" y="${feature.y + 26}">${escapeHtml(feature.label)}</text></g>`;
    }
    const points = feature.points.map(({ x, y }) => `${x},${y}`).join(' ');
    return `<g data-map-editor-feature="${escapeHtml(feature.id)}" tabindex="0" role="button" aria-label="${escapeHtml(feature.label)}"><polyline points="${points}" fill="none" stroke="${color}" stroke-width="8" stroke-linecap="round" ${focusStyle} /><text x="${feature.points[0].x + 8}" y="${feature.points[0].y - 8}">${escapeHtml(feature.label)}</text></g>`;
  }).join('');
  return `
    <div class="campus-map-editor-canvas" data-map-editor-canvas="${campusIndex}.${buildingIndex}.${floorIndex}">
      <svg viewBox="0 0 1000 700" role="group" aria-label="Kanvas editor denah ${escapeHtml(floor.name)}">
        <rect x="0" y="0" width="1000" height="700" fill="#101722" />
        ${image}${features}
      </svg>
    </div>`;
};

const renderLegend = (floor, campusIndex, buildingIndex, floorIndex) => floor.legend.map((item, legendIndex) => `
  <div class="campus-map-editor-row">
    ${textField(`campusMap.${campusIndex}.${buildingIndex}.${floorIndex}.legend.${legendIndex}.label`, 'Label legenda', item.label, 80)}
    <label class="form-group"><span class="form-label">WARNA</span><input type="color" name="campusMap.${campusIndex}.${buildingIndex}.${floorIndex}.legend.${legendIndex}.color" value="${escapeHtml(item.color)}" /></label>
    <button class="btn-tactical" type="button" data-map-delete-legend="${campusIndex}.${buildingIndex}.${floorIndex}.${legendIndex}" aria-label="Hapus kategori ${escapeHtml(item.label)}">HAPUS</button>
  </div>`).join('');

const renderFeatures = (floor, campusIndex, buildingIndex, floorIndex) => floor.features.map((feature, featureIndex) => `
  <fieldset class="campus-map-feature" data-map-editor-feature-row="${escapeHtml(feature.id)}">
    <legend>${escapeHtml(feature.label || `Fitur ${featureIndex + 1}`)}</legend>
    <div class="admin-form-grid">
      ${textField(`campusMap.${campusIndex}.${buildingIndex}.${floorIndex}.features.${featureIndex}.label`, 'Label', feature.label, 100)}
      ${selectField(`campusMap.${campusIndex}.${buildingIndex}.${floorIndex}.features.${featureIndex}.legendId`, 'Kategori legenda', [['', 'Tanpa kategori'], ...floor.legend.map(({ id, label }) => [id, label])], feature.legendId || '')}
      ${numberField(`campusMap.${campusIndex}.${buildingIndex}.${floorIndex}.features.${featureIndex}.x`, 'POSISI X', feature.x, { min: 0, max: 1000 })}
      ${numberField(`campusMap.${campusIndex}.${buildingIndex}.${floorIndex}.features.${featureIndex}.y`, 'POSISI Y', feature.y, { min: 0, max: 700 })}
      ${feature.kind === 'area' ? numberField(`campusMap.${campusIndex}.${buildingIndex}.${floorIndex}.features.${featureIndex}.width`, 'LEBAR', feature.width, { min: 1, max: 1000 }) : ''}
      ${feature.kind === 'area' ? numberField(`campusMap.${campusIndex}.${buildingIndex}.${floorIndex}.features.${featureIndex}.height`, 'TINGGI', feature.height, { min: 1, max: 700 }) : ''}
      <label class="form-group"><span class="form-label">DESKRIPSI</span><textarea class="form-textarea" name="campusMap.${campusIndex}.${buildingIndex}.${floorIndex}.features.${featureIndex}.description" maxlength="500">${escapeHtml(feature.description)}</textarea></label>
    </div>
    <button class="btn-tactical" type="button" data-map-delete-feature="${campusIndex}.${buildingIndex}.${floorIndex}.${featureIndex}">HAPUS OBJEK</button>
  </fieldset>`).join('');

export function renderCampusMapPanel(campusMap, assets = [], selectedFeatureId = '') {
  const data = campusMap || { summary: '', publicWidgetVisible: true, defaultZoom: 17, campuses: [] };
  const imageAssets = assets.filter(({ kind }) => kind === 'image');
  return `
    <section class="campus-map-studio">
      <h3>PETA GEOGRAFIS & DENAH KAMPUS</h3>
      <p class="studio-help">Isi koordinat nyata untuk peta OpenStreetMap. Buat beberapa kampus, gedung, lantai, legenda, dan fitur denah vektor; unggah denah gambar untuk menjadikannya lapisan dasar. Data kosong tidak diisi dengan lokasi contoh.</p>
      <div class="admin-form-grid">
        ${textField('campusMap.navigationLabel', 'LABEL MENU SIDEBAR', data.navigationLabel || 'Peta Kampus', 48)}
        <label class="form-group"><span class="form-label">RINGKASAN PUBLIK</span><textarea class="form-textarea" name="campusMap.summary" maxlength="500">${escapeHtml(data.summary)}</textarea></label>
        ${numberField('campusMap.defaultZoom', 'ZOOM GEOGRAFIS AWAL', data.defaultZoom ?? 17, { min: 1, max: 20 })}
      </div>
      <label class="studio-toggle"><input type="checkbox" name="campusMap.publicWidgetVisible" ${data.publicWidgetVisible !== false ? 'checked' : ''} /> <span>Tampilkan ringkasan peta interaktif pada sidebar publik</span></label>
      <div class="campus-map-studio-actions">
        <strong>${data.campuses.length} kampus</strong>
        <button class="btn-tactical primary" type="button" data-map-add-campus>+ TAMBAH KAMPUS</button>
      </div>
      ${data.campuses.length ? data.campuses.map((campus, campusIndex) => `
        <details class="campus-map-editor-card" open>
          <summary>${escapeHtml(campus.name || `Kampus ${campusIndex + 1}`)}</summary>
          <div class="campus-map-editor-card-body">
            <div class="admin-form-grid">
              ${textField(`campusMap.${campusIndex}.name`, 'NAMA KAMPUS', campus.name, 120)}
              ${textField(`campusMap.${campusIndex}.address`, 'ALAMAT', campus.address, 240)}
              ${numberField(`campusMap.${campusIndex}.latitude`, 'LINTANG / LATITUDE', campus.latitude, { min: -90, max: 90, step: 0.000001 })}
              ${numberField(`campusMap.${campusIndex}.longitude`, 'BUJUR / LONGITUDE', campus.longitude, { min: -180, max: 180, step: 0.000001 })}
            </div>
            <div class="campus-map-studio-actions">
              <h4>GEDUNG</h4>
              <button class="btn-tactical" type="button" data-map-add-building="${campusIndex}">+ TAMBAH GEDUNG</button>
              <button class="btn-tactical danger" type="button" data-map-delete-campus="${campusIndex}">HAPUS KAMPUS</button>
            </div>
            ${campus.buildings.map((building, buildingIndex) => `
              <details class="campus-map-editor-card" open>
                <summary>${escapeHtml(building.name || `Gedung ${buildingIndex + 1}`)}</summary>
                <div class="campus-map-editor-card-body">
                  <div class="admin-form-grid">
                    ${textField(`campusMap.${campusIndex}.${buildingIndex}.name`, 'NAMA GEDUNG', building.name, 120)}
                    <label class="form-group"><span class="form-label">DESKRIPSI</span><textarea class="form-textarea" name="campusMap.${campusIndex}.${buildingIndex}.description" maxlength="500">${escapeHtml(building.description)}</textarea></label>
                    ${numberField(`campusMap.${campusIndex}.${buildingIndex}.latitude`, 'LINTANG GEDUNG (OPSIONAL)', building.latitude, { min: -90, max: 90, step: 0.000001 })}
                    ${numberField(`campusMap.${campusIndex}.${buildingIndex}.longitude`, 'BUJUR GEDUNG (OPSIONAL)', building.longitude, { min: -180, max: 180, step: 0.000001 })}
                  </div>
                  <div class="campus-map-studio-actions">
                    <h4>LANTAI & DENAH</h4>
                    <button class="btn-tactical" type="button" data-map-add-floor="${campusIndex}.${buildingIndex}">+ TAMBAH LANTAI</button>
                    <button class="btn-tactical danger" type="button" data-map-delete-building="${campusIndex}.${buildingIndex}">HAPUS GEDUNG</button>
                  </div>
                  ${building.floors.map((floor, floorIndex) => `
                    <details class="campus-map-editor-floor" open>
                      <summary>${escapeHtml(floor.name || `Lantai ${floorIndex + 1}`)} · ${floor.features.length} objek</summary>
                      <div class="campus-map-editor-card-body">
                        <div class="admin-form-grid">
                          ${textField(`campusMap.${campusIndex}.${buildingIndex}.${floorIndex}.name`, 'NAMA LANTAI', floor.name, 120)}
                          ${numberField(`campusMap.${campusIndex}.${buildingIndex}.${floorIndex}.level`, 'TINGKAT (B1 = -1)', floor.level, { min: -10, max: 100 })}
                          ${numberField(`campusMap.${campusIndex}.${buildingIndex}.${floorIndex}.widthMeters`, 'LEBAR DENAH (M)', floor.widthMeters, { min: 0.1, max: 10000, step: 0.1 })}
                          ${numberField(`campusMap.${campusIndex}.${buildingIndex}.${floorIndex}.heightMeters`, 'TINGGI DENAH (M)', floor.heightMeters, { min: 0.1, max: 10000, step: 0.1 })}
                          ${numberField(`campusMap.${campusIndex}.${buildingIndex}.${floorIndex}.scaleDenominator`, 'SKALA DENOMINATOR (1:N)', floor.scaleDenominator, { min: 1, max: 100000 })}
                          ${selectField(`campusMap.${campusIndex}.${buildingIndex}.${floorIndex}.planImage`, 'GAMBAR DENAH DASAR', [['', 'Tanpa gambar'], ...imageAssets.map(({ id, original_name }) => [`/api/site/assets/${id}/file`, original_name])], floor.planImage || '')}
                        </div>
                        <label class="btn-tactical campus-map-upload-label">UNGGAH DENAH PNG/JPG/WEBP
                          <input type="file" accept="image/png,image/jpeg,image/webp" data-map-floor-upload="${campusIndex}.${buildingIndex}.${floorIndex}" />
                        </label>
                        ${renderFloorCanvas(floor, campusIndex, buildingIndex, floorIndex, selectedFeatureId)}
                        <p class="studio-help">Pilih alat lalu gambar pada denah. Klik objek untuk mengedit kategorinya. Koordinat vektor mengikuti kanvas 1000 × 700.</p>
                        <div class="campus-map-draw-tools" role="group" aria-label="Alat gambar denah">
                          <button class="btn-tactical" type="button" data-map-draw-kind="marker">TITIK</button>
                          <button class="btn-tactical" type="button" data-map-draw-kind="area">AREA</button>
                          <button class="btn-tactical" type="button" data-map-draw-kind="path">JALUR</button>
                          <button class="btn-tactical" type="button" data-map-add-legend="${campusIndex}.${buildingIndex}.${floorIndex}">+ LEGENDA</button>
                        </div>
                        ${floor.legend.length ? `<h5>LEGENDA</h5>${renderLegend(floor, campusIndex, buildingIndex, floorIndex)}` : '<p class="studio-help">Tambahkan legenda agar fitur denah memiliki kategori dan warna.</p>'}
                        ${floor.features.length ? `<h5>OBJEK PETA</h5>${renderFeatures(floor, campusIndex, buildingIndex, floorIndex)}` : '<p class="studio-help">Belum ada objek. Gunakan alat titik, area, atau jalur pada kanvas.</p>'}
                        <button class="btn-tactical danger" type="button" data-map-delete-floor="${campusIndex}.${buildingIndex}.${floorIndex}">HAPUS LANTAI</button>
                      </div>
                    </details>
                  `).join('')}
                </div>
              </details>
            `).join('')}
          </div>
        </details>
      `).join('') : '<p class="campus-map-empty-note">Belum ada kampus. Tambahkan lokasi sebenarnya untuk mulai membuat peta.</p>'}
    </section>`;
}

export function collectCampusMapForm(form, current) {
  const read = (name, field = 'value') => form.elements[name]?.[field];
  const number = (name, fallback = null) => {
    const value = read(name);
    return value === undefined ? fallback : value === '' ? null : Number(value);
  };
  return {
    navigationLabel: read('campusMap.navigationLabel') ?? current.navigationLabel ?? 'Peta Kampus',
    summary: read('campusMap.summary') ?? current.summary,
    publicWidgetVisible: read('campusMap.publicWidgetVisible', 'checked') ?? current.publicWidgetVisible,
    defaultZoom: number('campusMap.defaultZoom', current.defaultZoom),
    campuses: current.campuses.map((campus, campusIndex) => ({
      ...campus,
      name: read(`campusMap.${campusIndex}.name`) ?? campus.name,
      address: read(`campusMap.${campusIndex}.address`) ?? campus.address,
      latitude: number(`campusMap.${campusIndex}.latitude`, campus.latitude),
      longitude: number(`campusMap.${campusIndex}.longitude`, campus.longitude),
      buildings: campus.buildings.map((building, buildingIndex) => ({
        ...building,
        name: read(`campusMap.${campusIndex}.${buildingIndex}.name`) ?? building.name,
        description: read(`campusMap.${campusIndex}.${buildingIndex}.description`) ?? building.description,
        latitude: number(`campusMap.${campusIndex}.${buildingIndex}.latitude`, building.latitude),
        longitude: number(`campusMap.${campusIndex}.${buildingIndex}.longitude`, building.longitude),
        floors: building.floors.map((floor, floorIndex) => ({
          ...floor,
          name: read(`campusMap.${campusIndex}.${buildingIndex}.${floorIndex}.name`) ?? floor.name,
          level: number(`campusMap.${campusIndex}.${buildingIndex}.${floorIndex}.level`, floor.level),
          widthMeters: number(`campusMap.${campusIndex}.${buildingIndex}.${floorIndex}.widthMeters`, floor.widthMeters),
          heightMeters: number(`campusMap.${campusIndex}.${buildingIndex}.${floorIndex}.heightMeters`, floor.heightMeters),
          scaleDenominator: number(`campusMap.${campusIndex}.${buildingIndex}.${floorIndex}.scaleDenominator`, floor.scaleDenominator),
          planImage: read(`campusMap.${campusIndex}.${buildingIndex}.${floorIndex}.planImage`) ?? floor.planImage,
          legend: floor.legend.map((entry, legendIndex) => ({
            ...entry,
            label: read(`campusMap.${campusIndex}.${buildingIndex}.${floorIndex}.legend.${legendIndex}.label`) ?? entry.label,
            color: read(`campusMap.${campusIndex}.${buildingIndex}.${floorIndex}.legend.${legendIndex}.color`) ?? entry.color
          })),
          features: floor.features.map((feature, featureIndex) => ({
            ...feature,
            label: read(`campusMap.${campusIndex}.${buildingIndex}.${floorIndex}.features.${featureIndex}.label`) ?? feature.label,
            description: read(`campusMap.${campusIndex}.${buildingIndex}.${floorIndex}.features.${featureIndex}.description`) ?? feature.description,
            legendId: read(`campusMap.${campusIndex}.${buildingIndex}.${floorIndex}.features.${featureIndex}.legendId`) || null,
            x: number(`campusMap.${campusIndex}.${buildingIndex}.${floorIndex}.features.${featureIndex}.x`, feature.x),
            y: number(`campusMap.${campusIndex}.${buildingIndex}.${floorIndex}.features.${featureIndex}.y`, feature.y),
            width: number(`campusMap.${campusIndex}.${buildingIndex}.${floorIndex}.features.${featureIndex}.width`, feature.width),
            height: number(`campusMap.${campusIndex}.${buildingIndex}.${floorIndex}.features.${featureIndex}.height`, feature.height)
          }))
        }))
      }))
    }))
  };
}

export const createCampusDraft = () => ({
  id: createMapId('campus'),
  name: '',
  address: '',
  latitude: null,
  longitude: null,
  buildings: []
});

export const createBuildingDraft = () => ({
  id: createMapId('building'),
  name: '',
  description: '',
  latitude: null,
  longitude: null,
  floors: []
});

export const createFloorDraft = (index) => ({
  id: createMapId('floor'),
  name: `Lantai ${index + 1}`,
  level: index,
  widthMeters: 30,
  heightMeters: 20,
  scaleDenominator: 100,
  planImage: '',
  legend: [],
  features: []
});

export function bindCampusMapPanel(studio, form, body) {
  const updateMap = (mutation, feedback) => {
    const collected = studio.tryCollectConfig(form, body);
    if (!collected) return;
    mutation(collected.content.data.campusMap);
    studio.config = collected;
    studio.activeTab = 'map';
    studio.render(body);
    if (feedback) studio.feedback(body, feedback);
  };
  body.querySelector('[data-map-add-campus]')?.addEventListener('click', () => {
    updateMap((map) => map.campuses.push(createCampusDraft()), 'KAMPUS DITAMBAHKAN. ISI NAMA DAN KOORDINAT NYATA.');
  });
  body.querySelectorAll('[data-map-add-building]').forEach((button) => button.addEventListener('click', () => {
    const campusIndex = Number(button.dataset.mapAddBuilding);
    updateMap((map) => map.campuses[campusIndex]?.buildings.push(createBuildingDraft()), 'GEDUNG DITAMBAHKAN.');
  }));
  body.querySelectorAll('[data-map-add-floor]').forEach((button) => button.addEventListener('click', () => {
    const [campusIndex, buildingIndex] = button.dataset.mapAddFloor.split('.').map(Number);
    updateMap((map) => {
      const floors = map.campuses[campusIndex]?.buildings[buildingIndex]?.floors;
      if (floors) floors.push(createFloorDraft(floors.length));
    }, 'LANTAI DITAMBAHKAN. ATUR DIMENSI, SKALA, DAN DENAHNYA.');
  }));
  body.querySelectorAll('[data-map-delete-campus]').forEach((button) => button.addEventListener('click', () => {
    updateMap((map) => map.campuses.splice(Number(button.dataset.mapDeleteCampus), 1), 'KAMPUS DIHAPUS DARI DRAFT.');
  }));
  body.querySelectorAll('[data-map-delete-building]').forEach((button) => button.addEventListener('click', () => {
    const [campusIndex, buildingIndex] = button.dataset.mapDeleteBuilding.split('.').map(Number);
    updateMap((map) => map.campuses[campusIndex]?.buildings.splice(buildingIndex, 1), 'GEDUNG DIHAPUS DARI DRAFT.');
  }));
  body.querySelectorAll('[data-map-delete-floor]').forEach((button) => button.addEventListener('click', () => {
    const [campusIndex, buildingIndex, floorIndex] = button.dataset.mapDeleteFloor.split('.').map(Number);
    updateMap((map) => map.campuses[campusIndex]?.buildings[buildingIndex]?.floors.splice(floorIndex, 1), 'LANTAI DIHAPUS DARI DRAFT.');
  }));
  body.querySelectorAll('[data-map-add-legend]').forEach((button) => button.addEventListener('click', () => {
    const [campusIndex, buildingIndex, floorIndex] = button.dataset.mapAddLegend.split('.').map(Number);
    updateMap((map) => {
      const legend = map.campuses[campusIndex]?.buildings[buildingIndex]?.floors[floorIndex]?.legend;
      if (legend) legend.push({ id: createMapId('legend'), label: 'Fasilitas baru', color: '#00e5ff' });
    }, 'KATEGORI LEGENDA DITAMBAHKAN.');
  }));
  body.querySelectorAll('[data-map-delete-legend]').forEach((button) => button.addEventListener('click', () => {
    const [campusIndex, buildingIndex, floorIndex, legendIndex] = button.dataset.mapDeleteLegend.split('.').map(Number);
    updateMap((map) => {
      const floor = map.campuses[campusIndex]?.buildings[buildingIndex]?.floors[floorIndex];
      if (!floor) return;
      const [removed] = floor.legend.splice(legendIndex, 1);
      if (removed) floor.features.forEach((feature) => {
        if (feature.legendId === removed.id) feature.legendId = null;
      });
    }, 'KATEGORI LEGENDA DIHAPUS.');
  }));
  body.querySelectorAll('[data-map-delete-feature]').forEach((button) => button.addEventListener('click', () => {
    const [campusIndex, buildingIndex, floorIndex, featureIndex] = button.dataset.mapDeleteFeature.split('.').map(Number);
    updateMap((map) => map.campuses[campusIndex]?.buildings[buildingIndex]?.floors[floorIndex]?.features.splice(featureIndex, 1), 'OBJEK PETA DIHAPUS.');
  }));
  body.querySelectorAll('[data-map-draw-kind]').forEach((button) => button.addEventListener('click', () => {
    studio.campusMapDrawKind = button.dataset.mapDrawKind;
    studio.campusMapDraftPoints = [];
    body.querySelectorAll('[data-map-draw-kind]').forEach((tool) => {
      tool.classList.toggle('active', tool === button);
      tool.setAttribute('aria-pressed', String(tool === button));
    });
  }));
  body.querySelectorAll('[data-map-editor-canvas]').forEach((canvas) => {
    const svg = canvas.querySelector('svg');
    if (!svg) return;
    const [campusIndex, buildingIndex, floorIndex] = canvas.dataset.mapEditorCanvas.split('.').map(Number);
    const position = (event) => {
      const bounds = svg.getBoundingClientRect();
      return {
        x: Math.max(0, Math.min(1000, Math.round((event.clientX - bounds.left) / bounds.width * 1000))),
        y: Math.max(0, Math.min(700, Math.round((event.clientY - bounds.top) / bounds.height * 700)))
      };
    };
    let areaStart = null;
    const addMapFeature = (kind, point, dimensions = {}, points = []) => {
      updateMap((map) => {
        const floor = map.campuses[campusIndex]?.buildings[buildingIndex]?.floors[floorIndex];
        if (!floor) return;
        const feature = {
          id: createMapId('feature'),
          kind,
          label: kind === 'marker' ? 'Titik baru' : kind === 'area' ? 'Area baru' : 'Jalur baru',
          description: '',
          legendId: floor.legend[0]?.id || null,
          x: point.x,
          y: point.y,
          width: dimensions.width || 0,
          height: dimensions.height || 0,
          points
        };
        floor.features.push(feature);
        studio.selectedCampusMapFeatureId = feature.id;
      }, 'OBJEK DENAH DITAMBAHKAN.');
      studio.campusMapDrawKind = '';
      studio.campusMapDraftPoints = [];
    };
    svg.addEventListener('pointerdown', (event) => {
      if (studio.campusMapDrawKind !== 'area') return;
      areaStart = position(event);
      svg.setPointerCapture(event.pointerId);
      event.preventDefault();
    });
    svg.addEventListener('pointerup', (event) => {
      if (studio.campusMapDrawKind !== 'area' || !areaStart) return;
      const end = position(event);
      const point = { x: Math.min(areaStart.x, end.x), y: Math.min(areaStart.y, end.y) };
      const dimensions = { width: Math.abs(end.x - areaStart.x), height: Math.abs(end.y - areaStart.y) };
      areaStart = null;
      if (dimensions.width < 5 || dimensions.height < 5) return;
      event.preventDefault();
      addMapFeature('area', point, dimensions);
    });
    svg.addEventListener('click', (event) => {
      const selected = event.target.closest('[data-map-editor-feature]');
      if (selected) {
        studio.selectedCampusMapFeatureId = selected.dataset.mapEditorFeature;
        const collected = studio.tryCollectConfig(form, body);
        if (!collected) return;
        studio.config = collected;
        studio.activeTab = 'map';
        studio.render(body);
        return;
      }
      const point = position(event);
      if (studio.campusMapDrawKind === 'marker') addMapFeature('marker', point);
      else if (studio.campusMapDrawKind === 'path') studio.campusMapDraftPoints.push(point);
    });
    svg.addEventListener('dblclick', (event) => {
      if (studio.campusMapDrawKind !== 'path' || studio.campusMapDraftPoints.length < 2) return;
      event.preventDefault();
      const points = studio.campusMapDraftPoints.splice(0);
      addMapFeature('path', points[0], {}, points);
    });
  });
  body.querySelectorAll('[data-map-floor-upload]').forEach((input) => input.addEventListener('change', async () => {
    const file = input.files[0];
    if (!file) return;
    if (file.size > 5 * 1024 * 1024) return studio.feedback(body, 'FILE DENAH MELEBIHI BATAS 5 MB.');
    const collected = studio.tryCollectConfig(form, body);
    if (!collected) return;
    const result = await studio.api.uploadSiteAsset(file);
    if (!result.ok) return studio.feedback(body, result.error);
    const [campusIndex, buildingIndex, floorIndex] = input.dataset.mapFloorUpload.split('.').map(Number);
    collected.content.data.campusMap.campuses[campusIndex].buildings[buildingIndex].floors[floorIndex].planImage = result.data.asset.url;
    studio.config = collected;
    studio.assets = [result.data.asset, ...studio.assets.filter((asset) => asset.id !== result.data.asset.id)];
    studio.activeTab = 'map';
    studio.render(body);
    studio.feedback(body, `DENAH ${result.data.asset.original_name} DIUNGGAH DAN DIPILIH.`);
  }));
}
