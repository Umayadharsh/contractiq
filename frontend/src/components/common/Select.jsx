import React from 'react';

export default function Select({
  label,
  id,
  options = [],
  children,
  error,
  hint,
  className = '',
  ...props
}) {
  const selectId = id || (label ? label.toLowerCase().replace(/\s+/g, '-') : undefined);

  return (
    <div className="ciq-form-group">
      {label && (
        <label htmlFor={selectId} className="ciq-label">
          {label}
        </label>
      )}
      <select
        id={selectId}
        className={`ciq-select ${error ? 'ciq-input-error' : ''} ${className}`.trim()}
        {...props}
      >
        {options.length > 0
          ? options.map((opt) => (
              <option key={opt.value} value={opt.value}>
                {opt.label || opt.value}
              </option>
            ))
          : children}
      </select>
      {hint && !error && <span className="ciq-form-hint">{hint}</span>}
      {error && <span className="ciq-form-hint" style={{ color: 'var(--ciq-danger-text)' }}>{error}</span>}
    </div>
  );
}
