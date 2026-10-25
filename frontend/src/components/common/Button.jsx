import React from 'react';

export default function Button({
  children,
  variant = 'primary', // primary, secondary, outline, ghost, danger
  size = 'md', // sm, md, lg
  className = '',
  disabled = false,
  loading = false,
  icon: Icon,
  type = 'button',
  onClick,
  ...props
}) {
  const variantClass = `ciq-btn-${variant}`;
  const sizeClass = size !== 'md' ? `ciq-btn-${size}` : '';

  return (
    <button
      type={type}
      className={`ciq-btn ${variantClass} ${sizeClass} ${className}`.trim()}
      disabled={disabled || loading}
      onClick={onClick}
      {...props}
    >
      {loading ? (
        <span
          style={{
            display: 'inline-block',
            width: '14px',
            height: '14px',
            border: '2px solid currentColor',
            borderRightColor: 'transparent',
            borderRadius: '50%',
            animation: 'ciq-spin 0.75s linear infinite',
          }}
        />
      ) : Icon ? (
        <Icon size={16} />
      ) : null}
      {children}
    </button>
  );
}
