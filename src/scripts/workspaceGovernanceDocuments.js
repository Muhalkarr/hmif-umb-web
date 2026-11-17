import {
  governanceDocumentText,
  parseLegacyGovernanceArticle,
  renderGovernanceContentHtml
} from '../../shared/governanceDocumentContent.js';

const escapeHtml = (value) => String(value ?? '')
  .replaceAll('&', '&amp;')
  .replaceAll('<', '&lt;')
  .replaceAll('>', '&gt;')
  .replaceAll('"', '&quot;')
  .replaceAll("'", '&#39;');

const formatDate = (value) => value
  ? new Intl.DateTimeFormat('id-ID', { dateStyle: 'medium', timeStyle: 'short' }).format(new Date(value))
  : 'Waktu tidak tercatat';

const normalizeArticle = (article) => article.contentDocument
  ? article
  : { ...article, ...parseLegacyGovernanceArticle(article) };

const renderArticleContent = (article) => renderGovernanceContentHtml(normalizeArticle(article).contentDocument);

const renderEditorToolbar = () => `
  <div class="governance-editor-toolbar" role="toolbar" aria-label="Pemformatan isi pasal">
    <button type="button" class="btn-tactical btn-small" data-governance-command="bold" aria-label="Tebal" title="Tebal"><strong>B</strong></button>
    <button type="button" class="btn-tactical btn-small" data-governance-command="italic" aria-label="Miring" title="Miring"><em>I</em></button>
    <button type="button" class="btn-tactical btn-small" data-governance-command="underline" aria-label="Garis bawah" title="Garis bawah"><u>U</u></button>
    <button type="button" class="btn-tactical btn-small" data-governance-command="formatBlock" data-command-value="h2">JUDUL 2</button>
    <button type="button" class="btn-tactical btn-small" data-governance-command="formatBlock" data-command-value="h3">JUDUL 3</button>
    <button type="button" class="btn-tactical btn-small" data-governance-command="insertUnorderedList" aria-label="Daftar berpoin">• DAFTAR</button>
    <button type="button" class="btn-tactical btn-small" data-governance-command="insertOrderedList" aria-label="Daftar bernomor">1. DAFTAR</button>
    <button type="button" class="btn-tactical btn-small" data-governance-command="justifyLeft" aria-label="Rata kiri">RATA KIRI</button>
    <button type="button" class="btn-tactical btn-small" data-governance-command="justifyCenter" aria-label="Rata tengah">TENGAH</button>
    <button type="button" class="btn-tactical btn-small" data-governance-command="justifyRight" aria-label="Rata kanan">RATA KANAN</button>
    <button type="button" class="btn-tactical btn-small" data-governance-command="justifyFull" aria-label="Rata kanan kiri">RATA PENUH</button>
    <button type="button" class="btn-tactical btn-small" data-governance-image>PILIH GAMBAR</button>
  </div>
`;

const renderDocument = (documents, { editable = false } = {}) => `
  <div class="governance-document-list">
    ${documents.map((chapter, chapterIndex) => `
      <details class="governance-document-chapter" ${chapterIndex === 0 ? 'open' : ''}>
        <summary><span>${escapeHtml(chapter.bab)}</span><strong>${escapeHtml(chapter.title)}</strong></summary>
        ${editable ? `
          <div class="governance-document-chapter-fields">
            <label>Nama bab
              <input class="form-input" data-governance-chapter="${chapterIndex}" data-field="bab" maxlength="120" value="${escapeHtml(chapter.bab)}" />
            </label>
            <label>Judul bab
              <input class="form-input" data-governance-chapter="${chapterIndex}" data-field="title" maxlength="240" value="${escapeHtml(chapter.title)}" />
            </label>
            <button type="button" class="btn-tactical danger" data-governance-remove-chapter="${chapterIndex}">HAPUS BAB</button>
          </div>
        ` : ''}
        <div class="governance-document-articles">
          ${chapter.pasalList.map((sourceArticle, articleIndex) => {
            const article = normalizeArticle(sourceArticle);
            return `
            <article class="governance-document-article">
              ${editable ? `
                <label>Nomor pasal
                  <input class="form-input" data-governance-article="${chapterIndex}.${articleIndex}" data-field="pasal" maxlength="120" value="${escapeHtml(article.pasal)}" />
                </label>
                <label>Judul pasal (opsional)
                  <input class="form-input" data-governance-article="${chapterIndex}.${articleIndex}" data-field="heading" maxlength="240" value="${escapeHtml(article.heading)}" />
                </label>
                <div class="governance-document-editor-field">
                  <span class="governance-editor-label">Isi pasal</span>
                  ${renderEditorToolbar()}
                  <div class="governance-document-editor" data-governance-editor="${chapterIndex}.${articleIndex}" contenteditable="true" role="textbox" aria-multiline="true" aria-label="Isi ${escapeHtml(article.pasal)}">${renderArticleContent(article)}</div>
                  <input type="file" class="governance-image-input" data-governance-image-input accept="image/png,image/jpeg,image/webp" tabindex="-1" aria-hidden="true" />
                  <small>Gambar PNG, JPEG, atau WebP. Ukuran maksimal 5 MB.</small>
                </div>
                <button type="button" class="btn-tactical danger" data-governance-remove-article="${chapterIndex}.${articleIndex}">HAPUS PASAL</button>
              ` : `
                <h4>${escapeHtml(article.pasal)}${article.heading ? ` · ${escapeHtml(article.heading)}` : ''}</h4>
                <div class="governance-document-content">${renderArticleContent(article)}</div>
              `}
            </article>
          `;
          }).join('')}
        </div>
        ${editable ? `<button type="button" class="btn-tactical" data-governance-add-article="${chapterIndex}">TAMBAH PASAL</button>` : ''}
      </details>
    `).join('')}
  </div>
  ${editable ? '<button type="button" class="btn-tactical" data-governance-add-chapter>TAMBAH BAB</button>' : ''}
`;

const renderHistory = (history, selectedVersion) => `
  <section class="governance-document-history" aria-labelledby="governance-history-title">
    <h3 id="governance-history-title">RIWAYAT VERSI</h3>
    ${history.length ? `<ol>
      ${history.map((revision) => `
        <li>
          <span>${revision.kind === 'official'
            ? 'NASKAH RESMI'
            : revision.draft_status === 'ratified'
              ? 'DRAF DISAHKAN'
              : revision.draft_status === 'withdrawn'
                ? 'DRAF DITARIK'
                : 'DRAF MUBES'} v${revision.version}</span>
          <strong>${escapeHtml(revision.title)}</strong>
          <small>${escapeHtml(revision.author_nim)} · ${escapeHtml(formatDate(revision.created_at))}</small>
          ${revision.change_note ? `<p>${escapeHtml(revision.change_note)}</p>` : ''}
          <button type="button" class="btn-tactical btn-small" data-governance-version="${escapeHtml(revision.id)}">LIHAT VERSI</button>
        </li>
      `).join('')}
    </ol>` : '<p class="empty-state">Belum ada riwayat versi.</p>'}
    ${selectedVersion ? `
      <div class="governance-document-history-detail">
        <div class="governance-document-actions">
          <h4>${escapeHtml(selectedVersion.title)} · v${selectedVersion.version}</h4>
          <button type="button" class="btn-tactical" data-governance-close-version>TUTUP VERSI</button>
        </div>
        ${renderDocument(selectedVersion.documents)}
      </div>
    ` : ''}
  </section>
`;

export const renderGovernanceDocumentsWorkspace = (data, selectedVersion = null) => {
  const { official, draft, history = [], permissions = {} } = data;
  return `
    <div class="governance-documents-workspace">
      <header class="governance-documents-heading">
        <span class="section-tag cyan">MUSYAWARAH BESAR // AD/ART/GBHO</span>
        <h2>Amandemen dokumen organisasi</h2>
        <p>Draf MUBES dapat dibaca anggota yang masuk. Perubahan draf tidak mengubah naskah resmi sampai disahkan dan dipublikasikan.</p>
      </header>
      <p class="auth-feedback" data-governance-feedback role="status" aria-live="polite"></p>
      ${draft ? `
        <section class="governance-document-panel" aria-labelledby="governance-draft-title">
          <div class="governance-document-panel-heading">
            <div>
              <span class="section-tag gold">DRAF MUBES AKTIF · v${draft.version}</span>
              <h3 id="governance-draft-title">${escapeHtml(draft.title)}</h3>
              <p>Terakhir diperbarui ${escapeHtml(formatDate(draft.updatedAt))}.</p>
            </div>
            <span class="governance-document-state">BELUM DISAHKAN</span>
          </div>
          ${permissions.canEdit ? `
            <form data-governance-edit-form>
              ${renderDocument(draft.documents, { editable: true })}
              <label class="governance-document-note">Catatan perubahan
                <input class="form-input" name="change_note" maxlength="500" placeholder="Ringkas perubahan pada revisi ini" />
              </label>
              <div class="governance-document-actions">
                <button type="submit" class="btn-tactical primary">SIMPAN REVISI DRAF</button>
                <button type="button" class="btn-tactical danger" data-governance-withdraw>TARIK DRAF MUBES</button>
              </div>
            </form>
          ` : renderDocument(draft.documents)}
          ${permissions.canRatify ? `
            <form class="governance-document-ratify" data-governance-ratify-form>
              <label class="governance-document-note">Catatan pengesahan MUBES
                <input class="form-input" name="ratification_note" maxlength="500" required minlength="5" placeholder="Contoh: Disahkan dalam MUBES pada tanggal ..." />
              </label>
              <button type="submit" class="btn-tactical gold">SAHKAN & PUBLIKASIKAN VERSI RESMI</button>
            </form>
          ` : ''}
        </section>
      ` : `
        <section class="governance-document-panel">
          <h3>Belum ada draf MUBES aktif</h3>
          ${permissions.canEdit ? `
            <form data-governance-create-form>
              <label class="governance-document-note">Nama forum/periode MUBES
                <input class="form-input" name="title" maxlength="150" required placeholder="Contoh: MUBES HMIF 2026" />
              </label>
              <label class="governance-document-note">Catatan awal
                <input class="form-input" name="change_note" maxlength="500" placeholder="Opsional" />
              </label>
              <button type="submit" class="btn-tactical primary">MULAI DRAF AMANDEMEN</button>
            </form>
          ` : '<p>Hak menyunting draf belum diberikan kepada akun ini.</p>'}
        </section>
      `}
      <section class="governance-document-panel" aria-labelledby="governance-official-title">
        <div class="governance-document-panel-heading">
          <div>
            <span class="section-tag cyan">NASKAH RESMI · v${official.version}</span>
            <h3 id="governance-official-title">${escapeHtml(official.metadata?.title || 'AD/ART/GBHO HMIF UMB')}</h3>
            <p>${escapeHtml(official.metadata?.status || 'Naskah resmi')} · ${official.metadata?.ratifiedAt ? escapeHtml(formatDate(official.metadata.ratifiedAt)) : 'Tanggal pengesahan awal belum tercatat'}.</p>
          </div>
          ${official.metadata?.sourceUrl
            ? `<a class="btn-tactical btn-small" href="${escapeHtml(official.metadata.sourceUrl)}" target="_blank" rel="noopener">PDF SUMBER</a>`
            : '<span class="governance-document-state">VERSI DIGITAL TERBARU</span>'}
        </div>
        ${renderDocument(official.documents)}
        ${official.metadata?.archivedSourceUrl
          ? `<p class="governance-document-archive-note">PDF sumber versi awal: <a href="${escapeHtml(official.metadata.archivedSourceUrl)}" target="_blank" rel="noopener">buka arsip PDF</a>. Naskah digital ini adalah versi terbaru yang disahkan.</p>`
          : ''}
      </section>
      ${renderHistory(history, selectedVersion)}
    </div>
  `;
};

const inlineFromDom = (node, activeMarks = []) => {
  if (node.nodeType === Node.TEXT_NODE) {
    return node.textContent ? [{ type: 'text', text: node.textContent, ...(activeMarks.length ? { marks: activeMarks.map((type) => ({ type })) } : {}) }] : [];
  }
  if (node.nodeType !== Node.ELEMENT_NODE) return [];
  const tag = node.tagName.toLowerCase();
  if (tag === 'br') return [{ type: 'hardBreak' }];
  if (tag === 'img') {
    return [{
      type: 'image',
      attrs: { src: node.getAttribute('src') || '', alt: node.getAttribute('alt') || '', title: node.getAttribute('title') || '' }
    }];
  }
  const mark = { strong: 'bold', b: 'bold', em: 'italic', i: 'italic', u: 'underline', s: 'strike', del: 'strike' }[tag];
  const nextMarks = mark && !activeMarks.includes(mark) ? [...activeMarks, mark] : activeMarks;
  return Array.from(node.childNodes).flatMap((child) => inlineFromDom(child, nextMarks));
};

const blocksFromDom = (node) => {
  if (node.nodeType === Node.TEXT_NODE) {
    return node.textContent.trim() ? [{ type: 'paragraph', content: inlineFromDom(node) }] : [];
  }
  if (node.nodeType !== Node.ELEMENT_NODE) return [];
  const tag = node.tagName.toLowerCase();
  const children = Array.from(node.childNodes);
  if (tag === 'p' || tag === 'h2' || tag === 'h3') {
    const content = children.flatMap((child) => inlineFromDom(child));
    const textAlign = ['left', 'center', 'right', 'justify'].includes(node.style.textAlign) ? node.style.textAlign : undefined;
    return [{
      type: tag === 'p' ? 'paragraph' : 'heading',
      ...(tag === 'p' ? {} : { attrs: { level: Number(tag.slice(1)) } }),
      ...(textAlign ? { attrs: { ...(tag === 'p' ? {} : { level: Number(tag.slice(1)) }), textAlign } } : {}),
      content
    }];
  }
  if (tag === 'ul' || tag === 'ol') {
    const type = node.getAttribute('type') === 'a'
      ? 'lower-alpha'
      : node.getAttribute('type') === 'i'
        ? 'lower-roman'
        : 'decimal';
    const items = children.filter((child) => child.nodeType === Node.ELEMENT_NODE && child.tagName.toLowerCase() === 'li')
      .map((child) => ({ type: 'listItem', content: Array.from(child.childNodes).flatMap(blocksFromDom) }));
    return [tag === 'ul'
      ? { type: 'bulletList', content: items }
      : { type: 'orderedList', attrs: { type, start: Number(node.getAttribute('start')) || 1 }, content: items }];
  }
  if (tag === 'blockquote') return [{ type: 'blockquote', content: children.flatMap(blocksFromDom) }];
  if (tag === 'hr') return [{ type: 'horizontalRule' }];
  if (tag === 'img') return inlineFromDom(node);
  if (tag === 'div') {
    const textAlign = ['left', 'center', 'right', 'justify'].includes(node.style.textAlign) ? node.style.textAlign : undefined;
    const hasBlockChildren = children.some((child) => child.nodeType === Node.ELEMENT_NODE
      && ['p', 'h2', 'h3', 'ul', 'ol', 'blockquote', 'hr'].includes(child.tagName.toLowerCase()));
    const blocks = hasBlockChildren
      ? children.flatMap(blocksFromDom)
      : [{ type: 'paragraph', content: inlineFromDom(node) }];
    return textAlign
      ? blocks.map((block) => ['paragraph', 'heading'].includes(block.type)
        ? { ...block, attrs: { ...block.attrs, textAlign } }
        : block)
      : blocks;
  }
  return children.flatMap(blocksFromDom);
};

const documentFromEditor = (editor) => {
  const content = Array.from(editor.childNodes).flatMap(blocksFromDom);
  return { type: 'doc', content: content.length ? content : [{ type: 'paragraph', content: [] }] };
};

const collectDocuments = (root, source) => {
  const documents = structuredClone(source);
  root.querySelectorAll('[data-governance-chapter]').forEach((input) => {
    const chapter = documents[Number(input.dataset.governanceChapter)];
    if (chapter) chapter[input.dataset.field] = input.value;
  });
  root.querySelectorAll('[data-governance-article]').forEach((input) => {
    const [chapterIndex, articleIndex] = input.dataset.governanceArticle.split('.').map(Number);
    const article = documents[chapterIndex]?.pasalList[articleIndex];
    if (article) article[input.dataset.field] = input.value;
  });
  root.querySelectorAll('[data-governance-editor]').forEach((editor) => {
    const [chapterIndex, articleIndex] = editor.dataset.governanceEditor.split('.').map(Number);
    const article = documents[chapterIndex]?.pasalList[articleIndex];
    if (!article) return;
    article.contentDocument = documentFromEditor(editor);
    article.content = governanceDocumentText(article.contentDocument);
  });
  return documents;
};

export const bindGovernanceDocumentsWorkspace = (container, api, data, refresh) => {
  const root = container.querySelector('.governance-documents-workspace');
  if (!root) return;
  let selectedVersion = null;
  const feedback = (message) => {
    const target = container.querySelector('[data-governance-feedback]');
    if (target) target.textContent = message;
  };
  const renderLocalDraft = (documents) => {
    const next = { ...data, draft: { ...data.draft, documents } };
    container.innerHTML = renderGovernanceDocumentsWorkspace(next, selectedVersion);
    bindGovernanceDocumentsWorkspace(container, api, next, refresh);
  };

  root.querySelectorAll('[data-governance-command]').forEach((button) => {
    button.addEventListener('pointerdown', (event) => event.preventDefault());
    button.addEventListener('click', () => {
      const editor = button.closest('.governance-document-article')?.querySelector('[data-governance-editor]');
      if (!editor || typeof document.execCommand !== 'function') return;
      editor.focus();
      const command = button.dataset.governanceCommand;
      const value = command === 'formatBlock' ? button.dataset.commandValue : null;
      document.execCommand(command, false, value);
    });
  });

  root.querySelectorAll('[data-governance-image]').forEach((button) => {
    button.addEventListener('pointerdown', (event) => event.preventDefault());
    button.addEventListener('click', () => {
      const article = button.closest('.governance-document-article');
      const editor = article?.querySelector('[data-governance-editor]');
      const input = article?.querySelector('[data-governance-image-input]');
      const selection = window.getSelection();
      input._savedRange = selection?.rangeCount && editor?.contains(selection.anchorNode)
        ? selection.getRangeAt(0).cloneRange()
        : null;
      input.click();
    });
  });

  root.querySelectorAll('[data-governance-image-input]').forEach((input) => {
    input.addEventListener('change', async () => {
      const file = input.files?.[0];
      const editor = input.closest('.governance-document-article')?.querySelector('[data-governance-editor]');
      if (!file || !editor) return;
      const result = await api.uploadGovernanceDocumentImage(file);
      if (!result.ok) {
        feedback(result.error);
        input.value = '';
        return;
      }
      const image = document.createElement('img');
      image.src = result.data.asset.url;
      image.alt = file.name.replace(/\.[^.]+$/, '');
      image.loading = 'lazy';
      editor.focus();
      const selection = window.getSelection();
      const range = input._savedRange || document.createRange();
      if (!input._savedRange) {
        range.selectNodeContents(editor);
        range.collapse(false);
      }
      selection.removeAllRanges();
      selection.addRange(range);
      range.insertNode(image);
      range.setStartAfter(image);
      range.collapse(true);
      selection.removeAllRanges();
      selection.addRange(range);
      input.value = '';
    });
  });

  root.querySelector('[data-governance-create-form]')?.addEventListener('submit', async (event) => {
    event.preventDefault();
    const form = event.currentTarget;
    const result = await api.createGovernanceDocumentDraft(form.elements.title.value, form.elements.change_note.value);
    if (!result.ok) return feedback(result.error);
    await refresh();
  });

  root.querySelector('[data-governance-edit-form]')?.addEventListener('submit', async (event) => {
    event.preventDefault();
    const documents = collectDocuments(root, data.draft.documents);
    const result = await api.saveGovernanceDocumentDraft(
      data.draft.id, documents, data.draft.revisionId, event.currentTarget.elements.change_note.value
    );
    if (!result.ok) {
      feedback(result.error);
      if (result.status === 409) await refresh();
      return;
    }
    await refresh();
  });

  root.querySelector('[data-governance-ratify-form]')?.addEventListener('submit', async (event) => {
    event.preventDefault();
    if (!window.confirm('Naskah ini sudah disahkan forum MUBES dan siap menjadi versi resmi?')) return;
    const result = await api.ratifyGovernanceDocumentDraft(
      data.draft.id, data.draft.revisionId, event.currentTarget.elements.ratification_note.value
    );
    if (!result.ok) {
      feedback(result.error);
      if (result.status === 409) await refresh();
      return;
    }
    await refresh();
  });

  root.querySelector('[data-governance-withdraw]')?.addEventListener('click', async () => {
    if (!window.confirm('Tarik draf aktif dari tampilan anggota? Riwayat revisinya tetap tersimpan.')) return;
    const result = await api.withdrawGovernanceDocumentDraft(data.draft.id, data.draft.revisionId);
    if (!result.ok) {
      feedback(result.error);
      if (result.status === 409) await refresh();
      return;
    }
    await refresh();
  });

  root.addEventListener('click', async (event) => {
    const button = event.target.closest('button');
    if (!button) return;
    if (button.hasAttribute('data-governance-add-chapter')) {
      const documents = collectDocuments(root, data.draft ? data.draft.documents : []);
      documents.push({ bab: 'BAB BARU', title: 'Judul Bab Baru', pasalList: [{ pasal: 'Pasal Baru', heading: '', content: '', contentDocument: { type: 'doc', content: [{ type: 'paragraph', content: [] }] } }] });
      return renderLocalDraft(documents);
    }
    if (button.hasAttribute('data-governance-add-article')) {
      const documents = collectDocuments(root, data.draft.documents);
      const chapter = documents[Number(button.dataset.governanceAddArticle)];
      chapter?.pasalList.push({ pasal: 'Pasal Baru', heading: '', content: '', contentDocument: { type: 'doc', content: [{ type: 'paragraph', content: [] }] } });
      return renderLocalDraft(documents);
    }
    if (button.hasAttribute('data-governance-remove-article')) {
      const documents = collectDocuments(root, data.draft.documents);
      const [chapterIndex, articleIndex] = button.dataset.governanceRemoveArticle.split('.').map(Number);
      if (documents[chapterIndex].pasalList.length <= 1) return feedback('Setiap bab harus memiliki setidaknya satu pasal.');
      documents[chapterIndex].pasalList.splice(articleIndex, 1);
      return renderLocalDraft(documents);
    }
    if (button.hasAttribute('data-governance-remove-chapter')) {
      const documents = collectDocuments(root, data.draft.documents);
      if (documents.length <= 1) return feedback('Naskah harus memiliki setidaknya satu bab.');
      documents.splice(Number(button.dataset.governanceRemoveChapter), 1);
      return renderLocalDraft(documents);
    }
    if (button.hasAttribute('data-governance-close-version')) {
      selectedVersion = null;
      container.innerHTML = renderGovernanceDocumentsWorkspace(data);
      return bindGovernanceDocumentsWorkspace(container, api, data, refresh);
    }
    if (button.dataset.governanceVersion) {
      const result = await api.getGovernanceDocumentVersion(button.dataset.governanceVersion);
      if (!result.ok) return feedback(result.error);
      selectedVersion = result.data.revision;
      container.innerHTML = renderGovernanceDocumentsWorkspace(data, selectedVersion);
      bindGovernanceDocumentsWorkspace(container, api, data, refresh);
    }
  });
};
