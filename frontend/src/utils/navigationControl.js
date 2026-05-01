const blockers = new Map()
const listeners = new Set()

let suppressBeforeUnloadOnce = false

function emit() {
    listeners.forEach(listener => {
        try {
            listener()
        } catch (error) {
            console.error('navigationControl listener error:', error)
        }
    })
}

export function subscribeNavigationControl(listener) {
    listeners.add(listener)
    return () => listeners.delete(listener)
}

export function setNavigationBlocker(id, message) {
    if (!id) return
    blockers.set(id, message)
    emit()
}

export function clearNavigationBlocker(id) {
    if (!id) return
    if (!blockers.has(id)) return
    blockers.delete(id)
    emit()
}

export function getNavigationControlState() {
    const messages = Array.from(blockers.values()).filter(Boolean)
    return {
        hasBlockers: messages.length > 0,
        message: messages.at(-1) || '',
        count: messages.length,
    }
}

export function suppressNextBeforeUnload() {
    suppressBeforeUnloadOnce = true
    window.setTimeout(() => {
        suppressBeforeUnloadOnce = false
    }, 1500)
}

export function consumeBeforeUnloadSuppression() {
    const current = suppressBeforeUnloadOnce
    suppressBeforeUnloadOnce = false
    return current
}
