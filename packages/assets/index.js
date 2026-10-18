// URLs of the asset library, resolved against this file: works when the package is served as it is
// (jsDelivr, unpkg, a copy of the folder on your own server). Bundlers that copy files need the folder
// served separately; then pass that URL as `baseUrl` instead.

/** Base URL of the library (ends with `/`): `<pack>/<file>` lies below it. */
export const baseUrl = new URL('./', import.meta.url).href;

/** URL of `catalog.json` (all images, sounds, groups and game types in one file). */
export const catalogUrl = new URL('./catalog.json', import.meta.url).href;

/** URL of `gametypes.json` (the library sorted by kind of game). */
export const gametypesUrl = new URL('./gametypes.json', import.meta.url).href;

/**
 * The `assets` option for `createPgzero` and `createKara` from `@natterjs/web`.
 * @param {string[]} [packs] limit the catalog to these packs
 * @returns {{ baseUrl: string, catalog: string, packs?: string[] }}
 */
export function assetsOption(packs) {
  return packs ? { baseUrl, catalog: 'catalog.json', packs } : { baseUrl, catalog: 'catalog.json' };
}
