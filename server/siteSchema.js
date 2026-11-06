import { HMIF_DATA } from '../src/scripts/data.js';

export const PAGE_BLOCKS = [
    { id: 'dashboard', label: 'Dashboard' },
    { id: 'vision', label: 'Visi dan Misi' },
    { id: 'knowledge', label: 'Pusat Akademik' },
    { id: 'showcase', label: 'Karya Mahasiswa' },
    { id: 'career', label: 'Alumni & Karier' },
    { id: 'squad', label: 'Struktur Pengurus' },
    { id: 'proker', label: 'Program Kerja' },
    { id: 'inventory', label: 'Inventaris' },
    { id: 'calendar', label: 'Kalender' },
    { id: 'doctrine', label: 'Dokumen Organisasi' },
    { id: 'intel', label: 'Berita' },
    { id: 'commlink', label: 'Aspirasi dan Kontak' }
];

export const BUILTIN_SITE_IMAGES = {
    logos: [
        { value: '/assets/hmif_umb_logo.jpg', label: 'Logo HMIF bulat (JPG)' },
        { value: '/assets/hmif_umb_logo.png', label: 'Logo HMIF (PNG)' }
    ],
    backgrounds: [
        { value: '/assets/pc-bg.jpg', label: 'Latar terminal' },
        { value: '/assets/bg.jpg', label: 'Latar umum' },
        { value: '/assets/bk.jpg', label: 'Latar alternatif' }
    ],
    heroes: [
        { value: '/assets/hmif_prts_bridge.jpg', label: 'Hero jembatan PRTS' },
        { value: '/assets/pc-bg.jpg', label: 'Latar terminal' },
        { value: '/assets/bg.jpg', label: 'Latar umum' },
        { value: '/assets/bk.jpg', label: 'Latar alternatif' }
    ],
    factions: [
        { value: '/assets/faction/1.png', label: 'Emblem Faksi 01 (Rhodes Vanguard / Riset)' },
        { value: '/assets/faction/2.png', label: 'Emblem Faksi 02 (Defense & Discipline / PSDM)' },
        { value: '/assets/faction/3.png', label: 'Emblem Faksi 03 (Recon & Intelligence / Kominfo)' },
        { value: '/assets/faction/4.png', label: 'Emblem Faksi 04 (Special Operations / Mikat)' },
        { value: '/assets/faction/5.png', label: 'Emblem Faksi 05 (Strategic & Enterprise / KWU)' }
    ]
};

export const uploadedAssetFileUrl = (id) => `/api/site/assets/${id}/file`;

export function resolveBackgroundImage(background = {}) {
    if (typeof background.image === 'string' && background.image.trim()) return background.image.trim();
    if (typeof background.assetId === 'string' && /^[a-f0-9-]{36}$/.test(background.assetId)) {
        return uploadedAssetFileUrl(background.assetId);
    }
    return '';
}

export function configReferencesAsset(config, id) {
    const url = uploadedAssetFileUrl(id);
    const theme = config?.theme || {};
    const content = config?.content?.data || {};
    return theme.background?.assetId === id
        || resolveBackgroundImage(theme.background) === url
        || theme.heroImage === url
        || Object.values(theme.fonts || {}).some((font) => font === `asset:${id}`)
        || content.identity?.logo === url
        || content.departments?.some((department) => department.emblem === url)
        || content.generations?.some((gen) => gen.emblem === url
            || Object.values(gen.leadership || {}).some((leader) => leader.avatar === url)
            || gen.divisions?.some((division) => division.coordinatorAvatar === url
                || division.members?.some((member) => typeof member !== 'string' && member.avatar === url)))
        || content.operators?.some((operator) => operator.avatar === url)
        || content.news?.some((article) => article.thumbnail === url);
}

const emptyContentData = {
    identity: { name: '', abbreviation: '', university: '', faculty: '', established: '', location: '', tagline: '', logo: '', activeCadets: '', divisionsCount: 0, prokerCount: 0, complianceRate: '' },
    visionMission: { vision: '', mission: [], sambutanKahim: { leaderName: '', role: '', period: '', operatorCode: '', quote: '' } },
    departments: [],
    organizationStructure: { people: [], terms: [] },
    knowledgeResources: [],
    generations: [],
    operators: [],
    news: [],
    doctrine: { adArt: [], cadetRoadmap: [], cadetQuiz: [] }
};

const initialContentData = process.env.NODE_ENV === 'production'
    ? emptyContentData
    : {
        identity: { ...structuredClone(HMIF_DATA.identity), logo: HMIF_DATA.identity.logo || '/assets/hmif_umb_logo.jpg' },
        visionMission: structuredClone(HMIF_DATA.visionMission),
        departments: structuredClone(HMIF_DATA.departments || []),
        organizationStructure: { people: [], terms: [] },
        knowledgeResources: structuredClone(HMIF_DATA.knowledgeResources || []),
        generations: structuredClone(HMIF_DATA.generations || []),
        operators: structuredClone(HMIF_DATA.operators),
        news: structuredClone(HMIF_DATA.news),
        doctrine: structuredClone(HMIF_DATA.doctrine)
    };
const initialSiteCopy = process.env.NODE_ENV === 'production'
    ? {
        heroEyebrow: '',
        heroLead: '',
        heroActions: ['', '', ''],
        statLabels: { activeCadets: '', divisionsCount: '', prokerCount: '', complianceRate: '' },
        sectionDescriptions: Object.fromEntries(PAGE_BLOCKS.filter(({ id }) => id !== 'dashboard').map(({ id }) => [id, ''])),
        sectionTitles: Object.fromEntries(PAGE_BLOCKS.filter(({ id }) => id !== 'dashboard').map(({ id }) => [id, '']))
    }
    : {
        heroEyebrow: 'HMIF-UMB TERMINAL OPERATIONAL',
        heroLead: 'Portal digital Himpunan Mahasiswa Informatika Universitas Mayasari Bakti.',
        heroActions: ['JELAJAHI PROGRAM KERJA', 'KALENDER PENDIDIKAN', 'PEDOMAN KADERISASI'],
        statLabels: { activeCadets: 'Kader Aktif', divisionsCount: 'Divisi Operasional', prokerCount: 'Misi Program Kerja', complianceRate: 'Kepatuhan AD/ART' },
        sectionDescriptions: {
            vision: 'Landasan filosofis dan pedoman operasional organisasi.',
            knowledge: 'Referensi teknis dan jalur belajar terkurasi untuk mahasiswa Informatika.',
            showcase: 'Etalase proyek, riset, dan karya teknologi mahasiswa Informatika UMB.',
            career: 'Jejaring alumni, mentor, dan kesempatan kerja yang dikurasi HMIF.',
            inventory: 'Daftar aset organisasi dan status peminjaman.',
            squad: 'Profil fungsionaris, pengurus, dan kepala divisi.',
            proker: 'Daftar program kerja, sasaran, KPI, dan status realisasi.',
            calendar: 'Kalender akademik yang diselaraskan dengan agenda organisasi.',
            doctrine: 'Pusat literasi AD/ART, GBHO, dan tahapan kaderisasi.',
            intel: 'Dokumentasi berkala, berita, dan arsip kegiatan.',
            commlink: 'Saluran komunikasi mahasiswa untuk menyampaikan aspirasi.'
        },
        sectionTitles: {
            vision: 'VISI DAN MISI ORGANISASI',
            knowledge: 'PUSAT AKADEMIK & KNOWLEDGE BASE',
            showcase: 'KARYA MAHASISWA',
            career: 'JEJARING ALUMNI & KARIER',
            inventory: 'INVENTARIS & PEMINJAMAN ASET',
            squad: 'STRUKTUR PENGURUS',
            proker: 'PROGRAM KERJA',
            calendar: 'KALENDER KEGIATAN',
            doctrine: 'DOKUMEN ORGANISASI',
            intel: 'BERITA DAN INFORMASI',
            commlink: 'ASPIRASI DAN KONTAK'
        }
    };

export const DEFAULT_SITE_CONFIG = {
    theme: {
        colors: {
            background: '#07090e',
            panel: '#111723',
            accent: '#00e5ff',
            accentAlt: '#ffde00',
            danger: '#ff3355',
            success: '#00ff88',
            info: '#b388ff',
            text: '#f0f6fc',
            textMuted: '#9cb1ce',
            border: '#1e2b40'
        },
        fonts: { body: 'Inter', heading: 'Geometos', mono: 'JetBrainsMono' },
        typeScale: 16,
        shape: 'tactical',
        iconStyle: 'tactical',
        background: { mode: 'grid', image: '/assets/pc-bg.jpg', assetId: null },
        heroImage: '/assets/hmif_prts_bridge.jpg',
        contrast: 'normal',
        motion: true
    },
    pages: PAGE_BLOCKS.map(({ id }) => ({ id, visible: true, layout: 'default' })),
    content: {
        ...structuredClone(initialSiteCopy),
        data: structuredClone(initialContentData)
    }
};

export function withSiteDefaults(config) {
    const pages = new Map((config.pages || []).map((page) => [page.id, page]));
    const orderedPageIds = [
        ...(config.pages || []).map((page) => page.id).filter((id, index, ids) => PAGE_BLOCKS.some((block) => block.id === id) && ids.indexOf(id) === index),
        ...PAGE_BLOCKS.map(({ id }) => id).filter((id) => !pages.has(id))
    ];
    const contentData = config.content?.data || {};
    const contentDefaults = structuredClone(initialContentData);
    const incomingBackground = config.theme?.background || {};
    const resolvedBackgroundImage = resolveBackgroundImage(incomingBackground);
    return {
        ...structuredClone(DEFAULT_SITE_CONFIG),
        ...config,
        theme: {
            ...structuredClone(DEFAULT_SITE_CONFIG.theme),
            ...(config.theme || {}),
            colors: { ...DEFAULT_SITE_CONFIG.theme.colors, ...(config.theme?.colors || {}) },
            fonts: { ...DEFAULT_SITE_CONFIG.theme.fonts, ...(config.theme?.fonts || {}) },
            background: {
                ...structuredClone(DEFAULT_SITE_CONFIG.theme.background),
                ...incomingBackground,
                image: resolvedBackgroundImage || (incomingBackground.mode === 'solid' ? '' : DEFAULT_SITE_CONFIG.theme.background.image),
                assetId: incomingBackground.assetId || null
            },
            heroImage: typeof config.theme?.heroImage === 'string' ? config.theme.heroImage : DEFAULT_SITE_CONFIG.theme.heroImage
        },
        pages: orderedPageIds.map((id) => ({ ...DEFAULT_SITE_CONFIG.pages.find((page) => page.id === id), ...(pages.get(id) || {}) })),
        content: {
            ...structuredClone(DEFAULT_SITE_CONFIG.content),
            ...(config.content || {}),
            sectionTitles: { ...DEFAULT_SITE_CONFIG.content.sectionTitles, ...(config.content?.sectionTitles || {}) },
            data: {
                ...contentDefaults,
                ...contentData,
                identity: { ...contentDefaults.identity, ...(contentData.identity || {}) },
                visionMission: {
                    ...contentDefaults.visionMission,
                    ...(contentData.visionMission || {}),
                    sambutanKahim: { ...contentDefaults.visionMission.sambutanKahim, ...(contentData.visionMission?.sambutanKahim || {}) }
                },
                departments: Array.isArray(contentData.departments) ? contentData.departments : contentDefaults.departments,
                organizationStructure: contentData.organizationStructure ?? contentDefaults.organizationStructure,
                knowledgeResources: Array.isArray(contentData.knowledgeResources) ? contentData.knowledgeResources : contentDefaults.knowledgeResources,
                generations: Array.isArray(contentData.generations) ? contentData.generations : contentDefaults.generations,
                operators: Array.isArray(contentData.operators) ? contentData.operators : contentDefaults.operators,
                news: Array.isArray(contentData.news) ? contentData.news : contentDefaults.news,
                doctrine: { ...contentDefaults.doctrine, ...(contentData.doctrine || {}) }
            }
        }
    };
}

const colorPattern = /^#[0-9a-fA-F]{6}$/;
const fontFamilies = new Set(['Inter', 'Rajdhani', 'Orbitron', 'BenderLight', 'Geometos', 'JetBrainsMono', 'system-ui']);
const shapes = new Set(['tactical', 'soft', 'square']);
const iconStyles = new Set(['tactical', 'minimal', 'text']);
const backgroundModes = new Set(['grid', 'solid', 'image']);
const contrasts = new Set(['normal', 'high']);
const layouts = new Set(['default', 'wide', 'compact']);
const copyLimits = {
    heroEyebrow: 80,
    heroLead: 500,
    sectionTitles: 80
};

const safeText = (value, maxLength, label) => {
    if (typeof value !== 'string' || value.length > maxLength || /[\u0000-\u0008\u000b\u000c\u000e-\u001f]/.test(value)) {
        throw new Error(`${label} tidak valid atau terlalu panjang.`);
    }
    return value.trim();
};

const colorLuminance = (hex) => {
    const channels = hex.slice(1).match(/.{2}/g).map((value) => parseInt(value, 16) / 255).map((value) => (
        value <= 0.04045 ? value / 12.92 : ((value + 0.055) / 1.055) ** 2.4
    ));
    return 0.2126 * channels[0] + 0.7152 * channels[1] + 0.0722 * channels[2];
};

const contrastRatio = (first, second) => {
    const [lighter, darker] = [colorLuminance(first), colorLuminance(second)].sort((a, b) => b - a);
    return (lighter + 0.05) / (darker + 0.05);
};

const safeList = (value, { maxItems, label, map }) => {
    if (!Array.isArray(value) || value.length > maxItems) throw new Error(`${label} harus berupa daftar maksimal ${maxItems} item.`);
    return value.map((item, index) => map(item, `${label} ${index + 1}`));
};

const validateAssetUrl = (value, label, assetExists) => {
    if (typeof value !== 'string') throw new Error(`${label} tidak valid.`);
    if (/^\/api\/site\/assets\/[a-f0-9-]{36}\/file$/.test(value)) {
        const id = value.split('/')[4];
        if (!assetExists(id, 'image')) throw new Error(`${label} harus merujuk aset gambar terdaftar.`);
        return value;
    }
    if (/^\/assets\/[a-zA-Z0-9_./-]+$/.test(value) && !value.split('/').includes('..')) return value;
    throw new Error(`${label} harus memakai aset terdaftar.`);
};

export const ALLOWED_ROLE_LEVELS = ['bph_leader', 'bph_executive', 'kadep', 'sekdep', 'staff'];
export const ALLOWED_BPH_ROLE_IDS = ['kahim', 'wakahim', 'sekum', 'bendum'];

export function migrateLegacyBphRoleIds(config) {
    const migrated = structuredClone(config);
    const operators = migrated?.content?.data?.operators || [];
    const claimedRoles = new Set(operators.map((operator) => operator.bphRoleId).filter(Boolean));
    const roleByOperatorId = { kahim: 'kahim', wakahim: 'wakahim', sekum: 'sekum', bendum: 'bendum' };

    for (const operator of operators) {
        if (operator.bphRoleId || (operator.departmentId !== 'bph' && String(operator.division || '').toLowerCase() !== 'bph')) continue;
        const role = String(operator.role || '').toLowerCase();
        const legacyRoleId = roleByOperatorId[operator.id]
            || (role.includes('wakil ketua') ? 'wakahim'
                : role.includes('ketua himpunan') || role.includes('kahim') ? 'kahim'
                    : role.includes('sekretaris umum') || role.includes('sekum') ? 'sekum'
                        : role.includes('bendahara umum') || role.includes('bendum') ? 'bendum'
                            : '');
        if (legacyRoleId && !claimedRoles.has(legacyRoleId)) {
            operator.bphRoleId = legacyRoleId;
            claimedRoles.add(legacyRoleId);
        }
    }
    return migrated;
}

export function inferRoleLevel(operator) {
    const roleLower = String(operator?.role || '').toLowerCase();
    const divLower = String(operator?.division || '').toLowerCase();
    if (divLower === 'bph' || roleLower.includes('ketua himpunan') || roleLower.includes('kahim') || roleLower.includes('wakil ketua')) {
        if (roleLower.includes('sekretaris') || roleLower.includes('sekum') || roleLower.includes('bendahara') || roleLower.includes('bendum')) {
            return 'bph_executive';
        }
        return 'bph_leader';
    }
    if (roleLower.includes('sekretaris') || roleLower.includes('sekdep')) {
        return 'sekdep';
    }
    if (roleLower.includes('kepala') || roleLower.includes('kadep') || roleLower.includes('kadiv') || roleLower.includes('ketua divisi') || roleLower.includes('ketua departemen')) {
        return 'kadep';
    }
    return 'staff';
}

export function inferDepartmentId(operator) {
    if (typeof operator?.departmentId === 'string' && /^[a-zA-Z0-9_-]+$/.test(operator.departmentId.trim())) {
        return operator.departmentId.trim();
    }
    const div = String(operator?.division || '').trim();
    if (!div || div.toLowerCase() === 'bph') return 'bph';
    const slug = div.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '');
    return slug.startsWith('dept-') ? slug : `dept-${slug}`;
}

const validateOrganizationStructure = (input) => {
    if (!input || typeof input !== 'object' || Array.isArray(input)) {
        throw new Error('Struktur organisasi tidak valid.');
    }

    const dateOnly = (value, label, optional = false) => {
        if ((value === null || value === undefined || value === '') && optional) return null;
        const date = safeText(value, 10, label);
        if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) throw new Error(`${label} harus berupa tanggal YYYY-MM-DD.`);
        const parsed = new Date(`${date}T00:00:00.000Z`);
        if (Number.isNaN(parsed.valueOf()) || parsed.toISOString().slice(0, 10) !== date) {
            throw new Error(`${label} tidak valid.`);
        }
        return date;
    };
    const validateId = (value, label) => {
        const id = safeText(value, 64, label);
        if (!/^[a-zA-Z0-9_-]+$/.test(id)) throw new Error(`${label} tidak valid.`);
        return id;
    };
    const assertUniqueIds = (records, label) => {
        if (new Set(records.map(({ id }) => id)).size !== records.length) throw new Error(`ID ${label} harus unik.`);
    };

    const people = safeList(input.people ?? [], {
        maxItems: 1000,
        label: 'Personel organisasi',
        map: (person, label) => {
            const id = validateId(person?.id, `${label} ID`);
            const name = safeText(person?.name, 120, `${label} nama`);
            if (!name) throw new Error(`${label} nama wajib diisi.`);
            if (person?.isPublic !== undefined && typeof person.isPublic !== 'boolean') {
                throw new Error(`${label} visibilitas publik tidak valid.`);
            }
            return { id, name, isPublic: person?.isPublic === true };
        }
    });
    assertUniqueIds(people, 'personel');
    const peopleById = new Set(people.map(({ id }) => id));

    const terms = safeList(input.terms ?? [], {
        maxItems: 50,
        label: 'Periode organisasi',
        map: (term, label) => {
            const id = validateId(term?.id, `${label} ID`);
            const name = safeText(term?.name, 120, `${label} nama`);
            if (!name) throw new Error(`${label} nama wajib diisi.`);
            const startDate = dateOnly(term?.startDate, `${label} tanggal mulai`);
            const endDate = dateOnly(term?.endDate, `${label} tanggal akhir`, true);
            if (endDate && endDate < startDate) throw new Error(`${label} tanggal akhir sebelum tanggal mulai.`);
            const status = term?.status ?? 'draft';
            if (!['draft', 'active', 'archived'].includes(status)) throw new Error(`${label} status tidak valid.`);

            const units = safeList(term?.units ?? [], {
                maxItems: 100,
                label: `${label} unit`,
                map: (unit, unitLabel) => {
                    const unitId = validateId(unit?.id, `${unitLabel} ID`);
                    const rawParentId = unit?.parentUnitId;
                    const parentUnitId = rawParentId === null || rawParentId === undefined || rawParentId === ''
                        ? null
                        : validateId(rawParentId, `${unitLabel} induk`);
                    const unitName = safeText(unit?.name, 120, `${unitLabel} nama`);
                    if (!unitName) throw new Error(`${unitLabel} nama wajib diisi.`);
                    if (unit?.order !== undefined && (!Number.isInteger(unit.order) || unit.order < 0)) {
                        throw new Error(`${unitLabel} urutan tidak valid.`);
                    }
                    return {
                        id: unitId,
                        parentUnitId,
                        name: unitName,
                        code: safeText(unit?.code ?? '', 32, `${unitLabel} kode`),
                        description: safeText(unit?.description ?? '', 500, `${unitLabel} deskripsi`),
                        order: unit?.order ?? 0
                    };
                }
            });
            assertUniqueIds(units, `${label} unit`);
            const unitsById = new Map(units.map((unit) => [unit.id, unit]));
            for (const unit of units) {
                const ancestors = new Set([unit.id]);
                let parentUnitId = unit.parentUnitId;
                let depth = 0;
                while (parentUnitId) {
                    if (ancestors.has(parentUnitId)) throw new Error(`${label} mengandung siklus hierarki unit.`);
                    const parent = unitsById.get(parentUnitId);
                    if (!parent) throw new Error(`${label} unit induk ${parentUnitId} tidak ditemukan.`);
                    ancestors.add(parentUnitId);
                    parentUnitId = parent.parentUnitId;
                    depth++;
                    if (depth > 12) throw new Error(`${label} hierarki unit melebihi 12 tingkat.`);
                }
            }

            const positions = safeList(term?.positions ?? [], {
                maxItems: 500,
                label: `${label} posisi`,
                map: (position, positionLabel) => {
                    const positionId = validateId(position?.id, `${positionLabel} ID`);
                    const unitId = validateId(position?.unitId, `${positionLabel} unit`);
                    if (!unitsById.has(unitId)) throw new Error(`${positionLabel} unit tidak ditemukan.`);
                    const title = safeText(position?.title, 120, `${positionLabel} nama`);
                    if (!title) throw new Error(`${positionLabel} nama wajib diisi.`);
                    const maxOccupants = position?.maxOccupants ?? 1;
                    if (!Number.isInteger(maxOccupants) || maxOccupants < 1 || maxOccupants > 100) {
                        throw new Error(`${positionLabel} kapasitas pemegang tidak valid.`);
                    }
                    if (position?.required !== undefined && typeof position.required !== 'boolean') {
                        throw new Error(`${positionLabel} status wajib tidak valid.`);
                    }
                    if (position?.order !== undefined && (!Number.isInteger(position.order) || position.order < 0)) {
                        throw new Error(`${positionLabel} urutan tidak valid.`);
                    }
                    return {
                        id: positionId,
                        unitId,
                        title,
                        code: safeText(position?.code ?? '', 32, `${positionLabel} kode`),
                        maxOccupants,
                        required: position?.required !== false,
                        order: position?.order ?? 0
                    };
                }
            });
            assertUniqueIds(positions, `${label} posisi`);
            const positionsById = new Map(positions.map((position) => [position.id, position]));

            const assignments = safeList(term?.assignments ?? [], {
                maxItems: 2000,
                label: `${label} penugasan`,
                map: (assignment, assignmentLabel) => {
                    const assignmentId = validateId(assignment?.id, `${assignmentLabel} ID`);
                    const personId = validateId(assignment?.personId, `${assignmentLabel} person`);
                    if (!peopleById.has(personId)) throw new Error(`ID person penugasan ${assignmentId} tidak ditemukan.`);
                    const positionId = validateId(assignment?.positionId, `${assignmentLabel} posisi`);
                    if (!positionsById.has(positionId)) throw new Error(`ID posisi penugasan ${assignmentId} tidak ditemukan.`);
                    const assignmentStart = dateOnly(assignment?.startDate, `${assignmentLabel} tanggal mulai`);
                    const assignmentEnd = dateOnly(assignment?.endDate, `${assignmentLabel} tanggal akhir`, true);
                    if (assignmentStart < startDate || (endDate && assignmentStart > endDate)
                        || (assignmentEnd && (assignmentEnd < assignmentStart || (endDate && assignmentEnd > endDate)))) {
                        throw new Error(`${assignmentLabel} berada di luar periode organisasi.`);
                    }
                    const kind = assignment?.kind ?? 'substantive';
                    if (!['substantive', 'acting'].includes(kind)) throw new Error(`${assignmentLabel} jenis penugasan tidak valid.`);
                    return { id: assignmentId, personId, positionId, startDate: assignmentStart, endDate: assignmentEnd, kind };
                }
            });
            assertUniqueIds(assignments, `${label} penugasan`);

            for (const assignment of assignments) {
                const overlapping = assignments.filter((other) => other.positionId === assignment.positionId
                    && other.startDate <= assignment.startDate
                    && (!other.endDate || other.endDate >= assignment.startDate));
                const position = positionsById.get(assignment.positionId);
                if (overlapping.length > position.maxOccupants) {
                    throw new Error(`Posisi ${position.title} melebihi kapasitas pemegang.`);
                }
                if (overlapping.filter((other) => other.personId === assignment.personId).length > 1) {
                    throw new Error(`Personel ${assignment.personId} memiliki penugasan ganda pada posisi yang sama.`);
                }
            }

            return { id, name, startDate, endDate, status, units, positions, assignments };
        }
    });
    assertUniqueIds(terms, 'periode organisasi');
    if (terms.filter(({ status }) => status === 'active').length > 1) {
        throw new Error('Hanya satu periode organisasi yang dapat berstatus aktif.');
    }

    return { people, terms };
};

const validateContentData = (data, assetExists) => {
    if (!data || typeof data !== 'object') throw new Error('Koleksi konten tidak valid.');
    const organizationStructure = validateOrganizationStructure(data.organizationStructure ?? { people: [], terms: [] });
    const identityKeys = ['name', 'abbreviation', 'university', 'faculty', 'established', 'location', 'tagline', 'activeCadets', 'complianceRate'];
    const identity = Object.fromEntries(identityKeys.map((key) => [key, safeText(data.identity?.[key], 160, `Identitas ${key}`)]));
    identity.logo = data.identity?.logo === '' ? '' : validateAssetUrl(data.identity?.logo, 'Logo organisasi', assetExists);
    for (const key of ['divisionsCount', 'prokerCount']) {
        if (!Number.isInteger(data.identity?.[key]) || data.identity[key] < 0 || data.identity[key] > 1000) throw new Error(`Identitas ${key} tidak valid.`);
        identity[key] = data.identity[key];
    }

    const visionMission = {
        vision: safeText(data.visionMission?.vision, 3000, 'Visi'),
        mission: safeList(data.visionMission?.mission, { maxItems: 12, label: 'Misi', map: (item, label) => safeText(item, 1000, label) }),
        sambutanKahim: Object.fromEntries(['leaderName', 'role', 'period', 'operatorCode', 'quote'].map((key) => [
            key,
            safeText(data.visionMission?.sambutanKahim?.[key], key === 'quote' ? 2000 : 160, `Sambutan ${key}`)
        ]))
    };

    const rawDepartments = Array.isArray(data.departments)
        ? data.departments
        : (HMIF_DATA.departments || []);
    const departments = safeList(rawDepartments, {
        maxItems: 50,
        label: 'Departemen',
        map: (dept, label) => {
            const id = safeText(dept?.id, 64, `${label} ID`);
            if (!/^[a-zA-Z0-9_-]+$/.test(id)) throw new Error(`${label} ID tidak valid.`);
            const order = Number.isInteger(dept?.order) && dept.order >= 0 ? dept.order : 0;
            const emblem = typeof dept?.emblem === 'string' && dept.emblem.trim()
                ? validateAssetUrl(dept.emblem.trim(), `${label} logo/emblem`, assetExists)
                : '';
            const kadepTitle = typeof dept?.kadepTitle === 'string' && dept.kadepTitle.trim()
                ? safeText(dept.kadepTitle, 80, `${label} gelar ketua`)
                : 'Kepala Departemen';
            const sekdepTitle = typeof dept?.sekdepTitle === 'string' && dept.sekdepTitle.trim()
                ? safeText(dept.sekdepTitle, 80, `${label} gelar sekretaris`)
                : 'Sekretaris Departemen';
            const defaultDepartment = (HMIF_DATA.departments || []).find((item) => item.id === id);
            const rawResponsibilities = Array.isArray(dept?.responsibilities)
                ? dept.responsibilities
                : (defaultDepartment?.responsibilities || []);
            const responsibilities = safeList(rawResponsibilities, {
                maxItems: 12,
                label: `${label} tupoksi`,
                map: (item, responsibilityLabel) => safeText(item, 500, responsibilityLabel)
            });
            const rawDivisions = Array.isArray(dept?.divisions)
                ? dept.divisions
                : [1, 2].map((number) => ({
                    id: `${id.slice(0, 54)}-div-${number}`,
                    code: `DIV-${number}`,
                    name: `Divisi ${number}`,
                    description: '',
                    order: number
                }));
            const divisions = safeList(rawDivisions, {
                maxItems: 50,
                label: `${label} divisi`,
                map: (division, divisionLabel) => {
                    const divisionId = safeText(division?.id, 64, `${divisionLabel} ID`);
                    if (!/^[a-zA-Z0-9_-]+$/.test(divisionId)) throw new Error(`${divisionLabel} ID tidak valid.`);
                    return {
                        id: divisionId,
                        code: safeText(division?.code ?? '', 32, `${divisionLabel} kode`),
                        name: safeText(division?.name, 120, `${divisionLabel} nama`),
                        description: safeText(division?.description ?? '', 500, `${divisionLabel} deskripsi`),
                        order: Number.isInteger(division?.order) && division.order >= 0 ? division.order : 0
                    };
                }
            });
            return {
                id,
                name: safeText(dept.name, 120, `${label} nama`),
                code: safeText(dept.code, 32, `${label} kode`),
                description: safeText(dept.description ?? '', 500, `${label} deskripsi`),
                responsibilities,
                emblem,
                kadepTitle,
                sekdepTitle,
                divisions,
                order
            };
        }
    });
    if (new Set(departments.map(({ id }) => id)).size !== departments.length) throw new Error('ID departemen harus unik.');
    if (new Set(departments.map(({ code }) => code.toUpperCase())).size !== departments.length) throw new Error('Kode departemen harus unik.');
    const divisionIds = new Set(departments.flatMap((department) => department.divisions.map(({ id }) => id)));
    if (divisionIds.size !== departments.reduce((count, department) => count + department.divisions.length, 0)) {
        throw new Error('ID divisi harus unik.');
    }

    const operators = safeList(data.operators, {
        maxItems: 100,
        label: 'Pengurus',
        map: (operator, label) => {
            const id = safeText(operator?.id, 64, `${label} ID`);
            if (!/^[a-zA-Z0-9_-]+$/.test(id)) throw new Error(`${label} ID tidak valid.`);
            if (!Number.isInteger(operator.rarity) || operator.rarity < 1 || operator.rarity > 6) throw new Error(`${label} rarity harus 1 sampai 6.`);
            const stats = {};
            for (const key of ['leadership', 'coding', 'strategy', 'integrity']) {
                if (!Number.isInteger(operator.stats?.[key]) || operator.stats[key] < 0 || operator.stats[key] > 100) throw new Error(`${label} statistik ${key} tidak valid.`);
                stats[key] = operator.stats[key];
            }
            const roleLevel = typeof operator.roleLevel === 'string' && ALLOWED_ROLE_LEVELS.includes(operator.roleLevel)
                ? operator.roleLevel
                : inferRoleLevel(operator);
            const departmentId = typeof operator.departmentId === 'string' && /^[a-zA-Z0-9_-]+$/.test(operator.departmentId.trim())
                ? operator.departmentId.trim()
                : inferDepartmentId(operator);
            const divisionId = safeText(operator.divisionId ?? '', 64, `${label} ID divisi`);
            if (divisionId && !/^[a-zA-Z0-9_-]+$/.test(divisionId)) throw new Error(`${label} ID divisi tidak valid.`);
            const bphRoleId = safeText(operator.bphRoleId ?? '', 32, `${label} ID jabatan BPH`);
            if (bphRoleId && (!ALLOWED_BPH_ROLE_IDS.includes(bphRoleId) || departmentId !== 'bph')) {
                throw new Error(`${label} ID jabatan BPH tidak valid.`);
            }

            return {
                id,
                departmentId,
                divisionId,
                roleLevel,
                bphRoleId,
                name: safeText(operator.name, 120, `${label} nama`),
                codeName: safeText(operator.codeName, 64, `${label} code name`),
                role: safeText(operator.role, 120, `${label} jabatan`),
                division: safeText(operator.division, 80, `${label} divisi`),
                rarity: operator.rarity,
                operatorClass: safeText(operator.operatorClass, 100, `${label} kelas`),
                avatar: validateAssetUrl(operator.avatar, `${label} foto`, assetExists),
                nim: safeText(operator.nim, 32, `${label} NIM`),
                generation: safeText(operator.generation, 8, `${label} angkatan`),
                specialty: safeText(operator.specialty, 300, `${label} kompetensi`),
                stats,
                quote: safeText(operator.quote, 500, `${label} kutipan`)
            };
        }
    });
    if (new Set(operators.map(({ id }) => id)).size !== operators.length) throw new Error('ID pengurus harus unik.');
    const bphRoleIds = operators.map((operator) => operator.bphRoleId).filter(Boolean);
    if (new Set(bphRoleIds).size !== bphRoleIds.length) throw new Error('Setiap jabatan BPH hanya boleh memiliki satu pemegang.');
    for (const operator of operators) {
        if (!operator.divisionId) continue;
        const department = departments.find(({ id }) => id === operator.departmentId);
        if (!department?.divisions.some(({ id }) => id === operator.divisionId)) {
            throw new Error(`ID divisi pengurus ${operator.name} tidak ditemukan di departemennya.`);
        }
    }

    const knowledgeResources = safeList(
        Array.isArray(data.knowledgeResources) ? data.knowledgeResources : (HMIF_DATA.knowledgeResources || []),
        {
            maxItems: 300,
            label: 'Referensi akademik',
            map: (resource, label) => {
                const id = safeText(resource?.id, 64, `${label} ID`);
                if (!/^[a-zA-Z0-9_-]+$/.test(id)) throw new Error(`${label} ID tidak valid.`);
                const title = safeText(resource?.title, 180, `${label} judul`);
                if (!title) throw new Error(`${label} judul wajib diisi.`);
                const kind = safeText(resource?.kind, 32, `${label} jenis`);
                if (!['exam', 'module', 'cheatsheet', 'reference', 'learning_path', 'project', 'faq'].includes(kind)) {
                    throw new Error(`${label} jenis tidak valid.`);
                }
                const url = safeText(resource?.url ?? '', 500, `${label} URL`);
                const fileId = safeText(resource?.fileId ?? '', 64, `${label} ID berkas`);
                if (Boolean(url) === Boolean(fileId) && !(kind === 'faq' && !url && !fileId)) {
                    throw new Error(`${label} harus memiliki tepat satu sumber berupa URL atau PDF terdaftar.`);
                }
                if (url) {
                    let parsedUrl;
                    try {
                        parsedUrl = new URL(url);
                    } catch {
                        throw new Error(`${label} harus memakai URL HTTPS yang valid.`);
                    }
                    if (parsedUrl.protocol !== 'https:') throw new Error(`${label} harus memakai URL HTTPS.`);
                }
                if (fileId && (!/^[a-f0-9-]{36}$/i.test(fileId) || !assetExists(fileId, 'knowledge'))) {
                    throw new Error(`${label} harus merujuk PDF akademik yang terdaftar.`);
                }
                const examType = safeText(resource?.examType ?? '', 32, `${label} jenis evaluasi`);
                if (examType && !['UTS', 'UAS', 'Kuis', 'Latihan'].includes(examType)) {
                    throw new Error(`${label} jenis evaluasi tidak valid.`);
                }
                const summary = safeText(resource?.summary ?? '', kind === 'faq' ? 5000 : 500, `${label} ringkasan`);
                if (kind === 'faq' && !summary.trim()) throw new Error(`${label} jawaban FAQ wajib diisi.`);
                return {
                    id,
                    title,
                    course: safeText(resource?.course ?? '', 120, `${label} mata kuliah`),
                    semester: safeText(resource?.semester ?? 'Semua', 20, `${label} semester`),
                    lecturer: safeText(resource?.lecturer ?? '', 120, `${label} dosen pengampu`),
                    academicYear: safeText(resource?.academicYear ?? '', 20, `${label} tahun ajaran`),
                    examType,
                    kind,
                    summary,
                    url: url || '',
                    fileId: fileId || '',
                    tags: safeList(Array.isArray(resource?.tags) ? resource.tags : [], {
                        maxItems: 12,
                        label: `${label} tag`,
                        map: (tag, tagLabel) => safeText(tag, 40, tagLabel)
                    }),
                    published: resource?.published !== false
                };
            }
        }
    );
    if (new Set(knowledgeResources.map(({ id }) => id)).size !== knowledgeResources.length) {
        throw new Error('ID referensi akademik harus unik.');
    }

    const news = safeList(data.news, {
        maxItems: 100,
        label: 'Berita',
        map: (item, label) => {
            const id = safeText(item?.id, 64, `${label} ID`);
            if (!/^[a-zA-Z0-9_-]+$/.test(id)) throw new Error(`${label} ID tidak valid.`);
            return {
                id,
                title: safeText(item.title, 180, `${label} judul`),
                category: safeText(item.category, 80, `${label} kategori`),
                date: safeText(item.date, 40, `${label} tanggal`),
                thumbnail: validateAssetUrl(item.thumbnail, `${label} gambar`, assetExists),
                author: safeText(item.author, 120, `${label} penulis`),
                excerpt: safeText(item.excerpt, 500, `${label} ringkasan`),
                content: safeText(item.content, 5000, `${label} konten`)
            };
        }
    });
    if (new Set(news.map(({ id }) => id)).size !== news.length) throw new Error('ID berita harus unik.');

    const doctrine = data.doctrine;
    if (!doctrine || typeof doctrine !== 'object') throw new Error('Dokumen kaderisasi tidak valid.');
    const adArt = safeList(doctrine.adArt, {
        maxItems: 40,
        label: 'AD/ART',
        map: (chapter, label) => ({
            bab: safeText(chapter?.bab, 40, `${label} bab`),
            title: safeText(chapter?.title, 180, `${label} judul`),
            pasalList: safeList(chapter?.pasalList, {
                maxItems: 30,
                label: `${label} pasal`,
                map: (article, articleLabel) => ({
                    pasal: safeText(article?.pasal, 120, `${articleLabel} nama`),
                    content: safeText(article?.content, 3000, `${articleLabel} konten`)
                })
            })
        })
    });
    const cadetRoadmap = safeList(doctrine.cadetRoadmap, {
        maxItems: 30,
        label: 'Roadmap kaderisasi',
        map: (step, label) => {
            if (!Number.isInteger(step?.step) || step.step < 1 || step.step > 30) throw new Error(`${label} nomor tahap tidak valid.`);
            return { step: step.step, title: safeText(step.title, 180, `${label} judul`), desc: safeText(step.desc, 1000, `${label} deskripsi`) };
        }
    });
    const cadetQuiz = safeList(doctrine.cadetQuiz, {
        maxItems: 50,
        label: 'Kuis kaderisasi',
        map: (question, label) => {
            const options = safeList(question?.options, { maxItems: 8, label: `${label} pilihan`, map: (option, optionLabel) => safeText(option, 400, optionLabel) });
            if (!Number.isInteger(question.correctIndex) || question.correctIndex < 0 || question.correctIndex >= options.length) throw new Error(`${label} jawaban benar tidak valid.`);
            if (!Number.isInteger(question.id) || question.id < 1) throw new Error(`${label} ID tidak valid.`);
            return { id: question.id, question: safeText(question.question, 1000, `${label} pertanyaan`), options, correctIndex: question.correctIndex, explanation: safeText(question.explanation, 1200, `${label} penjelasan`) };
        }
    });

    const rawGenerations = Array.isArray(data.generations)
        ? data.generations
        : (HMIF_DATA.generations || []);
    const sanitizeLink = (url, label) => {
        const text = safeText(url ?? '', 250, label);
        if (!text) return '';
        if (/^javascript:/i.test(text.trim())) throw new Error(`${label} tidak aman.`);
        return text;
    };
    const generations = safeList(rawGenerations, {
        maxItems: 30,
        label: 'Angkatan',
        map: (gen, label) => {
            const id = safeText(gen?.id, 64, `${label} ID`);
            if (!/^[a-zA-Z0-9_-]+$/.test(id)) throw new Error(`${label} ID tidak valid.`);
            const year = safeText(gen?.year, 16, `${label} tahun`);
            const name = safeText(gen?.name, 120, `${label} nama batalion`);
            const tagline = safeText(gen?.tagline ?? '', 200, `${label} semboyan`);
            const description = safeText(gen?.description ?? '', 2000, `${label} deskripsi`);
            const status = safeText(gen?.status ?? '', 100, `${label} status`);
            const emblem = typeof gen?.emblem === 'string' && gen.emblem.trim()
                ? validateAssetUrl(gen.emblem.trim(), `${label} emblem/logo`, assetExists)
                : '';
            const order = Number.isInteger(gen?.order) && gen.order >= 0 ? gen.order : 0;

            const rawSocials = gen?.socials && typeof gen.socials === 'object' ? gen.socials : {};
            const socials = {
                instagram: sanitizeLink(rawSocials.instagram ?? '', `${label} instagram`),
                tiktok: sanitizeLink(rawSocials.tiktok ?? '', `${label} tiktok`),
                whatsapp: sanitizeLink(rawSocials.whatsapp ?? '', `${label} whatsapp`),
                linkedin: sanitizeLink(rawSocials.linkedin ?? '', `${label} linkedin`),
                github: sanitizeLink(rawSocials.github ?? '', `${label} github`)
            };

            const rawLeadership = gen?.leadership && typeof gen.leadership === 'object' ? gen.leadership : {};
            const leadership = {};
            for (const roleKey of ['ketua', 'wakil', 'sekretaris', 'bendahara']) {
                const item = rawLeadership[roleKey] || {};
                const avatar = typeof item.avatar === 'string' && item.avatar.trim()
                    ? validateAssetUrl(item.avatar.trim(), `${label} ${roleKey} avatar`, assetExists)
                    : '';
                leadership[roleKey] = {
                    title: safeText(item.title ?? '', 100, `${label} ${roleKey} gelar`),
                    operatorId: safeText(item.operatorId ?? '', 64, `${label} ${roleKey} ID operator`),
                    accountId: safeText(item.accountId ?? '', 64, `${label} ${roleKey} ID akun`),
                    name: safeText(item.name ?? '', 120, `${label} ${roleKey} nama`),
                    nim: safeText(item.nim ?? '', 32, `${label} ${roleKey} NIM`),
                    avatar
                };
            }

            const rawDivisions = Array.isArray(gen?.divisions) ? gen.divisions : [];
            const divisions = safeList(rawDivisions, {
                maxItems: 30,
                label: `${label} perangkat angkatan`,
                map: (div, divLabel) => {
                    const divId = safeText(div?.id, 64, `${divLabel} ID`);
                    if (!/^[a-zA-Z0-9_-]+$/.test(divId)) throw new Error(`${divLabel} ID tidak valid.`);
                    const divName = safeText(div?.name, 120, `${divLabel} nama divisi/perangkat`);
                    const coordinator = safeText(div?.coordinator ?? '', 120, `${divLabel} koordinator`);
                    const coordinatorNim = safeText(div?.coordinatorNim ?? '', 32, `${divLabel} NIM koordinator`);
                    const coordinatorOperatorId = safeText(div?.coordinatorOperatorId ?? '', 64, `${divLabel} ID operator koordinator`);
                    const coordinatorAccountId = safeText(div?.coordinatorAccountId ?? '', 64, `${divLabel} ID akun koordinator`);
                    const coordinatorAvatar = typeof div?.coordinatorAvatar === 'string' && div.coordinatorAvatar.trim()
                        ? validateAssetUrl(div.coordinatorAvatar.trim(), `${divLabel} foto koordinator`, assetExists)
                        : '';
                    const members = safeList(Array.isArray(div?.members) ? div.members : [], {
                        maxItems: 50,
                        label: `${divLabel} anggota`,
                        map: (member, memberLabel) => {
                            if (typeof member === 'string') return safeText(member, 120, memberLabel);
                            const id = safeText(member?.id, 64, `${memberLabel} ID`);
                            if (!/^[a-zA-Z0-9_-]+$/.test(id)) throw new Error(`${memberLabel} ID tidak valid.`);
                            const avatar = typeof member?.avatar === 'string' && member.avatar.trim()
                                ? validateAssetUrl(member.avatar.trim(), `${memberLabel} foto`, assetExists)
                                : '';
                            const name = safeText(member?.name, 120, `${memberLabel} nama`);
                            if (!name) throw new Error(`${memberLabel} nama wajib diisi.`);
                            return {
                                id,
                                name,
                                nim: safeText(member?.nim ?? '', 32, `${memberLabel} NIM`),
                                avatar,
                                operatorId: safeText(member?.operatorId ?? '', 64, `${memberLabel} ID operator`)
                            };
                        }
                    });
                    const memberIds = members.filter((member) => typeof member !== 'string').map((member) => member.id);
                    if (new Set(memberIds).size !== memberIds.length) throw new Error(`${divLabel} ID anggota harus unik.`);
                    return {
                        id: divId,
                        name: divName,
                        coordinator,
                        coordinatorNim,
                        coordinatorOperatorId,
                        coordinatorAccountId,
                        coordinatorAvatar,
                        members
                    };
                }
            });

            return {
                id,
                year,
                name,
                tagline,
                description,
                status,
                emblem,
                order,
                socials,
                leadership,
                divisions
            };
        }
    });
    if (new Set(generations.map(({ id }) => id)).size !== generations.length) throw new Error('ID angkatan harus unik.');

    const operatorIds = new Set(operators.map(({ id }) => id));
    for (const generation of generations) {
        for (const [roleKey, leader] of Object.entries(generation.leadership)) {
            if (leader.operatorId && !operatorIds.has(leader.operatorId)) {
                throw new Error(`ID operator ${roleKey} Angkatan ${generation.year} tidak ditemukan.`);
            }
        }
        for (const division of generation.divisions) {
            if (division.coordinatorOperatorId && !operatorIds.has(division.coordinatorOperatorId)) {
                throw new Error(`ID operator koordinator ${division.name} Angkatan ${generation.year} tidak ditemukan.`);
            }
            for (const member of division.members) {
                if (typeof member !== 'string' && member.operatorId && !operatorIds.has(member.operatorId)) {
                    throw new Error(`ID operator anggota ${member.name} Angkatan ${generation.year} tidak ditemukan.`);
                }
            }
        }
    }

    return { identity, visionMission, departments, organizationStructure, knowledgeResources, generations, operators, news, doctrine: { adArt, cadetRoadmap, cadetQuiz } };
};

export function validateSiteConfig(input, assetExists = () => false) {
    if (!input || typeof input !== 'object' || Array.isArray(input)) throw new Error('Konfigurasi situs tidak valid.');
    const theme = input.theme;
    if (!theme || typeof theme !== 'object') throw new Error('Pengaturan tema wajib tersedia.');

    const colors = {};
    for (const key of Object.keys(DEFAULT_SITE_CONFIG.theme.colors)) {
        const color = theme.colors?.[key];
        if (typeof color !== 'string' || !colorPattern.test(color)) throw new Error(`Warna ${key} harus berupa hex #RRGGBB.`);
        colors[key] = color.toLowerCase();
    }
    if (contrastRatio(colors.text, colors.background) < 4.5) throw new Error('Kontras teks utama terhadap latar minimal 4.5:1.');
    if (contrastRatio(colors.textMuted, colors.background) < 4.5) throw new Error('Kontras teks sekunder terhadap latar minimal 4.5:1.');
    if ([colors.accent, colors.accentAlt, colors.danger, colors.success, colors.info].some((color) => contrastRatio(color, colors.background) < 3)) {
        throw new Error('Kontras warna aksen dan status terhadap latar minimal 3:1.');
    }

    const fonts = {};
    for (const key of ['body', 'heading', 'mono']) {
        const font = theme.fonts?.[key];
        const assetFont = typeof font === 'string' && /^asset:[a-f0-9-]{36}$/.test(font);
        if (!fontFamilies.has(font) && !(assetFont && assetExists(font.slice(6), 'font'))) throw new Error(`Font ${key} tidak didukung.`);
        fonts[key] = font;
    }

    if (!Number.isInteger(theme.typeScale) || theme.typeScale < 14 || theme.typeScale > 22) {
        throw new Error('Skala teks harus bilangan bulat dari 14 sampai 22 piksel.');
    }
    if (!shapes.has(theme.shape) || !iconStyles.has(theme.iconStyle)) throw new Error('Preset bentuk atau ikon tidak didukung.');
    if (!contrasts.has(theme.contrast) || typeof theme.motion !== 'boolean') throw new Error('Pengaturan kontras atau animasi tidak valid.');
    if (!theme.background || !backgroundModes.has(theme.background.mode)) throw new Error('Mode latar tidak didukung.');
    const backgroundImage = resolveBackgroundImage(theme.background);
    if (theme.background.mode === 'image' && !backgroundImage) {
        throw new Error('Mode gambar latar memerlukan aset terunggah atau gambar bawaan.');
    }
    const normalizedBackgroundImage = backgroundImage === ''
        ? ''
        : validateAssetUrl(backgroundImage, 'Gambar latar', assetExists);
    const rawHeroImage = theme.heroImage === undefined ? DEFAULT_SITE_CONFIG.theme.heroImage : theme.heroImage;
    const heroImage = rawHeroImage === '' ? '' : validateAssetUrl(rawHeroImage, 'Gambar hero', assetExists);
    const backgroundAssetId = /^\/api\/site\/assets\/([a-f0-9-]{36})\/file$/.exec(normalizedBackgroundImage)?.[1] || null;

    if (!Array.isArray(input.pages) || input.pages.length !== PAGE_BLOCKS.length) throw new Error('Semua blok halaman harus disertakan tepat satu kali.');
    const pageIds = new Set(PAGE_BLOCKS.map(({ id }) => id));
    const seenPageIds = new Set();
    const pages = input.pages.map((page) => {
        if (!page || !pageIds.has(page.id) || seenPageIds.has(page.id)) throw new Error('Daftar blok halaman mengandung ID tidak valid atau duplikat.');
        if (typeof page.visible !== 'boolean' || !layouts.has(page.layout)) throw new Error(`Pengaturan blok ${page.id} tidak valid.`);
        seenPageIds.add(page.id);
        return { id: page.id, visible: page.visible, layout: page.layout };
    });
    if (!pages.some((page) => page.visible)) throw new Error('Setidaknya satu blok halaman harus terlihat.');

    const content = input.content;
    if (!content || typeof content !== 'object') throw new Error('Konten situs tidak valid.');
    const sectionTitles = {};
    for (const { id } of PAGE_BLOCKS.filter(({ id }) => id !== 'dashboard')) {
        sectionTitles[id] = safeText(content.sectionTitles?.[id], copyLimits.sectionTitles, `Judul ${id}`);
    }
    const sectionDescriptions = {};
    for (const { id } of PAGE_BLOCKS.filter(({ id }) => id !== 'dashboard')) {
        sectionDescriptions[id] = safeText(content.sectionDescriptions?.[id], 1000, `Deskripsi ${id}`);
    }
    const heroActions = safeList(content.heroActions, { maxItems: 3, label: 'Tombol dashboard', map: (label, name) => safeText(label, 80, name) });
    if (heroActions.length !== 3) throw new Error('Tiga label tombol dashboard wajib tersedia.');
    const statLabels = Object.fromEntries(['activeCadets', 'divisionsCount', 'prokerCount', 'complianceRate'].map((key) => [
        key,
        safeText(content.statLabels?.[key], 80, `Label statistik ${key}`)
    ]));
    const contentData = validateContentData(content.data, assetExists);

    return {
        theme: {
            colors,
            fonts,
            typeScale: theme.typeScale,
            shape: theme.shape,
            iconStyle: theme.iconStyle,
            background: {
                mode: theme.background.mode,
                image: theme.background.mode === 'solid' ? '' : normalizedBackgroundImage,
                assetId: theme.background.mode === 'solid' ? null : backgroundAssetId
            },
            heroImage,
            contrast: theme.contrast,
            motion: theme.motion
        },
        pages,
        content: {
            heroEyebrow: safeText(content.heroEyebrow, copyLimits.heroEyebrow, 'Eyebrow dashboard'),
            heroLead: safeText(content.heroLead, copyLimits.heroLead, 'Deskripsi dashboard'),
            heroActions,
            statLabels,
            sectionDescriptions,
            sectionTitles,
            data: contentData
        }
    };
}
