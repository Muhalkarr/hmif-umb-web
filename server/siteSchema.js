import { HMIF_DATA } from '../src/scripts/data.js';

export const PAGE_BLOCKS = [
    { id: 'dashboard', label: 'Dashboard' },
    { id: 'vision', label: 'Visi dan Misi' },
    { id: 'squad', label: 'Struktur Pengurus' },
    { id: 'proker', label: 'Program Kerja' },
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
        || content.operators?.some((operator) => operator.avatar === url)
        || content.news?.some((article) => article.thumbnail === url);
}

const emptyContentData = {
    identity: { name: '', abbreviation: '', university: '', faculty: '', established: '', location: '', tagline: '', logo: '', activeCadets: '', divisionsCount: 0, prokerCount: 0, complianceRate: '' },
    visionMission: { vision: '', mission: [], sambutanKahim: { leaderName: '', role: '', period: '', operatorCode: '', quote: '' } },
    operators: [],
    news: [],
    doctrine: { adArt: [], cadetRoadmap: [], cadetQuiz: [] }
};

const initialContentData = process.env.NODE_ENV === 'production'
    ? emptyContentData
    : {
        identity: { ...structuredClone(HMIF_DATA.identity), logo: HMIF_DATA.identity.logo || '/assets/hmif_umb_logo.jpg' },
        visionMission: structuredClone(HMIF_DATA.visionMission),
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
            squad: 'Profil fungsionaris, pengurus, dan kepala divisi.',
            proker: 'Daftar program kerja, sasaran, KPI, dan status realisasi.',
            calendar: 'Kalender akademik yang diselaraskan dengan agenda organisasi.',
            doctrine: 'Pusat literasi AD/ART, GBHO, dan tahapan kaderisasi.',
            intel: 'Dokumentasi berkala, berita, dan arsip kegiatan.',
            commlink: 'Saluran komunikasi mahasiswa untuk menyampaikan aspirasi.'
        },
        sectionTitles: {
            vision: 'VISI DAN MISI ORGANISASI',
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

const validateContentData = (data, assetExists) => {
    if (!data || typeof data !== 'object') throw new Error('Koleksi konten tidak valid.');
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
            return {
                id,
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

    return { identity, visionMission, operators, news, doctrine: { adArt, cadetRoadmap, cadetQuiz } };
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
