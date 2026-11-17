const escapeHtml = (value) => String(value ?? '').replace(/[&<>"']/g, (character) => ({
  '&': '&amp;',
  '<': '&lt;',
  '>': '&gt;',
  '"': '&quot;',
  "'": '&#39;'
}[character]));

const getDescendants = (nodes, id) => {
  const descendants = new Set();
  const pending = [id];
  while (pending.length) {
    const parentId = pending.pop();
    for (const node of nodes) {
      if (node.parentId === parentId && !descendants.has(node.id)) {
        descendants.add(node.id);
        pending.push(node.id);
      }
    }
  }
  return descendants;
};

const getNodeDepth = (node, nodesById) => {
  let depth = 0;
  let parentId = node.parentId;
  const seen = new Set([node.id]);
  while (parentId && !seen.has(parentId)) {
    seen.add(parentId);
    depth += 1;
    parentId = nodesById.get(parentId)?.parentId || '';
  }
  return depth;
};

export function renderSiteMapEditor(nodes = [], pageLabels = new Map()) {
  const nodesById = new Map(nodes.map((node) => [node.id, node]));
  const pageLabel = (id) => pageLabels.get(id) || id;
  return `
    <section class="studio-site-map-editor" aria-labelledby="studio-site-map-heading">
      <h3 id="studio-site-map-heading">STRUKTUR PETA NAVIGASI SITUS</h3>
      <p class="studio-help">Susun kelompok dan halaman di bawah akar HMIF UMB. Pengaturan ini terpisah dari urutan menu sidebar. Peta situs tidak menautkan ke halamannya sendiri.</p>
      <div class="studio-site-map-list">
        ${nodes.map((node) => {
          const siblings = nodes.filter((candidate) => (candidate.parentId || '') === (node.parentId || ''));
          const siblingIndex = siblings.findIndex(({ id }) => id === node.id);
          const depth = getNodeDepth(node, nodesById);
          const indent = 0.65 + Math.min(depth, 6) * 0.7;
          const label = node.type === 'group' ? node.title : pageLabel(node.id);
          const parentOptions = node.type === 'page'
            ? `<label class="studio-site-map-parent"><span class="form-label">INDUK</span><select class="form-select" name="siteMapParent.${escapeHtml(node.id)}" aria-label="Induk peta untuk ${escapeHtml(label)}">
                <option value="">Akar HMIF UMB</option>
                ${nodes.filter((candidate) => (
                  candidate.id !== node.id && !getDescendants(nodes, node.id).has(candidate.id)
                )).map((candidate) => {
                  const candidateLabel = candidate.type === 'group' ? candidate.title : pageLabel(candidate.id);
                  return `<option value="${escapeHtml(candidate.id)}" ${node.parentId === candidate.id ? 'selected' : ''}>${escapeHtml(candidateLabel)}</option>`;
                }).join('')}
              </select></label>`
            : '';
          return `
            <div class="studio-site-map-row" data-site-map-node="${escapeHtml(node.id)}" data-site-map-depth="${depth}" style="padding-inline-start:${indent}rem">
              <span class="studio-site-map-kind">${node.type === 'group' ? 'KELOMPOK' : 'HALAMAN'}</span>
              ${node.type === 'group'
                ? `<label class="studio-site-map-title"><span class="form-label">NAMA KELOMPOK</span><input class="form-input" name="siteMapNode.${escapeHtml(node.id)}.title" maxlength="80" value="${escapeHtml(node.title)}" required /></label>`
                : `<strong>${escapeHtml(label)}</strong>`}
              ${parentOptions}
              ${node.type === 'group'
                ? `<button class="btn-tactical danger" type="button" data-site-map-group-delete="${escapeHtml(node.id)}" aria-label="Hapus kelompok ${escapeHtml(node.title)}">HAPUS</button>`
                : ''}
              <button class="btn-tactical" type="button" data-move-site-map-node="${escapeHtml(node.id)}" data-direction="up" ${siblingIndex === 0 ? 'disabled' : ''} aria-label="Naikkan ${escapeHtml(label)}">↑</button>
              <button class="btn-tactical" type="button" data-move-site-map-node="${escapeHtml(node.id)}" data-direction="down" ${siblingIndex === siblings.length - 1 ? 'disabled' : ''} aria-label="Turunkan ${escapeHtml(label)}">↓</button>
            </div>`;
        }).join('')}
      </div>
      <button class="btn-tactical" type="button" data-site-map-group-add>+ TAMBAH KELOMPOK</button>
    </section>`;
}

export function createSiteMapGroupDraft() {
  return {
    id: `group-${crypto.randomUUID()}`,
    type: 'group',
    title: 'Kelompok Baru',
    parentId: ''
  };
}

export function moveSiteMapNode(nodes, id, direction) {
  const reordered = nodes.map((node) => ({ ...node }));
  const currentIndex = reordered.findIndex((node) => node.id === id);
  if (currentIndex < 0 || !['up', 'down'].includes(direction)) return reordered;
  const current = reordered[currentIndex];
  let targetIndex = currentIndex + (direction === 'up' ? -1 : 1);
  while (targetIndex >= 0 && targetIndex < reordered.length
    && (reordered[targetIndex].parentId || '') !== (current.parentId || '')) {
    targetIndex += direction === 'up' ? -1 : 1;
  }
  if (targetIndex < 0 || targetIndex >= reordered.length) return reordered;
  [reordered[currentIndex], reordered[targetIndex]] = [reordered[targetIndex], reordered[currentIndex]];
  return reordered;
}

export function removeSiteMapGroup(nodes, id) {
  const group = nodes.find((node) => node.id === id && node.type === 'group');
  if (!group) return nodes.map((node) => ({ ...node }));
  return nodes
    .filter((node) => node.id !== id)
    .map((node) => node.parentId === id ? { ...node, parentId: group.parentId || '' } : { ...node });
}
