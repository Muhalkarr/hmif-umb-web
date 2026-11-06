const daysUntilDate = (dateString) => {
  const [year, month, day] = String(dateString).split('-').map(Number);
  const target = Date.UTC(year, month - 1, day);
  const today = new Date();
  const startOfToday = Date.UTC(today.getUTCFullYear(), today.getUTCMonth(), today.getUTCDate());
  return Math.round((target - startOfToday) / 86400000);
};

export const createNotificationService = (db) => ({
  create(recipientAccountId, category, notification) {
    if (!recipientAccountId || !db.getNotificationPreferences(recipientAccountId)[category]) return null;
    return db.createNotification({ recipientAccountId, category, ...notification });
  },
  daysUntilDate
});
