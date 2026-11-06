import { createRepository } from './createRepository.js';

export const createAcademicRepository = (database) => createRepository(database, 'academic', [
  'addKnowledgeFile', 'createKnowledgeDiscussion', 'createTutoringRequest', 'deleteKnowledgeFile',
  'findUserById', 'getAcademicRecord', 'getActiveTutorProfiles', 'getKnowledgeDiscussions',
  'getKnowledgeFile', 'getMyTutoringRequests', 'getPublicAcademicRecords', 'getSiteState',
  'getTutoringRequest', 'getTutorMatches', 'getTutorProfile', 'isKnowledgeFileReferenced',
  'listAcademicRecords', 'listKnowledgeFiles', 'listPendingKnowledgeDiscussions',
  'listTutoringRequests', 'moderateKnowledgeDiscussion', 'reviewAcademicRecord', 'saveAcademicDraft',
  'saveTutorProfile', 'scheduleTutoringRequest', 'selectKnowledgeSolution', 'setTutoringRequestStatus',
  'submitAcademicRecord', 'tutorAvailableAt', 'tutorHasScheduleConflict'
]);
