import { REPOSITORY_UNIVERSITY_ORG_UNITS } from '../../server/siteSchema.js';
import { UNIVERSITY_ORG_KIND_LABELS } from './universityOrgKinds.js';

const escapeHtml = (value) => String(value ?? '').replace(/[&<>"']/g, (character) => ({
  '&': '&amp;',
  '<': '&lt;',
  '>': '&gt;',
  '"': '&quot;',
  "'": '&#39;'
}[character]));



const createId = (prefix) => `${prefix}-${crypto.randomUUID().replaceAll('-', '')}`;

export const createUniversityStructureDraft = () => ({
  id: createId('university-term'),
  name: '',
  validFrom: '',
  validUntil: null,
  repositorySyncedAt: null,
  units: []
});

export const createUniversityUnitDraft = () => ({
  id: createId('university-unit'),
  name: '',
  kind: 'other',
  parentId: null,
  description: ''
});

export function renderUniversityOrganizationPanel(organization = { structures: [] }) {
  const structures = organization?.structures || [];
  return `
    <section class="university-org-studio">
      <h3>BAGAN ORGANISASI UNIVERSITAS</h3>
      <p class="studio-help">Struktur ini terpisah dari periode kepengurusan HMIF. Buat satu versi untuk setiap masa berlaku resmi, lalu susun hubungan induk antarunit.</p>
      <div class="university-org-source-note" role="note">
        Sinkronisasi repositori hanya tersedia untuk metadata universitas dan fakultas yang memang tercatat. Repositori tidak memuat susunan Rektorat atau unit resmi lainnya; unit tersebut tidak akan dibuat otomatis.
      </div>
      <button class="btn-tactical primary" type="button" data-university-structure-add>+ TAMBAH PERIODE STRUKTUR</button>
      ${structures.length ? structures.map((structure, structureIndex) => `
        <fieldset class="university-org-period" data-university-structure="${escapeHtml(structure.id)}">
          <legend>VERSI ${String(structureIndex + 1).padStart(2, '0')}</legend>
          <div class="university-org-period-heading">
            <label class="form-group"><span class="form-label">NAMA / PERIODE</span><input class="form-input" name="universityStructure.${structureIndex}.name" maxlength="120" value="${escapeHtml(structure.name)}" required placeholder="Contoh: Struktur 2026–2030" /></label>
            <label class="form-group"><span class="form-label">BERLAKU MULAI</span><input class="form-input" type="date" name="universityStructure.${structureIndex}.validFrom" value="${escapeHtml(structure.validFrom)}" required /></label>
            <label class="form-group"><span class="form-label">BERLAKU SAMPAI</span><input class="form-input" type="date" name="universityStructure.${structureIndex}.validUntil" value="${escapeHtml(structure.validUntil || '')}" /></label>
          </div>
          <div class="university-org-actions">
            <button class="btn-tactical" type="button" data-university-sync="${structureIndex}">SINKRONKAN INFO REPOSITORI</button>
            <button class="btn-tactical danger" type="button" data-university-structure-delete="${structureIndex}">HAPUS PERIODE</button>
          </div>
          ${structure.repositorySyncedAt ? `<p class="studio-help">Metadata repositori terakhir disinkronkan: ${escapeHtml(structure.repositorySyncedAt)}</p>` : ''}
          <h4>UNIT DAN HUBUNGAN INDUK</h4>
          ${structure.units.length ? structure.units.map((unit, unitIndex) => `
            <div class="university-org-unit-editor" data-university-unit="${unitIndex}">
              <label class="form-group"><span class="form-label">NAMA UNIT</span><input class="form-input" name="universityStructure.${structureIndex}.unit.${unitIndex}.name" maxlength="120" value="${escapeHtml(unit.name)}" required /></label>
              <label class="form-group"><span class="form-label">JENIS</span><select class="form-select" name="universityStructure.${structureIndex}.unit.${unitIndex}.kind">${Object.entries(UNIVERSITY_ORG_KIND_LABELS).map(([kind, label]) => `<option value="${kind}" ${unit.kind === kind ? 'selected' : ''}>${label}</option>`).join('')}</select></label>
              <label class="form-group"><span class="form-label">UNIT INDUK</span><select class="form-select" name="universityStructure.${structureIndex}.unit.${unitIndex}.parentId"><option value="">Tingkat utama</option>${structure.units.filter(({ id }) => id !== unit.id).map((parent) => `<option value="${escapeHtml(parent.id)}" ${unit.parentId === parent.id ? 'selected' : ''}>${escapeHtml(parent.name || 'Unit tanpa nama')}</option>`).join('')}</select></label>
              <label class="form-group"><span class="form-label">KETERANGAN</span><input class="form-input" name="universityStructure.${structureIndex}.unit.${unitIndex}.description" maxlength="500" value="${escapeHtml(unit.description)}" /></label>
              <button class="btn-tactical danger" type="button" data-university-unit-delete="${structureIndex}.${unitIndex}" aria-label="Hapus unit ${escapeHtml(unit.name || unitIndex + 1)}">HAPUS</button>
            </div>
          `).join('') : '<p class="studio-help">Belum ada unit. Tambahkan unit resmi atau gunakan sinkronisasi repositori.</p>'}
          <button class="btn-tactical" type="button" data-university-unit-add="${structureIndex}">+ TAMBAH UNIT</button>
        </fieldset>
      `).join('') : '<p class="studio-help">Belum ada versi struktur universitas. Mulai dengan periode resmi yang akan berlaku.</p>'}
    </section>`;
}

export function collectUniversityOrganizationForm(form, organization = { structures: [] }) {
  const read = (name, fallback = '') => form.elements[name]?.value ?? fallback;
  return {
    structures: (organization?.structures || []).map((structure, structureIndex) => ({
      ...structuredClone(structure),
      name: read(`universityStructure.${structureIndex}.name`, structure.name),
      validFrom: read(`universityStructure.${structureIndex}.validFrom`, structure.validFrom),
      validUntil: read(`universityStructure.${structureIndex}.validUntil`, structure.validUntil || '') || null,
      units: structure.units.map((unit, unitIndex) => ({
        ...structuredClone(unit),
        name: read(`universityStructure.${structureIndex}.unit.${unitIndex}.name`, unit.name),
        kind: read(`universityStructure.${structureIndex}.unit.${unitIndex}.kind`, unit.kind),
        parentId: read(`universityStructure.${structureIndex}.unit.${unitIndex}.parentId`, unit.parentId || '') || null,
        description: read(`universityStructure.${structureIndex}.unit.${unitIndex}.description`, unit.description)
      }))
    }))
  };
}

export function bindUniversityOrganizationPanel(studio, form, body) {
  const update = (config) => {
    studio.config = config;
    studio.activeTab = 'university';
    studio.render(body);
  };
  const collect = () => studio.tryCollectConfig(form, body);

  body.querySelector('[data-university-structure-add]')?.addEventListener('click', () => {
    const config = collect();
    if (!config) return;
    const structures = config.content.data.universityOrganization.structures;
    if (structures.length >= 50) {
      studio.feedback(body, 'BATAS 50 VERSI STRUKTUR UNIVERSITAS TERCAPAI.');
      return;
    }
    structures.push(createUniversityStructureDraft());
    const index = structures.length - 1;
    update(config);
    body.querySelector(`[name="universityStructure.${index}.name"]`)?.focus();
  });
  body.querySelectorAll('[data-university-structure-delete]').forEach((button) => button.addEventListener('click', () => {
    const config = collect();
    if (!config) return;
    config.content.data.universityOrganization.structures.splice(Number(button.dataset.universityStructureDelete), 1);
    update(config);
  }));
  body.querySelectorAll('[data-university-unit-add]').forEach((button) => button.addEventListener('click', () => {
    const config = collect();
    if (!config) return;
    const structureIndex = Number(button.dataset.universityUnitAdd);
    const units = config.content.data.universityOrganization.structures[structureIndex]?.units;
    if (!units || units.length >= 250) return;
    units.push(createUniversityUnitDraft());
    update(config);
    body.querySelector(`[name="universityStructure.${structureIndex}.unit.${units.length - 1}.name"]`)?.focus();
  }));
  body.querySelectorAll('[data-university-unit-delete]').forEach((button) => button.addEventListener('click', () => {
    const config = collect();
    if (!config) return;
    const [structureIndex, unitIndex] = button.dataset.universityUnitDelete.split('.').map(Number);
    const units = config.content.data.universityOrganization.structures[structureIndex]?.units;
    const [removed] = units?.splice(unitIndex, 1) || [];
    if (removed) {
      for (const unit of units) {
        if (unit.parentId === removed.id) unit.parentId = removed.parentId || null;
      }
    }
    update(config);
  }));
  body.querySelectorAll('[data-university-sync]').forEach((button) => button.addEventListener('click', () => {
    const config = collect();
    if (!config) return;
    const structure = config.content.data.universityOrganization.structures[Number(button.dataset.universitySync)];
    if (!structure) return;
    const unitsById = new Map(structure.units.map((unit) => [unit.id, unit]));
    const missingUnits = REPOSITORY_UNIVERSITY_ORG_UNITS.filter(({ id }) => !unitsById.has(id));
    if (structure.units.length + missingUnits.length > 250) {
      studio.feedback(body, 'BATAS 250 UNIT PERIODE TERCAPAI; HAPUS UNIT TERLEBIH DAHULU SEBELUM SINKRONISASI.');
      return;
    }
    for (const sourceUnit of REPOSITORY_UNIVERSITY_ORG_UNITS) {
      const existing = unitsById.get(sourceUnit.id);
      if (existing) Object.assign(existing, structuredClone(sourceUnit));
      else structure.units.push(structuredClone(sourceUnit));
    }
    structure.repositorySyncedAt = new Date().toISOString();
    update(config);
    studio.feedback(body, 'METADATA UNIVERSITAS DAN FAKULTAS YANG TERSEDIA DI REPOSITORI TELAH DISINKRONKAN.');
  }));
}
