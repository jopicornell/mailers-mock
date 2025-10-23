import { useMemo } from 'react';
import {
  useReactTable,
  getCoreRowModel,
  flexRender,
  createColumnHelper,
  ColumnDef,
  CellContext,
} from '@tanstack/react-table';

interface ClickableRowData {
  action?: string;
  [key: string]: any;
}

interface TableCustomProps<T extends ClickableRowData> {
  data: T[];
  handleShow: (context: CellContext<T, unknown>) => void; // eslint-disable-line no-unused-vars
}

export function TableCustom<T extends ClickableRowData>({ data, handleShow }: TableCustomProps<T>) {
  const columnHelper = createColumnHelper<T>();

  const columns = useMemo<ColumnDef<T, any>[]>(
    () => [
      columnHelper.display({
        id: 'action',
        header: 'Action',
        cell: (context) => (
          <button
            className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors font-medium text-sm"
            onClick={() => handleShow(context)}
          >
            Details
          </button>
        ),
      }),
    ],
    [columnHelper, handleShow]
  );

  const table = useReactTable({
    data,
    columns,
    getCoreRowModel: getCoreRowModel(),
  });

  return (
    <div className="overflow-x-auto bg-white rounded-lg shadow-sm border border-gray-200">
      <table className="w-full border-collapse">
        <thead className="bg-gray-50">
          {table.getHeaderGroups().map(headerGroup => (
            <tr key={headerGroup.id}>
              {headerGroup.headers.map(header => (
                <th className="text-left px-4 py-3 border-b-2 border-gray-300 text-sm font-semibold text-gray-700" key={header.id}>
                  {header.isPlaceholder
                    ? null
                    : flexRender(
                      header.column.columnDef.header,
                      header.getContext()
                    )}
                </th>
              ))}
            </tr>
          ))}
        </thead>
        <tbody className="divide-y divide-gray-200">
          {table.getRowModel().rows.map(row => (
            <tr key={row.id} className="hover:bg-gray-50 transition-colors">
              {row.getVisibleCells().map(cell => (
                <td className="px-4 py-3 text-sm text-gray-900" key={cell.id}>
                  {flexRender(cell.column.columnDef.cell, cell.getContext())}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}