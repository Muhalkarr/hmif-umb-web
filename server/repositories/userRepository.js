import { createRepository } from './createRepository.js';

export const createUserRepository = (database) => createRepository(database, 'users', [
  'addAsset', 'assetExists', 'changePassword', 'createUser', 'deleteAsset', 'deleteUser',
  'findUserById', 'findUserByNIM', 'findUserByEmail', 'findUserBySsoId', 'getAdminCount',
  'getAllCadets', 'getAllCalendarEvents', 'getAuditLogs', 'getNotificationPreferences',
  'getNotificationUnreadCount', 'getPushSubscriptions', 'invalidateSessions', 'listNotifications',
  'listUpcomingAssignedTasks', 'listUpcomingTutoringSessions', 'markAllNotificationsRead',
  'markNotificationRead', 'resetUserPasswordAdmin', 'savePushSubscription', 'deletePushSubscription',
  'setAcademicCuratorPermission', 'updateCadetStage', 'updateNotificationPreferences',
  'updateUserAdmin', 'updateUserProfile', 'updateUserRole', 'updateUserSsoInfo'
]);
