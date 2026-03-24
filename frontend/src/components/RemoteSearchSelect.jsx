import { useEffect, useMemo, useRef, useState } from 'react'

const defaultGetOptionLabel = option => option?.label ?? ''
const defaultGetOptionValue = option => option?.value

export default function RemoteSearchSelect({
    value,
    onChange,
    onSearch,
    options = [],
    loading = false,
    placeholder = 'Buscar...',
    emptyMessage = 'Sin resultados',
    promptMessage = 'Escriba para buscar',
    minChars = 1,
    getOptionLabel,
    getOptionValue,
    floating = true,
}) {
    const labelFor = getOptionLabel ?? defaultGetOptionLabel
    const valueFor = getOptionValue ?? defaultGetOptionValue
    const normalizedMinChars = Number.isFinite(Number(minChars)) ? Number(minChars) : 1
    const allowsEmptySearch = normalizedMinChars <= 0
    const containerRef = useRef(null)
    const [open, setOpen] = useState(false)
    const [query, setQuery] = useState(value ? labelFor(value) : '')
    const [menuPosition, setMenuPosition] = useState({ top: 0, left: 0, width: 0, maxHeight: 260 })

    const updateMenuPosition = () => {
        if (!containerRef.current) return
        const rect = containerRef.current.getBoundingClientRect()
        const viewportHeight = window.innerHeight
        const spaceBelow = viewportHeight - rect.bottom - 12
        const spaceAbove = rect.top - 12
        const shouldOpenUpward = spaceBelow < 220 && spaceAbove > spaceBelow
        const maxHeight = Math.max(140, Math.min(260, shouldOpenUpward ? spaceAbove : spaceBelow))
        const top = shouldOpenUpward
            ? Math.max(8, rect.top - maxHeight - 6)
            : rect.bottom + 6

        setMenuPosition({
            top,
            left: rect.left,
            width: rect.width,
            maxHeight,
        })
    }

    const openMenu = () => {
        updateMenuPosition()
        setOpen(true)
        window.requestAnimationFrame(updateMenuPosition)
    }

    useEffect(() => {
        setQuery(value ? labelFor(value) : '')
    }, [value])

    useEffect(() => {
        if (!open || !containerRef.current) {
            return
        }

        updateMenuPosition()
        window.addEventListener('resize', updateMenuPosition)
        window.addEventListener('scroll', updateMenuPosition, true)

        return () => {
            window.removeEventListener('resize', updateMenuPosition)
            window.removeEventListener('scroll', updateMenuPosition, true)
        }
    }, [open])

    useEffect(() => {
        if (!open) return

        const handleClickOutside = event => {
            if (containerRef.current && !containerRef.current.contains(event.target)) {
                setOpen(false)
                if (!value) {
                    setQuery('')
                }
            }
        }

        document.addEventListener('mousedown', handleClickOutside)
        return () => document.removeEventListener('mousedown', handleClickOutside)
    }, [open, value])

    useEffect(() => {
        if (!open) {
            return
        }
        if (!allowsEmptySearch && query.trim().length < normalizedMinChars) {
            return
        }
        onSearch(query)
    }, [allowsEmptySearch, normalizedMinChars, onSearch, open, query])

    useEffect(() => {
        if (!allowsEmptySearch && query.trim().length < normalizedMinChars) {
            onSearch('')
        }
    }, [allowsEmptySearch, normalizedMinChars, onSearch, query])

    const hasSearchTerm = allowsEmptySearch || query.trim().length >= normalizedMinChars

    const visibleMessage = useMemo(() => {
        if (!allowsEmptySearch && query.trim().length < normalizedMinChars) {
            return promptMessage
        }
        if (loading) {
            return 'Buscando...'
        }
        return emptyMessage
    }, [allowsEmptySearch, emptyMessage, loading, normalizedMinChars, promptMessage, query])

    return (
        <div ref={containerRef} style={{ position: 'relative', width: '100%', minWidth: 0 }}>
            <div
                className="form-input"
                style={{
                    display: 'flex',
                    alignItems: 'center',
                    gap: 8,
                    padding: '10px 12px',
                    width: '100%',
                    minWidth: 0,
                    boxSizing: 'border-box',
                }}
                onClick={openMenu}
            >
                <input
                    value={query}
                    placeholder={placeholder}
                    onFocus={openMenu}
                    onChange={event => {
                        setQuery(event.target.value)
                        if (!open) openMenu()
                        else window.requestAnimationFrame(updateMenuPosition)
                        if (!event.target.value && value) {
                            onChange(null)
                        }
                    }}
                    style={{
                        flex: 1,
                        background: 'transparent',
                        border: 0,
                        outline: 'none',
                        color: 'var(--text-primary)',
                        fontSize: '0.92rem',
                    }}
                />
                {value && (
                    <button
                        type="button"
                        onClick={event => {
                            event.stopPropagation()
                            onChange(null)
                            setQuery('')
                            setOpen(false)
                        }}
                        style={{
                            color: 'var(--text-muted)',
                            fontSize: '0.9rem',
                            lineHeight: 1,
                        }}
                        title="Limpiar"
                    >
                        ×
                    </button>
                )}
                <span style={{ color: 'var(--text-muted)', fontSize: '0.8rem' }}>v</span>
            </div>

            {open && (
                <div
                    style={{
                        position: floating ? 'fixed' : 'absolute',
                        top: floating ? menuPosition.top : 'calc(100% + 6px)',
                        left: floating ? menuPosition.left : 0,
                        width: floating ? menuPosition.width : '100%',
                        zIndex: 99999,
                        background: 'var(--bg-card)',
                        border: '1px solid var(--border)',
                        borderRadius: 10,
                        boxShadow: '0 16px 40px rgba(0, 0, 0, 0.35)',
                        boxSizing: 'border-box',
                        maxHeight: menuPosition.maxHeight,
                        overflowY: 'auto',
                    }}
                >
                    {!hasSearchTerm || options.length === 0 ? (
                        <div style={{ padding: '12px 14px', color: 'var(--text-muted)', fontSize: '0.84rem' }}>
                            {visibleMessage}
                        </div>
                    ) : (
                        options.map(option => (
                            <button
                                key={valueFor(option)}
                                type="button"
                                onClick={() => {
                                    onChange(option)
                                    setQuery(labelFor(option))
                                    setOpen(false)
                                }}
                                style={{
                                    width: '100%',
                                    textAlign: 'left',
                                    padding: '12px 14px',
                                    color: 'var(--text-primary)',
                                    borderBottom: '1px solid rgba(255,255,255,0.05)',
                                    background: 'transparent',
                                }}
                            >
                                {labelFor(option)}
                            </button>
                        ))
                    )}
                </div>
            )}
        </div>
    )
}
