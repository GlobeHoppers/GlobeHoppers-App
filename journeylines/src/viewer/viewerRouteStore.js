/**
 * WP4: playback-only route data boundary.
 *
 * The interactive editor owns the full canonical routeDetails.json; the
 * viewer consumes an immutable, slim, content-hashed projection. The older
 * source can still be requested dynamically on the WP2/WP3 comparison path.
 *
 * No module-level import of the 10MB source file is permitted here.
 */
import { isV9FeatureEnabled } from '../utils/v9ReleaseFlags.js';

const VIEWER_FOLDER = 'data/v9-viewer/';
const DEFAULT_BASE = typeof window === 'undefined' ? 'http://localhost/' : window.location.href;

export function isV9ViewerRequested(search = typeof window === 'undefined' ? '' : window.location.search) {
  return isV9FeatureEnabled(search, 'v9Viewer');
}

export class ViewerRouteStore {
  constructor({ fetchImpl = globalThis.fetch?.bind(globalThis), subtle = globalThis.crypto?.subtle,
    importFull = () => import('../data/routeDetails.json'),
    baseUrl = DEFAULT_BASE, assetBase = import.meta.env?.BASE_URL || './' } = {}) {
    this.fetchImpl = fetchImpl;
    this.subtle = subtle;
    this.importFull = importFull;
    this.fullPromise = null;
    this.viewerPromise = null;
    this.folderUrl = new URL(VIEWER_FOLDER, new URL(assetBase, baseUrl)).href;
    this.status = { mode: 'unloaded', source: null, routeCount: 0, assetBytes: 0, fallback: false };
  }

  async full() {
    if (!this.fullPromise) {
      this.fullPromise = Promise.resolve().then(() => this.importFull())
        .then(module => module?.default || module)
        .then(payload => {
          if (!payload?.routes || typeof payload.routes !== 'object') throw new Error('Invalid canonical route data');
          this.status = { mode: 'full', source: 'editor-canonical', routeCount: Object.keys(payload.routes).length,
            assetBytes: 0, fallback: false };
          return payload;
        })
        .catch(error => {
          this.fullPromise = null; // recover on next user action
          throw error;
        });
    }
    return this.fullPromise;
  }

  async viewer() {
    if (!this.viewerPromise) {
      this.viewerPromise = this.fetchVerified().catch(async error => {
        if (typeof console !== 'undefined') console.warn('[GlobeHoppers v9] Viewer asset unavailable, restoring canonical routes:', error?.message || error);
        // Preserve every original route even when offline or the preview
        // artifact was partially deployed. Do not render blank surface legs.
        const canonical = await this.full();
        this.status = { ...this.status, mode: 'full-fallback', fallback: true, error: String(error?.message || error) };
        return canonical;
      });
    }
    return this.viewerPromise;
  }

  async fetchText(name) {
    if (typeof this.fetchImpl !== 'function') throw new Error('No fetch available');
    const response = await this.fetchImpl(new URL(name, this.folderUrl).href, { cache: 'force-cache' });
    if (!response?.ok) throw new Error(`Viewer route request failed HTTP ${response?.status || 'offline'}`);
    return response.text();
  }

  async fetchVerified() {
    const manifest = JSON.parse(await this.fetchText('manifest.json'));
    if (manifest?.schema !== 'globehoppers.viewer-routes.v1' ||
        manifest.asset !== 'route-details.json' ||
        !Number.isInteger(manifest.routeCount) ||
        !Number.isInteger(manifest.legCount) ||
        !Number.isInteger(manifest.bytes) ||
        !/^[a-f0-9]{64}$/.test(manifest.sha256 || '')) {
      throw new Error('Invalid viewer routes manifest');
    }
    if (manifest.routeCount !== 401 || manifest.legCount !== 401) throw new Error('Unexpected viewer trip/leg inventory');
    const content = await this.fetchText(manifest.asset);
    const bytes = new TextEncoder().encode(content);
    if (bytes.byteLength !== manifest.bytes) throw new Error('Viewer routes byte count mismatch');
    if (!this.subtle?.digest) throw new Error('SHA-256 verification unavailable');
    const digest = new Uint8Array(await this.subtle.digest('SHA-256', bytes));
    const actual = Array.from(digest, byte => byte.toString(16).padStart(2, '0')).join('');
    if (actual !== manifest.sha256) throw new Error('Viewer routes SHA-256 mismatch');
    const payload = JSON.parse(content);
    if (!payload?.routes || Object.keys(payload.routes).length !== manifest.routeCount ||
        payload.cacheVersion == null) throw new Error('Viewer route payload schema mismatch');
    this.status = { mode: 'viewer', source: 'compiled-v9-viewer', routeCount: manifest.routeCount,
      assetBytes: manifest.bytes, fallback: false };
    return payload;
  }

  load(viewerMode = false) {
    return viewerMode ? this.viewer() : this.full();
  }

  snapshot() {
    return { ...this.status };
  }
}

export const viewerRouteStore = new ViewerRouteStore();
