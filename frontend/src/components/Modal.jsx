import { createPortal } from 'react-dom'

// HESAKA Web - Componente reutilizable: Modal
export default function Modal({
    title,
    onClose,
    children,
    maxWidth = '560px',
    bodyPadding = '0 24px 24px',
    closeOnBackdrop = true,
    closeDisabled = false,
    onCloseAttempt,
}) {
    const handleClose = () => {
        if (closeDisabled) {
            onCloseAttempt?.()
            return
        }
        onClose?.()
    }

    const modalContent = (
        <div className="modal-backdrop" onMouseDown={(e) => e.target === e.currentTarget && closeOnBackdrop && handleClose()}>
            <div className="modal" style={{ maxWidth, maxHeight: '96vh', display: 'flex', flexDirection: 'column' }}>
                <div className="modal-header" style={{ flexShrink: 0 }}>
                    <h3 className="modal-title">{title}</h3>
                    <button
                        type="button"
                        onClick={handleClose}
                        disabled={closeDisabled}
                        title={closeDisabled ? 'La accion aun se esta procesando.' : 'Cerrar'}
                        style={{
                            background: 'none',
                            color: closeDisabled ? 'var(--text-disabled, #6b7280)' : 'var(--text-muted)',
                            padding: '4px 8px',
                            fontSize: '1.2rem',
                            borderRadius: 6,
                            opacity: closeDisabled ? 0.5 : 1,
                            cursor: closeDisabled ? 'not-allowed' : 'pointer',
                        }}
                    >
                        x
                    </button>
                </div>
                <div style={{ overflow: 'auto', minWidth: 0, flex: 1, padding: bodyPadding }}>
                    {children}
                </div>
            </div>
        </div>
    )

    if (typeof document === 'undefined') {
        return modalContent
    }

    return createPortal(modalContent, document.body)
}
