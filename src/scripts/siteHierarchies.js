import { UNIVERSITY_ORG_KIND_LABELS } from './universityOrgKinds.js';

const BUILTIN_PAGE_LABELS = {
  dashboard: 'Dashboard',
  vision: 'Visi dan Misi',
  knowledge: 'Pusat Akademik',
  showcase: 'Karya Mahasiswa',
  career: 'Alumni dan Karier',
  squad: 'Struktur Pengurus HMIF',
  cohort: 'Batalion Angkatan',
  proker: 'Program Kerja',
  voting: 'E-Voting',
  inventory: 'Inventaris',
  calendar: 'Kalender',
  doctrine: 'Dokumen Organisasi',
  intel: 'Berita',
  commlink: 'Aspirasi dan Kontak',
  'campus-map': 'Peta Kampus',
  'site-map': 'Peta Navigasi Situs',
  'university-organization': 'Struktur Universitas'
};

const getLocalDate = () => {
  const date = new Date();
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
};

const formatValidity = (structure) => {
  const start = new Date(`${structure.validFrom}T00:00:00`).toLocaleDateString('id-ID', { dateStyle: 'medium' });
  const end = structure.validUntil
    ? new Date(`${structure.validUntil}T00:00:00`).toLocaleDateString('id-ID', { dateStyle: 'medium' })
    : 'berlanjut';
  return `${start} – ${end}`;
};

export class SiteHierarchiesView {
  constructor(switchTab, canAccessTab = () => true) {
    this.switchTab = switchTab;
    this.canAccessTab = canAccessTab;
    this.config = null;
    this.selectedUniversityStructureId = '';
  }

  setConfig(config) {
    this.config = config;
    this.renderSiteNavigation();
    this.renderUniversityOrganization();
  }

  renderSiteNavigation() {
    const container = document.getElementById('site-navigation-map');
    if (!container) return;
    container.replaceChildren();
    const pages = this.config?.pages || [];
    const customPages = this.config?.content?.customPages || [];
    const nodes = this.config?.content?.siteMapNodes || [];
    const labels = new Map([
      ...pages.map((page) => [
        page.id,
        this.config?.content?.sectionTitles?.[page.id] || BUILTIN_PAGE_LABELS[page.id] || page.id
      ]),
      ...customPages.map((page) => [`custom-${page.id}`, page.title])
    ]);
    const visible = new Map([
      ...pages.map((page) => [page.id, page.visible && this.canAccessTab(page.id)]),
      ...customPages.map((page) => {
        const id = `custom-${page.id}`;
        return [id, page.visible && this.canAccessTab(id)];
      })
    ]);
    const childrenByParent = new Map();
    for (const node of nodes) {
      const parentId = node.parentId || '';
      const children = childrenByParent.get(parentId) || [];
      children.push(node);
      childrenByParent.set(parentId, children);
    }

    let renderedPageCount = 0;
    const addLevel = (parentId, list, ancestors = new Set()) => {
      for (const node of childrenByParent.get(parentId) || []) {
        const { id } = node;
        if (ancestors.has(id)) continue;
        const nextAncestors = new Set(ancestors);
        nextAncestors.add(id);
        if (node.type === 'page' && visible.get(id) === false) {
          addLevel(id, list, nextAncestors);
          continue;
        }
        const item = document.createElement('li');
        item.className = node.type === 'group' ? 'site-navigation-category' : 'site-navigation-node';
        const children = childrenByParent.get(id) || [];
        if (node.type === 'group') {
          const nested = document.createElement('ul');
          nested.className = 'site-navigation-children';
          addLevel(id, nested, nextAncestors);
          if (!nested.childElementCount) continue;
          const disclosure = document.createElement('details');
          disclosure.open = true;
          const heading = document.createElement('summary');
          heading.textContent = node.title;
          disclosure.append(heading, nested);
          item.append(disclosure);
          list.append(item);
          continue;
        }

        const link = document.createElement('button');
        link.type = 'button';
        link.className = 'site-navigation-link';
        link.dataset.siteMapRoute = id;
        link.textContent = labels.get(id) || id;
        link.addEventListener('click', () => this.switchTab(id));
        item.append(link);
        renderedPageCount += 1;
        if (children.length) {
          const nested = document.createElement('ul');
          nested.className = 'site-navigation-children';
          addLevel(id, nested, nextAncestors);
          if (nested.childElementCount) item.append(nested);
        }
        list.append(item);
      }
    };

    const root = document.createElement('div');
    root.className = 'site-navigation-root';
    const rootTitle = document.createElement('h3');
    rootTitle.textContent = 'HMIF UMB';
    root.append(rootTitle);
    const tree = document.createElement('ul');
    tree.className = 'site-navigation-tree';
    addLevel('', tree);
    if (!renderedPageCount) {
      const empty = document.createElement('p');
      empty.className = 'site-hierarchy-empty';
      empty.textContent = 'Belum ada halaman situs yang ditampilkan.';
      container.append(root, empty);
      return;
    }
    container.append(root, tree);
  }

  renderUniversityOrganization() {
    const container = document.getElementById('university-organization-content');
    if (!container) return;
    container.replaceChildren();
    const structures = this.config?.content?.data?.universityOrganization?.structures || [];
    if (!structures.length) {
      const empty = document.createElement('p');
      empty.className = 'site-hierarchy-empty';
      empty.textContent = 'Bagan organisasi universitas belum dikonfigurasi.';
      container.append(empty);
      return;
    }

    const today = getLocalDate();
    const activeStructure = structures.find((structure) => structure.validFrom <= today
      && (!structure.validUntil || structure.validUntil >= today));
    const selected = structures.find(({ id }) => id === this.selectedUniversityStructureId);
    const structure = selected || activeStructure || structures[structures.length - 1];
    this.selectedUniversityStructureId = structure.id;

    if (structures.length > 1) {
      const label = document.createElement('label');
      label.className = 'site-university-period-filter';
      const caption = document.createElement('span');
      caption.textContent = 'PILIH PERIODE STRUKTUR';
      const select = document.createElement('select');
      select.className = 'form-select';
      select.setAttribute('aria-label', 'Pilih periode bagan universitas');
      for (const item of structures) {
        const option = document.createElement('option');
        option.value = item.id;
        option.textContent = `${item.name} · ${formatValidity(item)}`;
        option.selected = item.id === structure.id;
        select.append(option);
      }
      select.addEventListener('change', () => {
        this.selectedUniversityStructureId = select.value;
        this.renderUniversityOrganization();
      });
      label.append(caption, select);
      container.append(label);
    }

    const status = document.createElement('p');
    status.className = 'site-university-period-status';
    status.textContent = structure === activeStructure
      ? `BERLAKU SAAT INI · ${formatValidity(structure)}`
      : `ARSIP / BELUM BERLAKU · ${formatValidity(structure)}`;
    container.append(status);
    if (structure.repositorySyncedAt) {
      const sourceNote = document.createElement('p');
      sourceNote.className = 'site-hierarchy-source';
      sourceNote.textContent = `Metadata universitas dan fakultas disinkronkan dari repositori pada ${new Date(structure.repositorySyncedAt).toLocaleString('id-ID')}.`;
      container.append(sourceNote);
    }

    if (!structure.units.length) {
      const empty = document.createElement('p');
      empty.className = 'site-hierarchy-empty';
      empty.textContent = 'Belum ada unit pada periode ini.';
      container.append(empty);
      return;
    }

    const unitsById = new Map(structure.units.map((unit) => [unit.id, unit]));
    const childrenByParent = new Map();
    for (const unit of structure.units) {
      const parentId = unit.parentId && unitsById.has(unit.parentId) ? unit.parentId : '';
      const children = childrenByParent.get(parentId) || [];
      children.push(unit);
      childrenByParent.set(parentId, children);
    }
    const addUnits = (parentId, list, ancestors = new Set()) => {
      for (const unit of childrenByParent.get(parentId) || []) {
        if (ancestors.has(unit.id)) continue;
        const nextAncestors = new Set(ancestors);
        nextAncestors.add(unit.id);
        const item = document.createElement('li');
        item.className = `university-org-node university-org-node--${unit.kind}`;
        const card = document.createElement('article');
        card.className = 'university-org-card';
        const kind = document.createElement('span');
        kind.className = 'university-org-kind';
        kind.textContent = UNIVERSITY_ORG_KIND_LABELS[unit.kind] || UNIVERSITY_ORG_KIND_LABELS.other;
        const name = document.createElement('h3');
        name.textContent = unit.name;
        card.append(kind, name);
        if (unit.description) {
          const description = document.createElement('p');
          description.textContent = unit.description;
          card.append(description);
        }
        item.append(card);
        const children = childrenByParent.get(unit.id) || [];
        if (children.length) {
          const nested = document.createElement('ul');
          nested.className = 'university-org-children';
          addUnits(unit.id, nested, nextAncestors);
          if (nested.childElementCount) item.append(nested);
        }
        list.append(item);
      }
    };
    const tree = document.createElement('ul');
    tree.className = 'university-org-tree';
    addUnits('', tree);
    container.append(tree);
  }
}
