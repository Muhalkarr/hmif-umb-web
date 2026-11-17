export const STUDENT_ACCOUNT_COLUMNS = [
    { id: 'name', label: 'Nama', type: 'text' },
    { id: 'nim', label: 'NIM', type: 'text' },
    { id: 'email', label: 'Email', type: 'text' },
    { id: 'generation', label: 'Angkatan', type: 'text' },
    { id: 'division', label: 'Divisi', type: 'text' },
    { id: 'membership_stage', label: 'Tahap keanggotaan', type: 'text' },
    { id: 'clearance_level', label: 'Clearance', type: 'number' },
    { id: 'role_title', label: 'Jabatan akun', type: 'text' },
    { id: 'code_name', label: 'Kode nama', type: 'text' },
    { id: 'created_at', label: 'Tanggal akun dibuat', type: 'date' }
];

export const STUDENT_CUSTOM_FIELD_TYPES = [
    { id: 'text', label: 'Teks satu baris' },
    { id: 'long_text', label: 'Teks panjang' },
    { id: 'number', label: 'Angka' },
    { id: 'date', label: 'Tanggal' },
    { id: 'boolean', label: 'Ya/Tidak' },
    { id: 'single_select', label: 'Pilihan tunggal' },
    { id: 'multi_select', label: 'Pilihan ganda' }
];

export const DEFAULT_STUDENT_DEMOGRAPHIC_SETTINGS = {
    visibleColumns: STUDENT_ACCOUNT_COLUMNS.map(({ id }) => id),
    customColumns: []
};

const MINIMUM_VISIBLE_CELL_SIZE = 5;
const customFieldTypes = new Set(STUDENT_CUSTOM_FIELD_TYPES.map(({ id }) => id));
const standardColumnIds = new Set(STUDENT_ACCOUNT_COLUMNS.map(({ id }) => id));

export const validateStudentDemographicSettings = (input) => {
    if (!input || typeof input !== 'object' || Array.isArray(input)
        || !Array.isArray(input.visibleColumns) || !Array.isArray(input.customColumns)) {
        return { error: 'Konfigurasi kolom statistik tidak valid.' };
    }

    if (input.visibleColumns.some((id) => typeof id !== 'string' || !standardColumnIds.has(id))
        || new Set(input.visibleColumns).size !== input.visibleColumns.length) {
        return { error: 'Daftar kolom akun standar tidak valid.' };
    }
    if (input.customColumns.length > 30) return { error: 'Maksimal 30 kolom kustom dapat dibuat.' };

    const customIds = new Set();
    const customColumns = [];
    for (const field of input.customColumns) {
        if (!field || typeof field !== 'object' || Array.isArray(field)
            || typeof field.id !== 'string' || !/^[a-zA-Z0-9_-]{1,64}$/.test(field.id)
            || standardColumnIds.has(field.id) || customIds.has(field.id)
            || typeof field.label !== 'string' || !field.label.trim() || field.label.trim().length > 80
            || !customFieldTypes.has(field.type) || typeof field.visible !== 'boolean') {
            return { error: 'Definisi kolom kustom tidak valid.' };
        }

        const options = field.options === undefined ? [] : field.options;
        if (!Array.isArray(options)) return { error: `Opsi kolom ${field.label} tidak valid.` };
        const normalizedOptions = options.map((option) => typeof option === 'string' ? option.trim() : '');
        if (['single_select', 'multi_select'].includes(field.type)) {
            if (normalizedOptions.length < 1 || normalizedOptions.length > 50
                || normalizedOptions.some((option) => !option || option.length > 80)
                || new Set(normalizedOptions).size !== normalizedOptions.length) {
                return { error: `Kolom ${field.label} harus memiliki 1–50 opsi unik.` };
            }
        } else if (normalizedOptions.length) {
            return { error: `Kolom ${field.label} tidak menerima daftar opsi.` };
        }

        customIds.add(field.id);
        customColumns.push({
            id: field.id,
            label: field.label.trim(),
            type: field.type,
            options: normalizedOptions,
            visible: field.visible
        });
    }

    return {
        settings: {
            visibleColumns: [...input.visibleColumns],
            customColumns
        }
    };
};

export const validateStudentDemographicValues = (input, fields) => {
    if (!input || typeof input !== 'object' || Array.isArray(input)) {
        return { error: 'Nilai kolom kustom harus berbentuk objek.' };
    }
    const fieldsById = new Map(fields.map((field) => [field.id, field]));
    const values = {};
    for (const [id, value] of Object.entries(input)) {
        const field = fieldsById.get(id);
        if (!field) return { error: 'Nilai berisi kolom kustom yang tidak dikenal.' };
        if (value === null || value === '') {
            values[id] = null;
            continue;
        }

        if (field.type === 'text' && typeof value === 'string' && value.trim().length <= 160) {
            values[id] = value.trim();
        } else if (field.type === 'long_text' && typeof value === 'string' && value.length <= 2000) {
            values[id] = value.trim();
        } else if (field.type === 'number' && typeof value === 'number' && Number.isFinite(value)) {
            values[id] = value;
        } else if (field.type === 'date' && typeof value === 'string'
            && /^\d{4}-\d{2}-\d{2}$/.test(value)
            && !Number.isNaN(Date.parse(`${value}T00:00:00.000Z`))
            && new Date(`${value}T00:00:00.000Z`).toISOString().slice(0, 10) === value) {
            values[id] = value;
        } else if (field.type === 'boolean' && typeof value === 'boolean') {
            values[id] = value;
        } else if (field.type === 'single_select' && typeof value === 'string' && field.options.includes(value)) {
            values[id] = value;
        } else if (field.type === 'multi_select' && Array.isArray(value)
            && value.every((option) => typeof option === 'string' && field.options.includes(option))
            && new Set(value).size === value.length) {
            values[id] = value;
        } else {
            return { error: `Nilai untuk kolom ${field.label} tidak sesuai dengan tipe datanya.` };
        }
    }
    return { values };
};

const aggregateBy = (accounts, field) => {
    const counts = new Map();
    for (const account of accounts) {
        const rawValue = account[field];
        const label = typeof rawValue === 'string' && rawValue.trim() ? rawValue.trim() : 'Belum dicatat';
        counts.set(label, (counts.get(label) || 0) + 1);
    }

    const visible = [];
    let suppressedCount = 0;
    for (const [label, count] of counts) {
        if (count < MINIMUM_VISIBLE_CELL_SIZE) suppressedCount += count;
        else visible.push({ label, count });
    }
    if (suppressedCount) visible.push({ label: 'Disembunyikan (<5)', count: suppressedCount });
    return visible.sort((first, second) => first.label.localeCompare(second.label, 'id'));
};

const hasText = (value) => typeof value === 'string' && value.trim().length > 0;

export const summarizeStudentAccounts = (users) => {
    const accounts = Array.isArray(users)
        ? users.filter((user) => user && user.role !== 'superadmin')
        : [];
    return {
        source: 'Akun mahasiswa/anggota yang terdaftar di sistem HMIF',
        generatedAt: new Date().toISOString(),
        totalAccounts: accounts.length,
        minimumCellSize: MINIMUM_VISIBLE_CELL_SIZE,
        byGeneration: aggregateBy(accounts, 'generation'),
        byDivision: aggregateBy(accounts, 'division'),
        byMembershipStage: aggregateBy(accounts, 'membership_stage'),
        byClearance: aggregateBy(accounts.map((user) => ({
            clearanceLabel: Number.isInteger(user.clearance_level) && user.clearance_level >= 1 && user.clearance_level <= 3
                ? `Level ${user.clearance_level}`
                : 'Belum dicatat'
        })), 'clearanceLabel'),
        profileCompleteness: aggregateBy(accounts.map((user) => ({
            profileStatus: ['generation', 'division', 'membership_stage'].every((field) => hasText(user[field]))
                ? 'Terisi'
                : 'Perlu dilengkapi'
        })), 'profileStatus')
    };
};

export const buildStudentAccountTable = (users, settings, customValues = {}) => {
    const standardColumns = STUDENT_ACCOUNT_COLUMNS
        .filter((column) => settings.visibleColumns.includes(column.id));
    const customColumns = settings.customColumns
        .filter((column) => column.visible)
        .map(({ id, label, type }) => ({ id, label, type, custom: true }));
    const columns = [...standardColumns, ...customColumns];
    const accounts = (Array.isArray(users) ? users : [])
        .filter((user) => user && user.role !== 'superadmin')
        .map((user) => Object.fromEntries(columns.map(({ id }) => [
            id,
            standardColumnIds.has(id) ? user[id] ?? null : customValues[user.account_id]?.[id] ?? null
        ])));
    return { columns, accounts };
};
