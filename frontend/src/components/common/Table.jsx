import React from 'react';

export default function Table({
  columns = [],
  data = [],
  onRowClick,
  selectedRowId,
  idKey = '_id',
  emptyMessage = 'No records found',
  className = '',
}) {
  return (
    <div className={`ciq-table-wrap ${className}`.trim()}>
      <table className="ciq-table">
        <thead>
          <tr>
            {columns.map((col, idx) => (
              <th
                key={col.key || idx}
                style={{
                  width: col.width || 'auto',
                  textAlign: col.align || 'left',
                }}
              >
                {col.header}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {data.length === 0 ? (
            <tr>
              <td colSpan={columns.length} style={{ textAlign: 'center', padding: '3rem 1rem' }}>
                <span style={{ color: 'var(--ciq-text-muted)', fontSize: '0.9rem' }}>{emptyMessage}</span>
              </td>
            </tr>
          ) : (
            data.map((row, rowIdx) => {
              const rowId = row[idKey] || rowIdx;
              const isSelected = selectedRowId !== undefined && selectedRowId === rowId;
              const isClickable = Boolean(onRowClick);

              return (
                <tr
                  key={rowId}
                  className={`${isSelected ? 'ciq-row-selected' : ''} ${isClickable ? 'ciq-table-clickable-row' : ''}`.trim()}
                  onClick={() => onRowClick && onRowClick(row)}
                  tabIndex={isClickable ? 0 : undefined}
                  role={isClickable ? 'button' : undefined}
                  onKeyDown={
                    isClickable
                      ? (e) => {
                          if (e.key === 'Enter' || e.key === ' ') {
                            e.preventDefault();
                            onRowClick(row);
                          }
                        }
                      : undefined
                  }
                >
                  {columns.map((col, colIdx) => (
                    <td
                      key={col.key || colIdx}
                      style={{ textAlign: col.align || 'left' }}
                    >
                      {col.render ? col.render(row[col.key], row, rowIdx) : row[col.key]}
                    </td>
                  ))}
                </tr>
              );
            })
          )}
        </tbody>
      </table>
    </div>
  );
}
