import { createRepository } from './createRepository.js';

export const createSiteRepository = (database) => createRepository(database, 'site', [
  'accountExists', 'addAsset', 'addSoundtrack', 'assetExists', 'deleteAsset', 'deleteSoundtrack', 'getAsset',
  'getSecurityNotice', 'getSiteRevision', 'getSiteState', 'getSoundtrack', 'isAssetReferencedByRevision',
  'isAssetReferencedByUser', 'listAssets', 'listSiteRevisions', 'listSoundtracks', 'publishSite',
  'reorderSoundtracks', 'saveSiteDraft', 'setSecurityNotice', 'updateSoundtrack'
]);
