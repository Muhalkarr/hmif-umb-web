const escapeHtml = (value) => String(value ?? '').replace(/[&<>"']/g, (character) => ({
  '&': '&amp;',
  '<': '&lt;',
  '>': '&gt;',
  '"': '&quot;',
  "'": '&#39;'
}[character]));

export function renderOrganizationStructure(structure, today = new Date().toISOString().slice(0, 10)) {
  const term = structure?.terms?.find(({ status }) => status === 'active');
  if (!term) return '';

  const peopleById = new Map((structure.people || []).map((person) => [person.id, person]));
  const childrenByParentId = new Map();
  for (const unit of term.units || []) {
    const key = unit.parentUnitId || '';
    childrenByParentId.set(key, [...(childrenByParentId.get(key) || []), unit]);
  }
  const activeAssignments = (term.assignments || []).filter((assignment) => assignment.startDate <= today
    && (!assignment.endDate || assignment.endDate >= today));
  const assignedPersonIds = new Set(activeAssignments.map(({ personId }) => personId).filter(Boolean));
  const membersWithoutPosition = (structure.people || []).filter((person) => person.isPublic === true
    && !assignedPersonIds.has(person.id)).sort((a, b) => a.name.localeCompare(b.name));
  const renderUnit = (unit) => {
    const positions = (term.positions || []).filter(({ unitId }) => unitId === unit.id).sort((a, b) => a.order - b.order);
    const positionHtml = positions.map((position) => {
      const currentAssignments = (term.assignments || []).filter((assignment) => assignment.positionId === position.id
        && assignment.startDate <= today && (!assignment.endDate || assignment.endDate >= today));
      const visibleAssignments = currentAssignments.map(({ personId, kind }) => ({ person: peopleById.get(personId), kind }))
        .filter(({ person }) => person?.isPublic === true);
      const hiddenAssignments = currentAssignments.length - visibleAssignments.length;
      const holders = [
        ...visibleAssignments.map(({ person, kind }) => `<span class="organization-holder">${escapeHtml(person.name)}${kind === 'acting' ? ' <small>PLT</small>' : ''}</span>`),
        ...(hiddenAssignments ? ['<span class="organization-private">Pemegang tidak ditampilkan</span>'] : [])
      ];
      return `
        <li class="organization-position">
          <strong>${escapeHtml(position.title)}</strong>
          <span>${holders.length ? holders.join('') : '<span class="organization-vacant">Belum ada penugasan aktif</span>'}</span>
        </li>`;
    }).join('');
    const childUnits = (childrenByParentId.get(unit.id) || []).sort((a, b) => a.order - b.order);
    return `
      <li class="organization-unit">
        <div class="organization-unit-heading"><strong>${escapeHtml(unit.name)}</strong>${unit.code ? `<span>${escapeHtml(unit.code)}</span>` : ''}</div>
        ${unit.description ? `<p>${escapeHtml(unit.description)}</p>` : ''}
        ${positionHtml ? `<ul class="organization-position-list">${positionHtml}</ul>` : ''}
        ${childUnits.length ? `<ul class="organization-unit-list">${childUnits.map(renderUnit).join('')}</ul>` : ''}
      </li>`;
  };
  const roots = (childrenByParentId.get('') || []).sort((a, b) => a.order - b.order);
  if (!roots.length && !membersWithoutPosition.length) return '';

  const termEnd = term.endDate ? ` — ${escapeHtml(term.endDate)}` : '';
  return `
    <section class="organization-structure-public" aria-labelledby="organization-structure-title">
      <div class="organization-structure-public-heading">
        <div><p>STRUKTUR TERBIT // PERIODE AKTIF</p><h3 id="organization-structure-title">${escapeHtml(term.name)}</h3></div>
        <span>${escapeHtml(term.startDate)}${termEnd}</span>
      </div>
      ${roots.length ? `<ul class="organization-unit-list organization-unit-roots">${roots.map(renderUnit).join('')}</ul>` : ''}
      ${membersWithoutPosition.length ? `
        <section class="organization-members-public" aria-label="Anggota dan personel tanpa jabatan aktif">
          <h4>ANGGOTA / PERSONEL TANPA JABATAN AKTIF</h4>
          <ul>${membersWithoutPosition.map((person) => `<li>${escapeHtml(person.name)}</li>`).join('')}</ul>
        </section>` : ''}
    </section>`;
}
