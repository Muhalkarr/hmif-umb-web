/** Personalized enrollment and milestone progress for published learning paths. */
export function registerLearningRoutes(app, { db, requireAuth }) {
  app.get('/api/learning/enrollments/mine', requireAuth, (req, res) => {
    res.json({ enrollments: db.listMyLearningEnrollments(req.user.account_id) });
  });

  app.post('/api/learning/paths/:id/enroll', requireAuth, (req, res) => {
    const path = db.getPublicAcademicRecords('learning_path').find(({ id }) => id === req.params.id);
    if (!path) return res.status(404).json({ error: 'Jalur belajar terbit tidak ditemukan.' });
    res.status(201).json({
      enrollment: db.enrollInLearningPath(req.user.account_id, path.id)
    });
  });

  app.put('/api/learning/paths/:id/milestones/:milestoneId/complete', requireAuth, (req, res) => {
    const path = db.getPublicAcademicRecords('learning_path').find(({ id }) => id === req.params.id);
    if (!path) return res.status(404).json({ error: 'Jalur belajar terbit tidak ditemukan.' });
    const enrollment = db.listMyLearningEnrollments(req.user.account_id)
      .find(({ learning_path_id }) => learning_path_id === path.id);
    if (!enrollment) return res.status(409).json({ error: 'Ikuti jalur belajar sebelum mencatat progres.' });
    const milestone = path.milestones.find(({ id }) => id === req.params.milestoneId);
    if (!milestone) return res.status(404).json({ error: 'Tahap belajar tidak ditemukan.' });
    if ((milestone.prerequisite_ids || []).some((id) => !enrollment.completed_milestones.includes(id))) {
      return res.status(409).json({ error: 'Selesaikan tahap prasyarat terlebih dahulu.' });
    }
    const completedMilestones = [...new Set([...enrollment.completed_milestones, milestone.id])];
    const updated = db.completeLearningMilestone(req.user.account_id, path.id, completedMilestones);
    if (!updated) return res.status(409).json({ error: 'Progres tidak dapat disimpan. Muat ulang kursus dan coba lagi.' });
    res.json({
      enrollment: updated
    });
  });
}
