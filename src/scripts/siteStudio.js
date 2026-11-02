import { BUILTIN_SITE_IMAGES, resolveBackgroundImage, uploadedAssetFileUrl } from '../../server/siteSchema.js';

const escapeHtml = (value) => String(value ?? '').replace(/[&<>"']/g, (character) => ({
    '&': '&amp;',
    '<': '&lt;',
    '>': '&gt;',
    '"': '&quot;',
    "'": '&#39;'
}[character]));

const labels = {
    dashboard: 'Dashboard',
    vision: 'Visi dan Misi',
    squad: 'Struktur Pengurus',
    proker: 'Program Kerja',
    calendar: 'Kalender',
    doctrine: 'Dokumen Organisasi',
    intel: 'Berita',
    commlink: 'Aspirasi dan Kontak'
};

const luminance = (hex) => {
    const channels = hex.slice(1).match(/.{2}/g).map((value) => parseInt(value, 16) / 255).map((value) => (
        value <= 0.04045 ? value / 12.92 : ((value + 0.055) / 1.055) ** 2.4
    ));
    return 0.2126 * channels[0] + 0.7152 * channels[1] + 0.0722 * channels[2];
};

const contrastRatio = (first, second) => {
    const values = [luminance(first), luminance(second)].sort((a, b) => b - a);
    return (values[0] + 0.05) / (values[1] + 0.05);
};

export class SiteStudio {
    constructor(api, { openModal, closeModal, applyConfig }) {
        this.api = api;
        this.openModal = openModal;
        this.closeModal = closeModal;
        this.applyConfig = applyConfig;
        this.config = null;
        this.assets = [];
        this.revisions = [];
        this.audit = [];
        this.revisionId = null;
        this.activeTab = 'theme';
        this.previewing = false;
    }

    async open() {
        if (!this.api.isSuperadmin) return;
        const title = document.getElementById('prts-modal-title');
        const body = document.getElementById('prts-modal-content');
        if (!title || !body) return;

        title.textContent = 'PRTS // SITE STUDIO';
        body.innerHTML = '<p class="auth-feedback" role="status">Memuat konfigurasi, aset, dan riwayat...</p>';
        this.openModal();

        const [siteResult, assetsResult, revisionsResult, auditResult] = await Promise.all([
            this.api.getSiteConfig({ preview: true }),
            this.api.getSiteAssets(),
            this.api.getSiteRevisions(),
            this.api.getAuditLog(30)
        ]);
        if (!siteResult.ok) {
            body.innerHTML = `<p class="auth-feedback">${escapeHtml(siteResult.error)}</p>`;
            return;
        }

        this.config = structuredClone(siteResult.data.config);
        this.revisionId = siteResult.data.revision_id;
        this.assets = assetsResult.ok ? assetsResult.data.assets : [];
        this.revisions = revisionsResult.ok ? revisionsResult.data.revisions : [];
        this.audit = auditResult.ok ? auditResult.data.entries : [];
        this.render(body);
    }

    render(body) {
        const fontOptions = ['Inter', 'Rajdhani', 'Orbitron', 'BenderLight', 'Geometos', 'JetBrainsMono', 'system-ui'];
        const fontSelect = (name, current) => `
      <select class="form-select" name="${name}">
        ${fontOptions.map((font) => `<option value="${font}" ${current === font ? 'selected' : ''}>${font}</option>`).join('')}
        ${this.assets.filter((asset) => asset.kind === 'font').map((asset) => `<option value="asset:${asset.id}" ${current === `asset:${asset.id}` ? 'selected' : ''}>${escapeHtml(asset.original_name)}</option>`).join('')}
      </select>`;
        const imageSelect = (name, current, builtins, { allowEmpty = false, emptyLabel = 'Tanpa gambar' } = {}) => {
            const uploaded = this.assets.filter((asset) => asset.kind === 'image').map((asset) => ({
                value: uploadedAssetFileUrl(asset.id),
                label: asset.original_name
            }));
            const options = [
                ...(allowEmpty ? [{ value: '', label: emptyLabel }] : []),
                ...builtins,
                ...uploaded
            ];
            if (current && !options.some((option) => option.value === current)) {
                options.push({ value: current, label: 'Gambar saat ini' });
            }
            return `<select class="form-select" name="${name}">${options.map((option) => `
              <option value="${escapeHtml(option.value)}" ${current === option.value ? 'selected' : ''}>${escapeHtml(option.label)}</option>`).join('')}
            </select>`;
        };
        const currentLogo = this.config.content.data.identity.logo || '';
        const currentBackground = resolveBackgroundImage(this.config.theme.background);
        const currentHero = this.config.theme.heroImage || '';

        body.innerHTML = `
      <div class="studio-toolbar" role="tablist" aria-label="Site Studio">
        <button class="btn-tactical ${this.activeTab === 'theme' ? 'primary' : ''}" type="button" role="tab" aria-selected="${this.activeTab === 'theme'}" data-studio-tab="theme">TEMA</button>
        <button class="btn-tactical ${this.activeTab === 'pages' ? 'primary' : ''}" type="button" role="tab" aria-selected="${this.activeTab === 'pages'}" data-studio-tab="pages">HALAMAN & KONTEN</button>
        <button class="btn-tactical ${this.activeTab === 'collections' ? 'primary' : ''}" type="button" role="tab" aria-selected="${this.activeTab === 'collections'}" data-studio-tab="collections">DATA ORGANISASI</button>
        <button class="btn-tactical ${this.activeTab === 'assets' ? 'primary' : ''}" type="button" role="tab" aria-selected="${this.activeTab === 'assets'}" data-studio-tab="assets">ASET & VERSI</button>
      </div>
      <form id="site-studio-form" class="site-studio-form">
        <section class="studio-panel" data-studio-panel="theme" ${this.activeTab !== 'theme' ? 'hidden' : ''}>
          <h3>IDENTITAS VISUAL</h3>
          <p class="studio-help">Ubah logo dan latar tanpa bingkai pemotong. Unggah gambar di tab Aset, lalu pilih di sini atau tekan tombol pada pustaka aset.</p>
          <div class="studio-visual-preview">
            ${currentLogo ? `<img src="${escapeHtml(currentLogo)}" alt="Pratinjau logo organisasi" data-logo-preview />` : '<span data-logo-preview-empty>Belum ada logo</span>'}
            <div>
              <strong>Logo organisasi</strong>
              <small>Ditampilkan utuh di bilah atas dan kartu terminal. PNG transparan disarankan.</small>
            </div>
          </div>
          <div class="admin-form-grid">
            <label class="form-group"><span class="form-label">LOGO ORGANISASI</span>${imageSelect('identity.logo', currentLogo, BUILTIN_SITE_IMAGES.logos, { allowEmpty: true, emptyLabel: 'Tanpa logo' })}</label>
            <label class="form-group"><span class="form-label">MODE LATAR SITUS</span><select class="form-select" name="backgroundMode"><option value="grid">Foto + overlay</option><option value="image">Foto penuh</option><option value="solid">Warna saja</option></select></label>
            <label class="form-group"><span class="form-label">GAMBAR LATAR SITUS</span>${imageSelect('backgroundImage', currentBackground, BUILTIN_SITE_IMAGES.backgrounds, { allowEmpty: true, emptyLabel: 'Tanpa foto' })}</label>
            <label class="form-group"><span class="form-label">GAMBAR HERO DASHBOARD</span>${imageSelect('heroImage', currentHero, BUILTIN_SITE_IMAGES.heroes, { allowEmpty: true, emptyLabel: 'Tanpa gambar hero' })}</label>
          </div>
          <h3>PALET WARNA</h3>
          <div class="studio-color-grid">
            ${Object.entries({ background: 'Latar', panel: 'Panel', accent: 'Aksen utama', accentAlt: 'Aksen kedua', danger: 'Status bahaya', success: 'Status sukses', info: 'Status informasi', text: 'Teks utama', textMuted: 'Teks sekunder', border: 'Garis' }).map(([key, label]) => `
              <label class="studio-color-field"><span>${label}</span><input type="color" name="color.${key}" value="${escapeHtml(this.config.theme.colors[key])}" /><code>${escapeHtml(this.config.theme.colors[key])}</code></label>
            `).join('')}
          </div>
          <h3>TIPOGRAFI DAN BENTUK</h3>
          <div class="admin-form-grid">
            <label class="form-group"><span class="form-label">FONT ISI</span>${fontSelect('font.body', this.config.theme.fonts.body)}</label>
            <label class="form-group"><span class="form-label">FONT JUDUL</span>${fontSelect('font.heading', this.config.theme.fonts.heading)}</label>
            <label class="form-group"><span class="form-label">FONT MONOSPACE</span>${fontSelect('font.mono', this.config.theme.fonts.mono)}</label>
            <label class="form-group"><span class="form-label">UKURAN DASAR</span><input class="form-input" name="typeScale" type="range" min="14" max="22" value="${this.config.theme.typeScale}" /><output data-scale-output>${this.config.theme.typeScale}px</output></label>
            <label class="form-group"><span class="form-label">BENTUK KOMPONEN</span><select class="form-select" name="shape"><option value="tactical">Tactical</option><option value="soft">Lembut</option><option value="square">Kotak</option></select></label>
            <label class="form-group"><span class="form-label">GAYA IKON</span><select class="form-select" name="iconStyle"><option value="tactical">Tactical</option><option value="minimal">Minimal</option><option value="text">Teks</option></select></label>
            <label class="form-group"><span class="form-label">KONTRAS</span><select class="form-select" name="contrast"><option value="normal">Normal</option><option value="high">Tinggi</option></select></label>
          </div>
          <label class="studio-toggle"><input type="checkbox" name="motion" /> <span>Aktifkan animasi antarmuka</span></label>
          <div class="studio-contrast" data-contrast-check role="status"></div>
        </section>
        <section class="studio-panel" data-studio-panel="pages" ${this.activeTab !== 'pages' ? 'hidden' : ''}>
          <h3>URUTAN DAN VISIBILITAS BLOK</h3>
          <div class="studio-block-list">${this.config.pages.map((page, index) => `
            <div class="studio-block-row" data-block-row="${page.id}">
              <span class="studio-block-number">${String(index + 1).padStart(2, '0')}</span>
              <strong>${labels[page.id]}</strong>
              <label class="studio-toggle"><input type="checkbox" name="visible.${page.id}" ${page.visible ? 'checked' : ''} /> <span>Tampil</span></label>
              <select class="form-select" name="layout.${page.id}" aria-label="Tata letak ${labels[page.id]}"><option value="default" ${page.layout === 'default' ? 'selected' : ''}>Normal</option><option value="wide" ${page.layout === 'wide' ? 'selected' : ''}>Lebar</option><option value="compact" ${page.layout === 'compact' ? 'selected' : ''}>Ringkas</option></select>
              <button class="btn-tactical" type="button" data-move-block="${page.id}" data-direction="up" ${index === 0 ? 'disabled' : ''} aria-label="Naikkan ${labels[page.id]}">↑</button>
              <button class="btn-tactical" type="button" data-move-block="${page.id}" data-direction="down" ${index === this.config.pages.length - 1 ? 'disabled' : ''} aria-label="Turunkan ${labels[page.id]}">↓</button>
            </div>
          `).join('')}</div>
          <h3>KONTEN TEKS</h3>
          <label class="form-group"><span class="form-label">EYEBROW DASHBOARD</span><input class="form-input" name="heroEyebrow" maxlength="80" value="${escapeHtml(this.config.content.heroEyebrow)}" /></label>
          <label class="form-group"><span class="form-label">DESKRIPSI DASHBOARD</span><textarea class="form-textarea" name="heroLead" maxlength="500">${escapeHtml(this.config.content.heroLead)}</textarea></label>
          <div class="admin-form-grid">${this.config.content.heroActions.map((label, index) => `
            <label class="form-group"><span class="form-label">LABEL AKSI ${index + 1}</span><input class="form-input" name="heroAction.${index}" maxlength="80" value="${escapeHtml(label)}" /></label>
          `).join('')}</div>
          <div class="admin-form-grid">${Object.entries(this.config.content.statLabels).map(([key, label]) => `
            <label class="form-group"><span class="form-label">LABEL STATISTIK ${key}</span><input class="form-input" name="statLabel.${key}" maxlength="80" value="${escapeHtml(label)}" /></label>
          `).join('')}</div>
          <div class="admin-form-grid">${Object.entries(labels).filter(([id]) => id !== 'dashboard').map(([id, label]) => `
            <label class="form-group"><span class="form-label">DESKRIPSI ${label.toUpperCase()}</span><textarea class="form-textarea" name="description.${id}" maxlength="1000">${escapeHtml(this.config.content.sectionDescriptions[id])}</textarea></label>
          `).join('')}</div>
          <div class="admin-form-grid">${Object.entries(labels).filter(([id]) => id !== 'dashboard').map(([id, label]) => `
            <label class="form-group"><span class="form-label">JUDUL ${label.toUpperCase()}</span><input class="form-input" name="title.${id}" maxlength="80" value="${escapeHtml(this.config.content.sectionTitles[id])}" /></label>
          `).join('')}</div>
        </section>
        <section class="studio-panel" data-studio-panel="collections" ${this.activeTab !== 'collections' ? 'hidden' : ''}>
          <h3>IDENTITAS ORGANISASI</h3>
          <div class="admin-form-grid">
            ${[['name', 'NAMA'], ['abbreviation', 'SINGKATAN'], ['university', 'UNIVERSITAS'], ['faculty', 'FAKULTAS'], ['established', 'TAHUN BERDIRI'], ['location', 'LOKASI'], ['tagline', 'TAGLINE'], ['activeCadets', 'ANGGOTA AKTIF'], ['complianceRate', 'TINGKAT KEPATUHAN']].map(([key, label]) => `
              <label class="form-group"><span class="form-label">${label}</span><input class="form-input" name="identity.${key}" maxlength="160" value="${escapeHtml(this.config.content.data.identity[key])}" /></label>
            `).join('')}
            <label class="form-group"><span class="form-label">JUMLAH DIVISI</span><input class="form-input" type="number" name="identity.divisionsCount" min="0" max="1000" value="${this.config.content.data.identity.divisionsCount}" /></label>
            <label class="form-group"><span class="form-label">JUMLAH PROGRAM</span><input class="form-input" type="number" name="identity.prokerCount" min="0" max="1000" value="${this.config.content.data.identity.prokerCount}" /></label>
          </div>
          <h3>VISI, MISI, DAN SAMBUTAN</h3>
          <label class="form-group"><span class="form-label">VISI</span><textarea class="form-textarea" name="vision" maxlength="3000">${escapeHtml(this.config.content.data.visionMission.vision)}</textarea></label>
          <label class="form-group"><span class="form-label">MISI (SATU BUTIR PER BARIS)</span><textarea class="form-textarea" name="missions" maxlength="12000">${escapeHtml(this.config.content.data.visionMission.mission.join('\n'))}</textarea></label>
          <div class="admin-form-grid">${[['leaderName', 'NAMA KETUA'], ['role', 'JABATAN'], ['period', 'PERIODE'], ['operatorCode', 'KODE'], ['quote', 'SAMBUTAN']].map(([key, label]) => `
            <label class="form-group"><span class="form-label">${label}</span><textarea class="form-textarea" name="welcome.${key}" maxlength="${key === 'quote' ? 2000 : 160}">${escapeHtml(this.config.content.data.visionMission.sambutanKahim[key])}</textarea></label>
          `).join('')}</div>
          <h3>KOLEKSI TERSTRUKTUR</h3>
          <p class="studio-help">Data di bawah divalidasi menurut skema koleksi. Tag HTML/script tidak dirender sebagai markup. Foto berita dan pengurus hanya boleh memakai aset terdaftar atau aset bawaan.</p>
          ${[
                ['operators', 'PENGURUS'],
                ['news', 'BERITA'],
                ['doctrine', 'AD/ART, ROADMAP, DAN KUIS']
            ].map(([key, label]) => `
            <label class="form-group"><span class="form-label">${label} // JSON TERSTRUKTUR</span><textarea class="form-textarea studio-json-editor" name="collection.${key}" spellcheck="false">${escapeHtml(JSON.stringify(this.config.content.data[key], null, 2))}</textarea></label>
          `).join('')}
        </section>
        <section class="studio-panel" data-studio-panel="assets" ${this.activeTab !== 'assets' ? 'hidden' : ''}>
          <h3>UNGGAH GAMBAR ATAU FONT</h3>
          <div id="studio-asset-form" class="admin-form">
            <input class="form-input" type="file" name="asset" accept="image/png,image/jpeg,image/webp,font/woff2,font/ttf,font/otf" required />
            <small>Maksimal 5 MB. Gambar PNG/JPEG/WebP; font WOFF2/TTF/OTF. SVG dan script tidak diterima.</small>
            <p class="auth-feedback" data-asset-feedback role="status"></p>
            <button class="btn-tactical primary" type="button" data-upload-asset>UNGGAH ASET</button>
          </div>
          <h3>PUSTAKA ASET</h3>
          <div class="studio-asset-grid">${this.assets.map((asset) => `
            <div class="studio-asset-row">
              ${asset.kind === 'image' ? `<img src="/api/site/assets/${asset.id}/file" alt="${escapeHtml(asset.original_name)}" />` : '<span class="studio-font-mark">Aa</span>'}
              <span><strong>${escapeHtml(asset.original_name)}</strong><small>${escapeHtml(asset.mime_type)} // ${(asset.size / 1024).toFixed(1)} KB</small></span>
              <button class="btn-tactical" type="button" data-use-logo="${asset.id}" ${asset.kind !== 'image' ? 'disabled' : ''}>JADIKAN LOGO</button>
              <button class="btn-tactical" type="button" data-use-background="${asset.id}" ${asset.kind !== 'image' ? 'disabled' : ''}>JADIKAN LATAR</button>
              <button class="btn-tactical" type="button" data-use-hero="${asset.id}" ${asset.kind !== 'image' ? 'disabled' : ''}>JADIKAN HERO</button>
              <button class="btn-tactical" type="button" data-delete-asset="${asset.id}">HAPUS</button>
            </div>
          `).join('') || '<p>Belum ada aset yang diunggah.</p>'}</div>
          <h3>VERSI DAN PEMULIHAN</h3>
          <div class="admin-record-list">${this.revisions.map((revision) => `
            <div class="admin-record-row"><span>v${revision.version} // ${escapeHtml(revision.status)} // ${escapeHtml(new Date(revision.created_at).toLocaleString('id-ID'))}</span><button class="btn-tactical" type="button" data-restore-revision="${revision.id}">PULIHKAN KE DRAFT</button></div>
          `).join('') || '<p>Belum ada versi.</p>'}</div>
          <h3>LOG AKTIVITAS ADMIN</h3>
          <div class="admin-record-list">${this.audit.map((entry) => `<p>${escapeHtml(entry.created_at)} // ${escapeHtml(entry.actor_nim)} // ${escapeHtml(entry.action)} // ${escapeHtml(entry.target_id)}</p>`).join('') || '<p>Belum ada aktivitas.</p>'}</div>
        </section>
        <p class="auth-feedback" data-studio-feedback role="status"></p>
        <div class="studio-actions">
          <button class="btn-tactical" type="button" data-action="preview">PRATINJAU</button>
          <button class="btn-tactical" type="button" data-action="cancel-preview">TUTUP PRATINJAU</button>
          <button class="btn-tactical primary" type="button" data-action="save">SIMPAN DRAFT</button>
          <button class="btn-tactical gold" type="button" data-action="publish">PUBLIKASIKAN</button>
          <button class="btn-tactical" type="button" data-action="close">TUTUP STUDIO</button>
        </div>
      </form>
    `;

        const form = body.querySelector('#site-studio-form');
        form.elements.shape.value = this.config.theme.shape;
        form.elements.iconStyle.value = this.config.theme.iconStyle;
        form.elements.backgroundMode.value = this.config.theme.background.mode;
        form.elements.backgroundImage.value = currentBackground;
        form.elements.contrast.value = this.config.theme.contrast;
        form.elements.motion.checked = this.config.theme.motion;
        body.querySelectorAll('[data-studio-tab]').forEach((button) => button.addEventListener('click', () => {
            const collected = this.tryCollectConfig(form, body);
            if (!collected) return;
            this.config = collected;
            this.activeTab = button.dataset.studioTab;
            this.render(body);
        }));
        form.querySelectorAll('input[type="color"]').forEach((input) => input.addEventListener('input', () => {
            input.nextElementSibling.textContent = input.value;
            this.updateContrast(form);
        }));
        form.elements['identity.logo'].addEventListener('change', () => {
            const preview = body.querySelector('[data-logo-preview]');
            const emptyPreview = body.querySelector('[data-logo-preview-empty]');
            const logo = form.elements['identity.logo'].value;
            if (logo && preview) preview.src = logo;
            else if (logo && emptyPreview) {
                const image = document.createElement('img');
                image.src = logo;
                image.alt = 'Pratinjau logo organisasi';
                image.dataset.logoPreview = '';
                emptyPreview.replaceWith(image);
            } else if (!logo && preview) {
                const empty = document.createElement('span');
                empty.textContent = 'Belum ada logo';
                empty.dataset.logoPreviewEmpty = '';
                preview.replaceWith(empty);
            }
        });
        form.elements.typeScale.addEventListener('input', () => {
            form.querySelector('[data-scale-output]').textContent = `${form.elements.typeScale.value}px`;
        });
        form.querySelectorAll('[data-move-block]').forEach((button) => button.addEventListener('click', () => {
            const collected = this.tryCollectConfig(form, body);
            if (!collected) return;
            this.config = collected;
            const current = this.config.pages.findIndex((page) => page.id === button.dataset.moveBlock);
            const next = button.dataset.direction === 'up' ? current - 1 : current + 1;
            if (next < 0 || next >= this.config.pages.length) return;
            [this.config.pages[current], this.config.pages[next]] = [this.config.pages[next], this.config.pages[current]];
            this.render(body);
        }));
        body.querySelector('[data-upload-asset]').addEventListener('click', (event) => this.uploadAsset(event, body));
        body.querySelectorAll('[data-use-logo]').forEach((button) => button.addEventListener('click', () => {
            form.elements['identity.logo'].value = uploadedAssetFileUrl(button.dataset.useLogo);
            this.activeTab = 'theme';
            this.config = this.tryCollectConfig(form, body);
            if (this.config) this.render(body);
        }));
        body.querySelectorAll('[data-use-background]').forEach((button) => button.addEventListener('click', () => {
            form.elements.backgroundMode.value = 'image';
            form.elements.backgroundImage.value = uploadedAssetFileUrl(button.dataset.useBackground);
            this.activeTab = 'theme';
            this.config = this.tryCollectConfig(form, body);
            if (this.config) this.render(body);
        }));
        body.querySelectorAll('[data-use-hero]').forEach((button) => button.addEventListener('click', () => {
            form.elements.heroImage.value = uploadedAssetFileUrl(button.dataset.useHero);
            this.activeTab = 'theme';
            this.config = this.tryCollectConfig(form, body);
            if (this.config) this.render(body);
        }));
        body.querySelectorAll('[data-delete-asset]').forEach((button) => button.addEventListener('click', () => this.deleteAsset(button.dataset.deleteAsset, body)));
        body.querySelectorAll('[data-restore-revision]').forEach((button) => button.addEventListener('click', () => this.restoreRevision(button.dataset.restoreRevision, body)));
        body.querySelector('[data-action="preview"]').addEventListener('click', async () => {
            const collected = this.tryCollectConfig(form, body);
            if (!collected) return;
            const validation = await this.api.validateSiteConfig(collected);
            if (!validation.ok) return this.feedback(body, validation.error);
            this.config = validation.data.config;
            this.previewing = true;
            await this.applyConfig(this.config, { preview: true });
            this.feedback(body, 'PRATINJAU DRAFT AKTIF DI HALAMAN INI. BELUM DIPUBLIKASIKAN.');
        });
        body.querySelector('[data-action="cancel-preview"]').addEventListener('click', async () => {
            await this.cancelPreview();
            this.feedback(body, 'PRATINJAU DITUTUP. VERSI TERBIT DIPULIHKAN.');
        });
        body.querySelector('[data-action="save"]').addEventListener('click', () => this.saveDraft(form, body));
        body.querySelector('[data-action="publish"]').addEventListener('click', async () => {
            const saved = await this.saveDraft(form, body);
            if (saved) await this.publish(body);
        });
        body.querySelector('[data-action="close"]').addEventListener('click', async () => {
            if (this.previewing) {
                const published = await this.api.getSiteConfig();
                if (published.ok) this.applyConfig(published.data.config, { preview: false });
                this.previewing = false;
            }
            this.closeModal();
        });
        this.updateContrast(form);
    }

    collectConfig(form) {
        const config = structuredClone(this.config);
        for (const input of form.querySelectorAll('[name^="color."]')) config.theme.colors[input.name.slice(6)] = input.value;
        config.theme.fonts = { body: form.elements['font.body'].value, heading: form.elements['font.heading'].value, mono: form.elements['font.mono'].value };
        config.theme.typeScale = Number(form.elements.typeScale.value);
        config.theme.shape = form.elements.shape.value;
        config.theme.iconStyle = form.elements.iconStyle.value;
        const backgroundImage = form.elements.backgroundImage.value;
        const backgroundAssetId = /^\/api\/site\/assets\/([a-f0-9-]{36})\/file$/.exec(backgroundImage)?.[1] || null;
        config.theme.background = {
            mode: form.elements.backgroundMode.value,
            image: backgroundImage,
            assetId: backgroundAssetId
        };
        config.theme.heroImage = form.elements.heroImage.value;
        config.theme.contrast = form.elements.contrast.value;
        config.theme.motion = form.elements.motion.checked;
        config.pages = config.pages.map((page) => ({
            ...page,
            visible: form.elements[`visible.${page.id}`].checked,
            layout: form.elements[`layout.${page.id}`].value
        }));
        config.content.heroEyebrow = form.elements.heroEyebrow.value;
        config.content.heroLead = form.elements.heroLead.value;
        config.content.heroActions = config.content.heroActions.map((_, index) => form.elements[`heroAction.${index}`].value);
        config.content.statLabels = Object.fromEntries(Object.keys(config.content.statLabels).map((key) => [key, form.elements[`statLabel.${key}`].value]));
        config.content.sectionDescriptions = Object.fromEntries(Object.keys(config.content.sectionDescriptions).map((key) => [key, form.elements[`description.${key}`].value]));
        const identity = { ...config.content.data.identity };
        if (form.elements['identity.logo']) identity.logo = form.elements['identity.logo'].value;
        for (const key of Object.keys(identity)) {
            const field = form.elements[`identity.${key}`];
            if (field) identity[key] = key === 'divisionsCount' || key === 'prokerCount' ? Number(field.value) : field.value;
        }
        const welcome = Object.fromEntries(['leaderName', 'role', 'period', 'operatorCode', 'quote'].map((key) => [key, form.elements[`welcome.${key}`]?.value ?? '']));
        const collections = Object.fromEntries(['operators', 'news', 'doctrine'].map((key) => {
            try {
                return [key, JSON.parse(form.elements[`collection.${key}`].value)];
            } catch {
                throw new Error(`JSON koleksi ${key} tidak valid.`);
            }
        }));
        config.content.data = {
            identity,
            visionMission: {
                vision: form.elements.vision.value,
                mission: form.elements.missions.value.split(/\r?\n/).map((item) => item.trim()).filter(Boolean),
                sambutanKahim: welcome
            },
            ...collections
        };
        for (const page of config.pages) {
            if (page.id !== 'dashboard') config.content.sectionTitles[page.id] = form.elements[`title.${page.id}`].value;
        }
        return config;
    }

    tryCollectConfig(form, body) {
        try {
            return this.collectConfig(form);
        } catch (error) {
            this.feedback(body, error.message || 'Konten terstruktur tidak valid.');
            return null;
        }
    }

    updateContrast(form) {
        const colors = Object.fromEntries([...form.querySelectorAll('[name^="color."]')].map((input) => [input.name.slice(6), input.value]));
        const bodyRatio = contrastRatio(colors.text, colors.background);
        const secondaryRatio = contrastRatio(colors.textMuted, colors.background);
        const accentRatio = contrastRatio(colors.accent, colors.background);
        const accentAltRatio = contrastRatio(colors.accentAlt, colors.background);
        const statusRatios = [colors.danger, colors.success, colors.info].map((color) => contrastRatio(color, colors.background));
        const status = form.querySelector('[data-contrast-check]');
        const textPass = bodyRatio >= 4.5 && secondaryRatio >= 4.5;
        const colorPass = [accentRatio, accentAltRatio, ...statusRatios].every((ratio) => ratio >= 3);
        status.textContent = `Teks ${bodyRatio.toFixed(2)}:1 / sekunder ${secondaryRatio.toFixed(2)}:1 ${textPass ? 'OK' : 'RENDAH (4.5:1)'} // aksen ${[accentRatio, accentAltRatio, ...statusRatios].map((ratio) => `${ratio.toFixed(2)}:1`).join(' / ')} ${colorPass ? 'OK' : 'RENDAH (3:1)'}`;
        status.dataset.pass = String(textPass && colorPass);
    }

    feedback(body, message) {
        const target = body.querySelector('[data-studio-feedback]');
        if (target) target.textContent = message;
    }

    async saveDraft(form, body) {
        const collected = this.tryCollectConfig(form, body);
        if (!collected) return false;
        this.config = collected;
        const bodyContrast = contrastRatio(this.config.theme.colors.text, this.config.theme.colors.background);
        const secondaryContrast = contrastRatio(this.config.theme.colors.textMuted, this.config.theme.colors.background);
        const accentContrast = contrastRatio(this.config.theme.colors.accent, this.config.theme.colors.background);
        const accentAltContrast = contrastRatio(this.config.theme.colors.accentAlt, this.config.theme.colors.background);
        const statusContrast = [this.config.theme.colors.danger, this.config.theme.colors.success, this.config.theme.colors.info].map((color) => contrastRatio(color, this.config.theme.colors.background));
        if (bodyContrast < 4.5 || secondaryContrast < 4.5 || accentContrast < 3 || accentAltContrast < 3 || statusContrast.some((ratio) => ratio < 3)) {
            this.feedback(body, 'PERIKSA KONTRAS: TEKS MEMERLUKAN 4.5:1 DAN AKSEN/STATUS 3:1.');
            return false;
        }
        const result = await this.api.saveSiteDraft(this.config, this.revisionId);
        if (!result.ok) {
            this.feedback(body, result.error);
            return false;
        }
        this.revisionId = result.data.revision.id;
        this.feedback(body, `DRAFT v${result.data.revision.version} TERSIMPAN. PUBLIKASI BELUM BERUBAH.`);
        return true;
    }

    async publish(body) {
        const result = await this.api.publishSiteDraft();
        if (!result.ok) return this.feedback(body, result.error);
        this.previewing = false;
        const published = await this.api.getSiteConfig();
        if (published.ok) await this.applyConfig(published.data.config, { preview: false });
        this.feedback(body, 'PERUBAHAN DIPUBLIKASIKAN.');
        await this.open();
    }

    async cancelPreview() {
        if (!this.previewing) return;
        this.previewing = false;
        const published = await this.api.getSiteConfig();
        if (published.ok) await this.applyConfig(published.data.config, { preview: false });
    }

    async uploadAsset(event, body) {
        event.preventDefault();
        const form = body.querySelector('#studio-asset-form');
        const file = form.querySelector('[name="asset"]').files[0];
        if (!file) return;
        if (file.size > 5 * 1024 * 1024) return this.feedback(body, 'FILE MELEBIHI BATAS 5 MB.');
        const result = await this.api.uploadSiteAsset(file);
        if (!result.ok) return this.feedback(body, result.error);
        this.activeTab = 'assets';
        await this.open();
        this.feedback(document.getElementById('prts-modal-content'), `ASET ${result.data.asset.original_name} DIUNGGAH DAN SIAP DIGUNAKAN.`);
    }

    async deleteAsset(id, body) {
        const result = await this.api.deleteSiteAsset(id);
        this.feedback(body, result.ok ? 'ASET DIHAPUS.' : result.error);
        if (result.ok) {
            this.activeTab = 'assets';
            await this.open();
        }
    }

    async restoreRevision(id, body) {
        const result = await this.api.restoreSiteRevision(id, this.revisionId);
        if (!result.ok) return this.feedback(body, result.error);
        this.feedback(body, `VERSI DIPULIHKAN MENJADI DRAFT ${result.data.revision.id}.`);
        this.activeTab = 'assets';
        await this.open();
    }
}
