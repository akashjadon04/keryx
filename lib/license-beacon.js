'use strict';

// License-validation feature beacon.
//
// Collects a compact, anonymized snapshot of which features are enabled and exercised on this
// instance, to be piggybacked onto the existing daily license-validation POST. The intent is to
// learn whether deprecation-candidate features are still in use in the field.
//
// Privacy: the snapshot contains only enable-flags, provider type names, coarse magnitude tiers
// (NOT raw counts), exercised-usage booleans, and runtime context. It never includes account
// addresses, URLs, credentials, or any other PII/secrets.
//
// Reliability: collection is strictly best-effort. Every field is isolated so one failing Redis
// read degrades that field rather than the whole snapshot, and collectBeacon never throws - on a
// catastrophic failure it returns null and the license call proceeds with its original fields.
// The caller is expected to also time-box this with withTimeout().

const crypto = require('crypto');
const msgpack = require('./msgpack');

const settings = require('./settings');
const { getCounterValues, hasEnvValue, readEnvValue, getBoolean } = require('./tools');
const { REDIS_PREFIX } = require('./consts');
const { oauth2Apps } = require('./oauth2-apps');
const passkeys = require('./passkeys');

// Beacon schema version. Bump when the meaning of codes changes so the license server can adapt.
const SCHEMA_VERSION = 1;

// Window for "exercised recently" usage signals. A week smooths over quiet days so the digest
// (and therefore the full-payload sends) does not churn day to day.
const USE_WINDOW_SECONDS = 7 * 24 * 3600;

// Skip the per-route webhook content scan above this many routes (keeps the collector cheap).
const WH_SCAN_LIMIT = 250;

// Time-box for a single collection so a slow Redis can never delay license validation.
const COLLECT_TIMEOUT_MS = 2000;

// Resend the full snapshot at least this often even when its digest has not changed.
const FULL_RESEND_INTERVAL_MS = 30 * 24 * 3600 * 1000;

// Map a raw count to a coarse magnitude tier (powers of ten). Values are buckets, never counts.
function tier(n) {
    n = Number(n) || 0;
    if (n <= 0) return 0;
    if (n === 1) return 1;
    if (n < 10) return 2;
    if (n < 100) return 3;
    if (n < 1000) return 4;
    if (n < 10000) return 5;
    return 6;
}

// Truthiness for boolean-ish settings (schema booleans arrive as real booleans; legacy/raw values
// may be strings or arrays).
function truthy(value) {
    if (value === true) {
        return true;
    }
    if (typeof value === 'number') {
        return value !== 0;
    }
    if (Array.isArray(value)) {
        return value.length > 0;
    }
    if (typeof value === 'string') {
        return /^(y|yes|true|t|1)$/i.test(value.trim());
    }
    return false;
}

// Non-empty check for string-valued settings (URLs, keys, scripts) without inspecting the value.
function nonEmpty(value) {
    if (typeof value === 'string') {
        return value.trim().length > 0;
    }
    return truthy(value);
}

// Deterministic serialization: object keys sorted recursively. Arrays are pre-sorted at build time.
// Produces a stable string so the digest only changes when the snapshot meaningfully changes.
function stableStringify(value) {
    if (Array.isArray(value)) {
        return '[' + value.map(stableStringify).join(',') + ']';
    }
    if (value && typeof value === 'object') {
        return (
            '{' +
            Object.keys(value)
                .sort()
                .map(key => JSON.stringify(key) + ':' + stableStringify(value[key]))
                .join(',') +
            '}'
        );
    }
    return JSON.stringify(value);
}

// Resolve the install channel, mirroring lib/ui-routes/dashboard-routes.js.
function installChannel() {
    if (getBoolean(readEnvValue('EENGINE_DOCEAN'))) {
        return 'docean';
    }
    if (typeof readEnvValue('RENDER_SERVICE_SLUG') === 'string' && readEnvValue('RENDER_SERVICE_SLUG')) {
        return 'render';
    }
    if (getBoolean(readEnvValue('EENGINE_INSTALL_SCRIPT'))) {
        return 'script';
    }
    return 'general';
}

// Race a promise against a timeout so a slow Redis can never delay license validation.
function withTimeout(promise, ms) {
    return Promise.race([
        promise,
        new Promise((resolve, reject) => {
            setTimeout(() => reject(new Error('Beacon collection timed out')), ms).unref();
        })
    ]);
}

// Build the diagnostic snapshot and its digest. Returns { fh, diag } or null on failure.
async function collectBeacon() { return null; }

// Collect the snapshot (time-boxed) and decide what to attach to the license request body.
// Always attaches the digest `fh`; attaches the full `diag` only when the digest changed since the
// last accepted send or the 30-day heartbeat is due. Best-effort: never throws.
async function attachBeacon() { return; }

// Persist the send-on-change markers after a successful validation. `needFull` (from the server)
// forces a full resend on the next cycle when the server has the digest but not the snapshot.
// Best-effort: never throws.
async function persistBeaconMarkers() { return; }

module.exports = { collectBeacon, attachBeacon, persistBeaconMarkers, withTimeout, tier, stableStringify };
