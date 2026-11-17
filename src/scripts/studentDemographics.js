const escapeHtml = (value) => String(value ?? '').replace(/[&<>"']/g, (character) => ({
    '&': '&amp;',
    '<': '&lt;',
    '>': '&gt;',
    '"': '&quot;',
    "'": '&#39;'
}[character]));

const csvCell = (value) => {
    const text = String(value ?? '');
    const safeText = /^[\s]*[=+@-]/.test(text) ? `'${text}` : text;
    return `"${safeText.replace(/"/g, '""')}"`;
};

const csvDimensions = [
    ['Angkatan', 'byGeneration'],
    ['Divisi', 'byDivision'],
    ['Tahap keanggotaan', 'byMembershipStage'],
    ['Clearance', 'byClearance'],
    ['Kelengkapan profil administratif', 'profileCompleteness']
];

export const renderCustomFieldInput = (field, value, { prefix = '' } = {}) => {
    const name = `${prefix}${field.id}`;
    const label = escapeHtml(field.label);
    const dataAttributes = `data-custom-field-value data-field-id="${escapeHtml(field.id)}" data-field-type="${escapeHtml(field.type)}"`;
    if (field.type === 'long_text') {
        return `<label class="form-group"><span class="form-label">${label}</span><textarea class="form-textarea" name="${escapeHtml(name)}" ${dataAttributes} maxlength="2000">${escapeHtml(value ?? '')}</textarea></label>`;
    }
    if (field.type === 'boolean') {
        return `<label class="form-group"><span class="form-label">${label}</span><select class="form-select" name="${escapeHtml(name)}" ${dataAttributes}>
          <option value="" ${value === null || value === undefined ? 'selected' : ''}>Belum diisi</option>
          <option value="true" ${value === true ? 'selected' : ''}>Ya</option>
          <option value="false" ${value === false ? 'selected' : ''}>Tidak</option>
        </select></label>`;
    }
    if (field.type === 'single_select' || field.type === 'multi_select') {
        const selectedValues = field.type === 'multi_select' && Array.isArray(value) ? value : [];
        return `<label class="form-group"><span class="form-label">${label}</span><select class="form-select" name="${escapeHtml(name)}" ${dataAttributes} ${field.type === 'multi_select' ? 'multiple size="4"' : ''}>
          ${field.type === 'single_select' ? `<option value="">Belum diisi</option>` : ''}
          ${(field.options || []).map((option) => {
            const selected = field.type === 'multi_select' ? selectedValues.includes(option) : value === option;
            return `<option value="${escapeHtml(option)}" ${selected ? 'selected' : ''}>${escapeHtml(option)}</option>`;
          }).join('')}
        </select></label>`;
    }
    const inputType = field.type === 'number' ? 'number' : field.type === 'date' ? 'date' : 'text';
    const extraAttributes = field.type === 'number' ? 'step="any"' : field.type === 'text' ? 'maxlength="160"' : '';
    return `<label class="form-group"><span class="form-label">${label}</span><input class="form-input" type="${inputType}" name="${escapeHtml(name)}" ${dataAttributes} ${extraAttributes} value="${escapeHtml(value ?? '')}" /></label>`;
};

export const collectCustomFieldValues = (container) => Object.fromEntries(
    [...container.querySelectorAll('[data-custom-field-value]')].map((input) => {
        const { fieldId, fieldType } = input.dataset;
        if (fieldType === 'multi_select') {
            return [fieldId, [...input.selectedOptions].map((option) => option.value)];
        }
        if (fieldType === 'number') return [fieldId, input.value === '' ? null : Number(input.value)];
        if (fieldType === 'boolean') return [fieldId, input.value === '' ? null : input.value === 'true'];
        return [fieldId, input.value === '' ? null : input.value];
    })
);

export const buildStudentDemographicsCsv = (data = {}) => {
    const rows = [
        ['Laporan', 'Statistik mahasiswa Informatika'],
        ['Sumber', data.source || 'Akun mahasiswa/anggota terdaftar'],
        ['Dibuat pada', data.generatedAt || 'Tidak tersedia'],
        ['Jumlah akun terdaftar', Number(data.totalAccounts) || 0],
        ['Ambang penyamaran kelompok kecil', Number(data.minimumCellSize) || 5],
        [],
        ['Dimensi', 'Kategori', 'Jumlah']
    ];
    for (const [label, key] of csvDimensions) {
        for (const { label: category, count } of Array.isArray(data[key]) ? data[key] : []) {
            rows.push([label, category, Number(count) || 0]);
        }
    }
    return `\uFEFF${rows.map((row) => row.map(csvCell).join(',')).join('\r\n')}`;
};

const renderDistribution = (title, rows = []) => {
    const maximum = Math.max(1, ...rows.map(({ count }) => Number(count) || 0));
    return `
    <section class="student-demographics-card">
      <h3>${escapeHtml(title)}</h3>
      ${rows.length ? `<ul>${rows.map(({ label, count }) => {
        const value = Number(count) || 0;
        const width = Math.round((value / maximum) * 100);
        return `<li>
          <div class="student-demographics-row-label"><span>${escapeHtml(label)}</span><strong>${value}</strong></div>
          <div class="student-demographics-bar" aria-hidden="true"><span style="width:${width}%"></span></div>
        </li>`;
    }).join('')}</ul>` : '<p class="workspace-empty-state">Belum ada data untuk ditampilkan.</p>'}
    </section>`;
};

const renderAccountTable = (columns = [], accounts = []) => `
  <section id="student-demographics-account-table" class="student-demographics-card student-demographics-account-table" hidden>
    <h3>Informasi akun anggota</h3>
    <p>Data individual ini dapat dilihat pemegang capability statistik mahasiswa. Isi kolom mengikuti konfigurasi superadmin di Site Studio.</p>
    ${columns.length ? `<div class="student-demographics-table-wrap"><table>
      <thead><tr>${columns.map(({ label }) => `<th scope="col">${escapeHtml(label)}</th>`).join('')}</tr></thead>
      <tbody>${accounts.length ? accounts.map((account) => `<tr>${columns.map(({ id }) => {
        const value = account[id];
        const displayValue = Array.isArray(value) ? value.join(', ')
            : typeof value === 'boolean' ? (value ? 'Ya' : 'Tidak')
                : value === null || value === undefined || value === '' ? '—' : value;
        return `<td>${escapeHtml(displayValue)}</td>`;
    }).join('')}</tr>`).join('') : `<tr><td colspan="${columns.length}">Belum ada akun anggota.</td></tr>`}</tbody>
    </table></div>` : '<p class="workspace-empty-state">Belum ada kolom akun yang diaktifkan oleh superadmin di Site Studio.</p>'}
  </section>`;

export const renderStudentDemographics = (data = {}) => `
  <div class="student-demographics-dashboard">
    <section class="workspace-feature-hero">
      <span class="section-tag cyan">AKSES TERBATAS // CAPABILITY STATISTIK MAHASISWA</span>
      <h2>Statistik Mahasiswa Informatika</h2>
      <p>Ringkasan ini hanya mencakup akun mahasiswa/anggota yang terdaftar pada sistem HMIF; bukan sensus resmi seluruh mahasiswa Universitas Mayasari Bakti.</p>
      <div class="student-demographics-total"><strong>${Number(data.totalAccounts) || 0}</strong><span>akun terdaftar</span></div>
      <p class="workspace-feature-note">Distribusi dengan kelompok kurang dari ${Number(data.minimumCellSize) || 5} akun disamarkan. Tabel akun mengikuti pilihan kolom superadmin di Site Studio dan hanya tersedia bagi pemegang capability statistik mahasiswa.</p>
      <p class="student-demographics-generated">Snapshot dibuat: ${escapeHtml(data.generatedAt || 'waktu tidak tersedia')}</p>
      <button class="btn-tactical" type="button" data-student-demographics-table-toggle aria-expanded="false" aria-controls="student-demographics-account-table">TAMPILKAN INFORMASI AKUN</button>
      <button class="btn-tactical" type="button" data-student-demographics-export>UNDUH CSV AGREGAT</button>
      <p class="workspace-feature-note" data-student-demographics-export-feedback role="status" aria-live="polite"></p>
    </section>
    <div class="student-demographics-grid">
      ${renderDistribution('Distribusi angkatan', data.byGeneration)}
      ${renderDistribution('Distribusi divisi', data.byDivision)}
      ${renderDistribution('Tahap keanggotaan', data.byMembershipStage)}
      ${renderDistribution('Distribusi clearance', data.byClearance)}
      ${renderDistribution('Kelengkapan profil administratif', data.profileCompleteness)}
    </div>
    ${renderAccountTable(data.columns, data.accounts)}
  </div>`;

export const bindStudentDemographicsExport = (container, data) => {
    const table = container.querySelector('#student-demographics-account-table');
    const toggleButton = container.querySelector('[data-student-demographics-table-toggle]');
    toggleButton?.addEventListener('click', () => {
        const shouldShow = table?.hidden ?? false;
        if (table) table.hidden = !shouldShow;
        toggleButton.setAttribute('aria-expanded', String(shouldShow));
        toggleButton.textContent = shouldShow ? 'SEMBUNYIKAN INFORMASI AKUN' : 'TAMPILKAN INFORMASI AKUN';
    });

    const button = container.querySelector('[data-student-demographics-export]');
    const feedback = container.querySelector('[data-student-demographics-export-feedback]');
    button?.addEventListener('click', () => {
        const blob = new Blob([buildStudentDemographicsCsv(data)], { type: 'text/csv;charset=utf-8' });
        const objectUrl = URL.createObjectURL(blob);
        const link = document.createElement('a');
        const date = new Date().toISOString().slice(0, 10);
        link.href = objectUrl;
        link.download = `statistik-mahasiswa-agregat-${date}.csv`;
        document.body.append(link);
        link.click();
        link.remove();
        window.setTimeout(() => URL.revokeObjectURL(objectUrl), 0);
        if (feedback) feedback.textContent = 'CSV agregat berhasil disiapkan. Baris akun individual tidak disertakan.';
    });
};
