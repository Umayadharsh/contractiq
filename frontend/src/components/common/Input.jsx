import React from 'react';

export default function Input({
  label,
  id,
  error,
  hint,
  className = '',
  ...props
}) {
  const inputId = id || (label ? label.toLowerCase().replace(/\s+/g, '-') : undefined);

  return (
    <div className="ciq-form-group">
      {label && (
        <label htmlFor={inputId} className="ciq-label">
          {label}
        </label>
      )}
      <input
        id={inputId}
        className={`ciq-input ${error ? 'ciq-input-error' : ''} ${className}`.trim()}
        {...props}
      />
      {hint && !error && <span className="ciq-form-hint">{hint}</span>}
      {error && <span className="ciq-form-hint" style={{ color: 'var(--ciq-danger-text)' }}>{error}</span>}
    </div>
  );
}
