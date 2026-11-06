export const createAuditService = (db) => ({
  record(req, action, targetType, targetId, details = {}) {
    const auditEntry = {
      actorNim: req.user?.nim || 'SYSTEM',
      actorRole: req.user?.role || 'system',
      action,
      targetType,
      targetId,
      details: typeof details === 'object' ? details : { message: String(details) }
    };

    // Jika ada beforeState atau afterState, simpan ke details atau properti khusus
    if (details.beforeState !== undefined) {
      auditEntry.beforeState = JSON.stringify(details.beforeState);
    }
    if (details.afterState !== undefined) {
      auditEntry.afterState = JSON.stringify(details.afterState);
    }

    db.insertAudit(auditEntry);
  }
});
