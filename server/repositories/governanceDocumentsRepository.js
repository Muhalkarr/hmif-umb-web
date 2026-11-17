import { createRepository } from './createRepository.js';

export const createGovernanceDocumentsRepository = (database) => createRepository(database, 'governance documents', [
  'createGovernanceDocumentDraft',
  'getGovernanceDocumentRevision',
  'getGovernanceDocumentState',
  'listGovernanceDocumentRevisions',
  'ratifyGovernanceDocumentDraft',
  'saveGovernanceDocumentDraft',
  'withdrawGovernanceDocumentDraft'
]);
