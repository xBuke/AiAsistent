import type { ReactNode } from 'react';

export interface DataTableColumn<T> {
  key: string;
  label: string;
  width?: string;
  render?: (row: T) => ReactNode;
}

interface DataTableProps<T> {
  columns: Array<DataTableColumn<T>>;
  data: T[];
  isLoading?: boolean;
  emptyMessage?: string;
  onRowClick?: (row: T) => void;
}

const SKELETON_ROWS = 5;

export function DataTable<T>({
  columns,
  data,
  isLoading = false,
  emptyMessage = 'Nema podataka.',
  onRowClick,
}: DataTableProps<T>) {
  if (!isLoading && data.length === 0) {
    return <div className="admin-empty-state">{emptyMessage}</div>;
  }

  return (
    <table className="admin-table">
      <thead>
        <tr>
          {columns.map((column) => (
            <th key={column.key} style={column.width ? { width: column.width } : undefined}>
              {column.label}
            </th>
          ))}
        </tr>
      </thead>
      <tbody>
        {isLoading
          ? Array.from({ length: SKELETON_ROWS }).map((_, rowIndex) => (
              <tr key={`skeleton-${rowIndex}`}>
                {columns.map((column) => (
                  <td key={`${column.key}-${rowIndex}`}>
                    <div className="admin-skeleton admin-table__skeleton" />
                  </td>
                ))}
              </tr>
            ))
          : data.map((row, rowIndex) => (
              <tr
                key={`row-${rowIndex}`}
                className={onRowClick ? 'admin-table__row-clickable' : undefined}
                onClick={onRowClick ? () => onRowClick(row) : undefined}
              >
                {columns.map((column) => (
                  <td key={column.key}>
                    {column.render ? column.render(row) : String((row as Record<string, unknown>)[column.key] ?? '')}
                  </td>
                ))}
              </tr>
            ))}
      </tbody>
    </table>
  );
}
