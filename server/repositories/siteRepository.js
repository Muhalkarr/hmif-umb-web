import { createRepository } from './createRepository.js';

export const createSiteRepository = (database) => createRepository(database, 'site', [
  'addAsset', 'addSoundtrack', 'assetExists', 'deleteAsset', 'deleteSoundtrack', 'getAsset',
  'getSiteRevision', 'getSiteState', 'getSoundtrack', 'isAssetReferencedByRevision',
  'isAssetReferencedByUser', 'listAssets', 'listSiteRevisions', 'listSoundtracks', 'publishSite',
  'reorderSoundtracks', 'saveSiteDraft', 'updateSoundtrack'
]);
