import { useId, useState } from 'react'
import { Eye, EyeOff } from 'lucide-react'

export default function PasswordField({
    label,
    value,
    onChange,
    placeholder = '',
    required = false,
    autoComplete,
    className = 'form-input',
    name,
}) {
    const [visible, setVisible] = useState(false)
    const inputId = useId()

    return (
        <div className="form-group">
            {label && <label className="form-label" htmlFor={inputId}>{label}</label>}
            <div style={{ position: 'relative' }}>
                <input
                    id={inputId}
                    name={name}
                    type={visible ? 'text' : 'password'}
                    className={className}
                    placeholder={placeholder}
                    value={value}
                    onChange={onChange}
                    required={required}
                    autoComplete={autoComplete}
                    style={{ paddingRight: '44px' }}
                />
                <button
                    type="button"
                    onClick={() => setVisible(prev => !prev)}
                    title={visible ? 'Ocultar contraseña' : 'Mostrar contraseña'}
                    aria-label={visible ? 'Ocultar contraseña' : 'Mostrar contraseña'}
                    style={{
                        position: 'absolute',
                        right: '12px',
                        top: '50%',
                        transform: 'translateY(-50%)',
                        background: 'none',
                        color: 'var(--text-muted)',
                        padding: '4px',
                        display: 'inline-flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                    }}
                >
                    {visible ? <EyeOff size={16} /> : <Eye size={16} />}
                </button>
            </div>
        </div>
    )
}
