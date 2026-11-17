const escapeHtml = (value) => String(value ?? '').replace(/[&<>"']/g, (character) => ({
  '&': '&amp;',
  '<': '&lt;',
  '>': '&gt;',
  '"': '&quot;',
  "'": '&#39;'
}[character]));

const resourceUrl = (resource) => resource.file_id
  ? `/api/knowledge/files/${encodeURIComponent(resource.file_id)}`
  : resource.url;

const renderCourseCard = (path, enrollment, mode) => {
  const completed = enrollment?.completed_milestones || [];
  const progress = path.milestones.length ? Math.round((completed.length / path.milestones.length) * 100) : 0;
  return `
    <article class="workspace-course-card">
      <span class="workspace-feature-kicker">${escapeHtml(path.track || 'JALUR AKADEMIK')}</span>
      <h3>${escapeHtml(path.title)}</h3>
      <p>${escapeHtml(path.summary || 'Jalur belajar terstruktur dari materi akademik HMIF.')}</p>
      <div class="workspace-course-meta">
        <span>${path.milestones.length} tahap</span>
        <span>${Number(path.estimated_hours) || 0} jam</span>
        <span>${progress}% selesai</span>
      </div>
      <div class="workspace-course-progress" role="progressbar" aria-label="Progres ${escapeHtml(path.title)}"
        aria-valuemin="0" aria-valuemax="100" aria-valuenow="${progress}">
        <span style="width:${progress}%"></span>
      </div>
      <button type="button" class="btn-tactical" data-learning-open="${escapeHtml(path.id)}">
        ${mode === 'grid' ? 'BUKA KURSUS' : 'LIHAT KURSUS'} <span aria-hidden="true">→</span>
      </button>
    </article>
  `;
};

const renderCourseDetails = (path, resources, enrollment, error) => {
  const resourceById = new Map(resources.map((resource) => [resource.id, resource]));
  const completed = new Set(enrollment?.completed_milestones || []);
  const milestones = path.milestones || [];
  return `
    <section class="workspace-feature-panel" data-learning-path-id="${escapeHtml(path.id)}">
      <button type="button" class="workspace-text-action" data-learning-back>← SEMUA KURSUS</button>
      <span class="workspace-feature-kicker">${escapeHtml(path.track || 'JALUR AKADEMIK')}</span>
      <h2>${escapeHtml(path.title)}</h2>
      <p>${escapeHtml(path.summary || 'Jalur belajar terstruktur dari materi akademik HMIF.')}</p>
      ${error ? `<p class="workspace-feature-error" role="alert">${escapeHtml(error)}</p>` : ''}
      ${enrollment ? '' : '<button type="button" class="btn-tactical primary" data-learning-enroll>IKUTI KURSUS</button>'}
      <p class="workspace-feature-feedback" data-learning-feedback role="status" aria-live="polite"></p>
      <ol class="workspace-course-milestones">
        ${milestones.map((milestone) => {
          const done = completed.has(milestone.id);
          const prerequisitesMet = (milestone.prerequisite_ids || []).every((id) => completed.has(id));
          const linkedResources = (milestone.resource_ids || []).map((id) => resourceById.get(id)).filter(Boolean);
          return `
            <li class="${done ? 'is-complete' : ''}">
              <div class="workspace-course-step-heading">
                <span>TAHAP ${String(milestone.order).padStart(2, '0')}</span>
                <strong>${escapeHtml(milestone.title)}</strong>
                <span>${done ? 'SELESAI' : 'BELUM SELESAI'}</span>
              </div>
              <p>${escapeHtml(milestone.description || 'Pelajari materi yang terhubung untuk menyelesaikan tahap ini.')}</p>
              <ul>${linkedResources.map((resource) => `
                <li><a href="${escapeHtml(resourceUrl(resource))}" target="_blank" rel="noopener noreferrer">
                  ${escapeHtml(resource.title)} <span aria-hidden="true">↗</span>
                </a></li>`).join('')}</ul>
              ${enrollment && !done ? `<button type="button" class="btn-tactical" data-learning-complete="${escapeHtml(milestone.id)}"
                ${prerequisitesMet ? '' : 'disabled title="Selesaikan tahap prasyarat terlebih dahulu."'}>TANDAI SELESAI</button>` : ''}
            </li>
          `;
        }).join('')}
      </ol>
    </section>
  `;
};

export const renderLearningWorkspace = ({ viewId, paths, resources, enrollments, selectedPathId, error = '' }) => {
  const enrollmentByPath = new Map(enrollments.map((entry) => [entry.learning_path_id, entry]));
  const selectedPath = paths.find(({ id }) => id === selectedPathId);
  const view = viewId === 'learning-course-details' ? 'details'
    : viewId === 'learning-course-grid' ? 'grid'
      : viewId === 'learning-student-overview' ? 'student'
        : viewId === 'dashboard-lms' ? 'dashboard' : 'list';
  const enrolledCount = enrollments.length;
  const completedCount = enrollments.filter((entry) => {
    const path = paths.find(({ id }) => id === entry.learning_path_id);
    return path && path.milestones.length > 0 && entry.completed_milestones.length === path.milestones.length;
  }).length;

  if (view === 'details' && selectedPath) {
    return renderCourseDetails(selectedPath, resources, enrollmentByPath.get(selectedPath.id), error);
  }

  const listedPaths = view === 'student'
    ? paths.filter(({ id }) => enrollmentByPath.has(id))
    : paths;
  const heading = view === 'student' ? 'Perjalanan belajar saya'
    : view === 'grid' ? 'Katalog kursus'
      : view === 'dashboard' ? 'Ruang belajar' : 'Jalur pembelajaran';

  return `
    <section class="workspace-feature-hero workspace-learning-hero">
      <span class="section-tag cyan">HMIF // AKADEMIK DIGITAL</span>
      <h2>${heading}</h2>
      <p>Ikuti tahapan belajar, buka materi rujukan, lalu catat progres Anda pada setiap jalur.</p>
      <div class="workspace-feature-stats">
        <div><span>JALUR TERBIT</span><strong>${paths.length}</strong></div>
        <div><span>SEDANG DIIKUTI</span><strong>${enrolledCount}</strong></div>
        <div><span>TUNTAS</span><strong>${completedCount}</strong></div>
      </div>
      <div class="workspace-learning-switches">
        <button type="button" class="btn-tactical" data-workspace-view="learning-course-list">DAFTAR</button>
        <button type="button" class="btn-tactical" data-workspace-view="learning-course-grid">KATALOG GRID</button>
        <button type="button" class="btn-tactical" data-workspace-view="learning-student-overview">PROGRES SAYA</button>
      </div>
    </section>
    ${error ? `<p class="workspace-feature-error" role="alert">${escapeHtml(error)}</p>` : ''}
    ${view === 'details' && !selectedPath ? `
      <section class="workspace-feature-panel"><h3>Pilih jalur pembelajaran</h3>
        <div class="workspace-course-grid">${paths.map((path) => renderCourseCard(path, enrollmentByPath.get(path.id), view)).join('')}</div>
      </section>
    ` : `
      <section class="workspace-feature-panel">
        <div class="workspace-panel-heading"><div><span class="section-tag gold">KATALOG // ${listedPaths.length}</span><h2>${heading}</h2></div></div>
        ${listedPaths.length
    ? `<div class="workspace-course-grid ${view === 'list' || view === 'student' ? 'is-list' : ''}">${listedPaths.map((path) => renderCourseCard(path, enrollmentByPath.get(path.id), view)).join('')}</div>`
    : `<p class="workspace-feature-empty">${view === 'student' ? 'Anda belum mengikuti jalur pembelajaran.' : 'Belum ada kursus yang diterbitkan.'}</p>`}
      </section>
    `}
  `;
};

export const bindLearningWorkspace = (content, api, refresh) => {
  content.querySelectorAll('[data-learning-open]').forEach((button) => {
    button.addEventListener('click', () => {
      const path = button.dataset.learningOpen;
      refresh('learning-course-details', path);
    });
  });
  content.querySelector('[data-learning-back]')?.addEventListener('click', () => refresh('learning-course-list', ''));
  content.querySelector('[data-learning-enroll]')?.addEventListener('click', async (event) => {
    const button = event.currentTarget;
    button.disabled = true;
    const result = await api.enrollInLearningPath(button.closest('[data-learning-path-id]').dataset.learningPathId);
    if (!result.ok) {
      button.disabled = false;
      content.querySelector('[data-learning-feedback]')?.replaceChildren(document.createTextNode(result.error));
      return;
    }
    refresh('learning-course-details');
  });
  content.querySelectorAll('[data-learning-complete]').forEach((button) => {
    button.addEventListener('click', async () => {
      button.disabled = true;
      const result = await api.completeLearningMilestone(button.dataset.learningComplete,
        button.closest('[data-learning-path-id]')?.dataset.learningPathId);
      if (!result.ok) {
        button.disabled = false;
        const feedback = content.querySelector('[data-learning-feedback]');
        if (feedback) feedback.textContent = result.error;
        return;
      }
      refresh('learning-course-details');
    });
  });
};
