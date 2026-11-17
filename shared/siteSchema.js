// Shared public contract for the Site Studio configuration.
// The implementation remains server-owned while the frontend is migrated.
export {
  PAGE_BLOCKS,
  BUILTIN_SITE_IMAGES,
  DEFAULT_LIGHT_THEME_COLORS,
  DEFAULT_SITE_CONFIG,
  DUST_PERCENT_MAX,
  configReferencesAsset,
  resolveBackgroundImage,
  validateSiteConfig,
  withSiteDefaults
} from '../server/siteSchema.js';
