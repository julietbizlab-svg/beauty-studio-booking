/**
 * Serve every supported v2-test entry in one request. The matching shell
 * normalizes legacy and slash variants with history.replaceState, avoiding
 * an extra HTTP redirect and keeping the visible URL canonical.
 */
export default {
  async fetch(request, env) {
    const url = new URL(request.url);
    const indexEntry = url.pathname === "/index.html";
    const customerEntry = /^\/standard\/customer\/?$/.test(url.pathname);
    const flagshipCustomerEntry = /^\/flagship\/(?:customer|showcase\/customer)\/?$/.test(url.pathname);
    const legacyOwnerEntry = /^\/(?:standard|flagship)\/owner\/?$/.test(url.pathname);
    const ownerEntry = /^\/(?:owner|owner\/hub)\/?$/.test(url.pathname);
    const platformEntry = /^\/(?:platform|owner\/hub\/platform)\/?$/.test(url.pathname);
    const flagshipShowcaseEntry = /^\/flagship\/(?:showcase|owner-demo)\/?$/.test(url.pathname);
    const studioCustomerEntry = /^\/studio\/[a-f0-9]{64}\/?$/i.test(url.pathname);

    if (indexEntry || customerEntry || flagshipCustomerEntry || legacyOwnerEntry || ownerEntry ||
        platformEntry || flagshipShowcaseEntry || studioCustomerEntry) {
      const assetPath = (indexEntry || flagshipCustomerEntry || studioCustomerEntry) ? "/" :
        (flagshipShowcaseEntry ? "/showcase/" :
        (platformEntry ? "/platform/" :
          ((legacyOwnerEntry || ownerEntry) ? "/owner/" : "/")));
      const assetUrl = new URL(assetPath, url);
      const assetRequest = new Request(assetUrl, request);
      return env.ASSETS.fetch(assetRequest);
    }

    return env.ASSETS.fetch(request);
  }
};
