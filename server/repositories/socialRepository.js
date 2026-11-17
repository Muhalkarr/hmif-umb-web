import { createRepository } from './createRepository.js';

export const createSocialRepository = (database) => createRepository(database, 'social', [
    'createSocialComment', 'createSocialPost', 'createSocialReport', 'deleteSocialComment',
    'deleteSocialPost', 'getSocialPost', 'getSocialPostForAction', 'listOpenSocialReports',
    'listSocialComments', 'listSocialPosts', 'resolveSocialReport', 'toggleSocialReaction', 'updateSocialPost'
]);