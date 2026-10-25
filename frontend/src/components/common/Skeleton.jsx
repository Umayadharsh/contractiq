import React from 'react';

export default function Skeleton({
  width = '100%',
  height = '1rem',
  borderRadius = 'var(--ciq-radius-sm)',
  className = '',
  style = {},
}) {
  return (
    <div
      className={`ciq-skeleton ${className}`.trim()}
      style={{
        width,
        height,
        borderRadius,
        ...style,
      }}
    />
  );
}

export function TableSkeleton({ rows = 5, cols = 4 }) {
  return (
    <div style={{ padding: '1rem', display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
      <Skeleton height="2rem" />
      {Array.from({ length: rows }).map((_, r) => (
        <div key={r} style={{ display: 'flex', gap: '1rem' }}>
          {Array.from({ length: cols }).map((_, c) => (
            <Skeleton key={c} height="1.5rem" style={{ flex: 1 }} />
          ))}
        </div>
      ))}
    </div>
  );
}

export function CardSkeleton() {
  return (
    <div className="ciq-card" style={{ padding: '1.5rem' }}>
      <Skeleton width="40%" height="1.5rem" style={{ marginBottom: '1rem' }} />
      <Skeleton width="90%" height="1rem" style={{ marginBottom: '0.5rem' }} />
      <Skeleton width="70%" height="1rem" style={{ marginBottom: '1.5rem' }} />
      <Skeleton width="30%" height="2rem" />
    </div>
  );
}
