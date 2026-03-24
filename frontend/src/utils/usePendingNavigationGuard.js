import { useCallback, useEffect } from 'react'

export default function usePendingNavigationGuard(isPending, message = 'La accion aun se esta realizando. ¿Seguro que desea salir de esta vista?') {
    const confirmNavigation = useCallback(() => {
        if (!isPending) return true
        return window.confirm(message)
    }, [isPending, message])

    useEffect(() => {
        if (!isPending) return

        const handleBeforeUnload = (event) => {
            event.preventDefault()
            event.returnValue = ''
        }

        const handleDocumentClick = (event) => {
            const anchor = event.target?.closest?.('a[href]')
            if (!anchor) return
            if (anchor.target === '_blank') return
            if (event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return

            const href = anchor.getAttribute('href')
            if (!href || href.startsWith('#') || href.startsWith('javascript:')) return

            if (!confirmNavigation()) {
                event.preventDefault()
                event.stopPropagation()
                if (typeof event.stopImmediatePropagation === 'function') event.stopImmediatePropagation()
            }
        }

        const handlePopState = () => {
            if (!confirmNavigation()) {
                window.history.pushState({ pendingGuard: true }, '', window.location.href)
            }
        }

        window.history.pushState({ pendingGuard: true }, '', window.location.href)
        window.addEventListener('beforeunload', handleBeforeUnload)
        document.addEventListener('click', handleDocumentClick, true)
        window.addEventListener('popstate', handlePopState)

        return () => {
            window.removeEventListener('beforeunload', handleBeforeUnload)
            document.removeEventListener('click', handleDocumentClick, true)
            window.removeEventListener('popstate', handlePopState)
        }
    }, [confirmNavigation, isPending])

    return confirmNavigation
}
