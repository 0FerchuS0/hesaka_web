const STORAGE_KEY = 'hesaka-module-freshness'

function readState() {
    try {
        const raw = window.localStorage.getItem(STORAGE_KEY)
        if (!raw) return { latest: {}, seen: {}, dirty: {} }
        const parsed = JSON.parse(raw)
        return {
            latest: parsed?.latest && typeof parsed.latest === 'object' ? parsed.latest : {},
            seen: parsed?.seen && typeof parsed.seen === 'object' ? parsed.seen : {},
            dirty: parsed?.dirty && typeof parsed.dirty === 'object' ? parsed.dirty : {},
        }
    } catch {
        return { latest: {}, seen: {}, dirty: {} }
    }
}

function writeState(state) {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(state))
}

function normalizeVersion(value) {
    return typeof value === 'string' && value.trim() ? value.trim() : null
}

export function applyModuleFreshnessSnapshot(snapshot = {}) {
    const state = readState()
    const changedModules = []
    const mappings = {
        ventas: normalizeVersion(snapshot.ventas_version),
        presupuestos: normalizeVersion(snapshot.presupuestos_version),
    }

    for (const [moduleKey, version] of Object.entries(mappings)) {
        if (!version) continue
        if (state.latest[moduleKey] === version) continue
        state.latest[moduleKey] = version
        if (state.seen[moduleKey] !== version) {
            state.dirty[moduleKey] = true
            changedModules.push(moduleKey)
        }
    }

    writeState(state)
    return changedModules
}

export function shouldForceModuleRefresh(moduleKey) {
    const state = readState()
    return Boolean(state.dirty[moduleKey])
}

export function markModuleFreshnessSeen(moduleKey, version = null) {
    const state = readState()
    const resolvedVersion = normalizeVersion(version) || normalizeVersion(state.latest[moduleKey])
    if (!resolvedVersion) return
    state.seen[moduleKey] = resolvedVersion
    if (state.latest[moduleKey] === resolvedVersion) {
        state.dirty[moduleKey] = false
    }
    writeState(state)
}
