// HESAKA Web — Componente reutilizable: Modal
export default function Modal({ title, onClose, children, maxWidth = '560px', closeOnBackdrop = true }) {
    return (
        <div className="modal-backdrop" onMouseDown={(e) => e.target === e.currentTarget && closeOnBackdrop && onClose()}>
            <div className="modal" style={{ maxWidth, maxHeight: '96vh', display: 'flex', flexDirection: 'column' }}>
                <div className="modal-header" style={{ flexShrink: 0 }}>
                    <h3 className="modal-title">{title}</h3>
                    <button
                        onClick={onClose}
                        style={{ background: 'none', color: 'var(--text-muted)', padding: '4px 8px', fontSize: '1.2rem', borderRadius: 6 }}
                    >✕</button>
                </div>
                <div style={{ overflowY: 'auto', flex: 1, padding: '0 24px 24px' }}>
                    {children}
                </div>
            </div>
        </div>
    )
}
