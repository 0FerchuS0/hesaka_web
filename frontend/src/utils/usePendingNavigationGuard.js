import { useCallback, useEffect, useRef } from 'react'
import { clearNavigationBlocker, setNavigationBlocker } from './navigationControl'

export default function usePendingNavigationGuard(isPending, message = 'La accion aun se esta realizando. ¿Seguro que desea salir de esta vista?') {
    const blockerIdRef = useRef(`pending-navigation-${Math.random().toString(36).slice(2)}`)

    const confirmNavigation = useCallback(() => {
        if (!isPending) return true
        return window.confirm(message)
    }, [isPending, message])

    useEffect(() => {
        if (isPending) {
            setNavigationBlocker(blockerIdRef.current, message)
        } else {
            clearNavigationBlocker(blockerIdRef.current)
        }

        return () => {
            clearNavigationBlocker(blockerIdRef.current)
        }
    }, [isPending, message])

    return confirmNavigation
}
