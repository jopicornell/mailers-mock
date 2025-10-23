import { useState, useEffect, useCallback, useMemo, useRef, type ChangeEvent } from 'react';
import {
  useReactTable,
  getCoreRowModel,
  getPaginationRowModel,
  flexRender,
  createColumnHelper,
  ColumnDef,
} from '@tanstack/react-table';
import * as ContextMenu from '@radix-ui/react-context-menu';
import { Mail } from '@/types/Mail';
import PopUp from './PopUp';

interface MailsState {
  mails: Mail[];
  currentEmail: Mail | null;
  selectedEmailType: 'text/plain' | 'text/html';
  subject: string;
  to: string;
  dateTimeSince: string;
  deletingEmailIds: Set<string>;
}

const Mails = () => {
  const queryParams = new URLSearchParams(location.search);
  const [state, setState] = useState<MailsState>({
    mails: [],
    currentEmail: null,
    selectedEmailType: 'text/html',
    subject: queryParams.get('subject') || '',
    to: queryParams.get('to') || '',
    dateTimeSince: queryParams.get('dateTimeSince') || '',
    deletingEmailIds: new Set(),
  });

  const [pagination, setPagination] = useState({
    pageIndex: 0,
    pageSize: 100,
  });

  const intervalIdRef = useRef<number | null>(null);

  const fetchMails = useCallback(() => {
    const apiParams = new URLSearchParams('page=1&pageSize=100');
    const uiParams = new URLSearchParams(location.search);

    uiParams.forEach((key, value) => apiParams.set(key, value));

    if (state.subject) {
      apiParams.append('subject', state.subject);
    }

    if (state.to) {
      apiParams.append('to', state.to);
    }

    if (state.dateTimeSince) {
      apiParams.append('dateTimeSince', state.dateTimeSince);
    }

    const queryString = apiParams.toString();
    console.info(`Fetching mails with params ${queryString}`);
    fetch(`/api/mails?${queryString}`)
      .then(data => data.json())
      .then((data: Mail[]) => {
        data.forEach(m => {
          if (m.personalizations?.[0]?.dynamic_template_data) {
            m.displayContent = [
              {
                type: 'template: ' + m.template_id,
                value: JSON.stringify(m.personalizations[0].dynamic_template_data)
              }];
          } else {
            m.displayContent = m.content;
          }
        });

        return data;
      })
      .then(mails => {
        setState(prev => ({ ...prev, mails }));
      });
  }, [state.subject, state.to, state.dateTimeSince]);

  useEffect(() => {
    fetchMails();
  }, [fetchMails]);

  useEffect(() => {
    // Set up interval to fetch mails every 5 seconds
    intervalIdRef.current = setInterval(() => {
      fetchMails();
    }, 5000) as unknown as number;

    // Clean up interval on unmount
    return () => {
      if (intervalIdRef.current !== null) {
        clearInterval(intervalIdRef.current);
      }
    };
  }, [fetchMails]);

  useEffect(() => {
    const handleKeyboardNavigation = (event: KeyboardEvent) => {
      // Only handle navigation if popup is open
      if (!state.currentEmail) {
        console.log('No current email');
      }

      // Handle ESC key to close popup
      if (event.key === 'Escape') {
        event.preventDefault();
        setState(prev => ({ ...prev, currentEmail: null, selectedEmailType: 'text/html' }));
        return;
      }

      // Check for arrow keys or vim-style keys
      const isUpKey = event.key === 'ArrowUp' || event.key === 'k';
      const isDownKey = event.key === 'ArrowDown' || event.key === 'j';

      if (!isUpKey && !isDownKey) {
        return;
      }

      // Prevent default scrolling behavior
      event.preventDefault();
      
      // Find current email index
      const currentIndex = state.mails.findIndex(
        mail => mail.id === state.currentEmail?.id
      );

      if (currentIndex === -1) {
        return;
      }

      let newIndex;
      if (isUpKey) {
        // Navigate to previous email (stop at first)
        newIndex = Math.max(0, currentIndex - 1);
      } else {
        // Navigate to next email (stop at last)
        newIndex = Math.min(state.mails.length - 1, currentIndex + 1);
      }

      // Only update if index changed
      if (newIndex !== currentIndex) {
        const newEmail = state.mails[newIndex];
        setState(prev => ({
          ...prev,
          currentEmail: newEmail,
          // Preserve the type if it exists, otherwise use default for new email
          selectedEmailType: prev.selectedEmailType || (newEmail.template_id ? undefined : 'text/plain')
        }));
      }
    };

    document.addEventListener('keydown', handleKeyboardNavigation);
    return () => {
      document.removeEventListener('keydown', handleKeyboardNavigation);
    };
  }, [state.currentEmail, state.mails, state.selectedEmailType]);

  const deleteAllMails = useCallback(() => {
    console.info('Command to delete all mails.');

    fetch('/api/mails', { method: 'DELETE' })
      .then(response => {
        if (response.status === 202) {
          console.info('All mails were deleted.');
          setState(prev => ({ ...prev, mails: [] }));
        } else {
          console.error('Failed to delete all mails.', response);
        }
      });
  }, []);

  const deleteSingleEmail = useCallback(async (emailId: string) => {
    console.info(`Deleting email with ID: ${emailId}`);

    // Add email to deleting set and pause polling
    setState(prev => ({
      ...prev,
      deletingEmailIds: new Set([...prev.deletingEmailIds, emailId])
    }));

    // Pause the polling interval
    if (intervalIdRef.current !== null) {
      clearInterval(intervalIdRef.current);
      intervalIdRef.current = null;
    }

    try {
      const response = await fetch(`/api/mails/${emailId}`, { method: 'DELETE' });

      if (response.ok) {
        console.info('Email deleted successfully.');
        // Remove the email from the list
        setState(prev => ({
          ...prev,
          mails: prev.mails.filter(mail => mail.id !== emailId),
          deletingEmailIds: new Set([...prev.deletingEmailIds].filter(id => id !== emailId)),
          // Close popup if the deleted email was being viewed
          currentEmail: prev.currentEmail?.id === emailId ? null : prev.currentEmail
        }));
      } else {
        const errorData = await response.json().catch(() => ({ error: 'Unknown error' }));
        console.error('Failed to delete email:', errorData);
        alert(`Failed to delete email: ${errorData.error || 'Unknown error'}`);
        // Remove from deleting set on error
        setState(prev => ({
          ...prev,
          deletingEmailIds: new Set([...prev.deletingEmailIds].filter(id => id !== emailId))
        }));
      }
    } catch (error) {
      console.error('Error deleting email:', error);
      alert('An error occurred while deleting the email. Please try again.');
      // Remove from deleting set on error
      setState(prev => ({
        ...prev,
        deletingEmailIds: new Set([...prev.deletingEmailIds].filter(id => id !== emailId))
      }));
    } finally {
      // Resume polling interval
      intervalIdRef.current = setInterval(() => {
        fetchMails();
      }, 5000) as unknown as number;
    }
  }, [fetchMails]);

  const refresh = useCallback(() => {
    fetchMails();
  }, [fetchMails]);

  const filterEmailTo = useCallback((event: ChangeEvent<HTMLInputElement>) => {
    setState(prev => ({ ...prev, to: event.target.value }));
  }, []);

  const filterEmailSubject = useCallback((event: ChangeEvent<HTMLInputElement>) => {
    setState(prev => ({ ...prev, subject: event.target.value }));
  }, []);

  const setCurrentEmail = useCallback((email: Mail, type: 'text/plain' | 'text/html' = 'text/html') => {
    setState(prev => ({ ...prev, currentEmail: email, selectedEmailType: type }));
  }, []);

  const hide = useCallback(() => {
    setState(prev => ({ ...prev, currentEmail: null, selectedEmailType: 'text/html' }));
  }, []);

  const columnHelper = createColumnHelper<Mail>();

  const columns = useMemo<ColumnDef<Mail, any>[]>(
    () => [
      columnHelper.accessor('datetime', {
        header: 'datetime',
        cell: info => info.getValue(),
        size: 220,
      }),
      columnHelper.accessor(row => row.from?.email || '', {
        id: 'from',
        header: 'from',
        cell: info => info.getValue(),
        size: 220,
      }),
      columnHelper.accessor('personalizations', {
        id: 'to',
        header: 'to',
        size: 220,
        cell: info => {
          const personalizations = info.getValue();
          return (
            <>
              {personalizations
                ?.filter(value => !!value.to)
                .map(value => value.to)
                .map((tos, index) => (
                  <div key={index}>
                    {tos && tos.length > 1
                      ? <ul>
                        {tos.map((to, subIndex) => (<li key={subIndex}>{to.email}</li>))}
                      </ul>
                      : <span>{tos?.[0]?.email}</span>
                    }
                  </div>
                ))}
            </>
          );
        },
      }),
      columnHelper.accessor('subject', {
        header: 'subject',
        cell: info => info.getValue(),
      }),
    ],
    [columnHelper, setCurrentEmail]
  );

  const table = useReactTable({
    data: state.mails,
    columns,
    getCoreRowModel: getCoreRowModel(),
    getPaginationRowModel: getPaginationRowModel(),
    onPaginationChange: setPagination,
    state: {
      pagination,
    },
  });

  return (
    <div className="min-h-screen bg-gradient-to-br from-gray-50 to-gray-100">
      {/* Header */}
      <div className="bg-white shadow-sm border-b border-gray-200">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-6">
          <h1 className="text-3xl font-bold bg-gradient-to-r from-blue-600 to-indigo-600 bg-clip-text text-transparent">
            MAILERS-MOCK
          </h1>
        </div>
      </div>

      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        {/* Filters */}
        <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-4 mb-6">
          <div className="flex flex-wrap items-center gap-4">
            <div className="flex-1 min-w-[200px]">
              <label className="block text-sm font-medium text-gray-700 mb-1">
                Filter by subject
              </label>
              <input
                type="search"
                onChange={filterEmailSubject}
                value={state.subject}
                className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent transition-all"
                placeholder="Search subject..."
              />
            </div>
            <div className="flex-1 min-w-[200px]">
              <label className="block text-sm font-medium text-gray-700 mb-1">
                Filter by recipient
              </label>
              <input
                type="search"
                onChange={filterEmailTo}
                value={state.to}
                className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent transition-all"
                placeholder="Search recipient..."
              />
            </div>
            <div className="flex items-end">
              <button
                onClick={refresh}
                className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors flex items-center gap-2 font-medium"
              >
                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
                </svg>
                Refresh
              </button>
            </div>
          </div>
        </div>

        {state.currentEmail ? <PopUp currentEmail={state.currentEmail} selectedEmailType={state.selectedEmailType} hide={hide} /> : null}

        <div className="mt-6 bg-white rounded-lg shadow-sm border border-gray-200 overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full border-collapse">
              <thead className="bg-gray-50">
                {table.getHeaderGroups().map(headerGroup => (
                  <tr key={headerGroup.id}>
                    {headerGroup.headers.map(header => (
                      <th
                        key={header.id}
                        className="text-left px-4 py-3 border-b-2 border-gray-300 text-sm font-semibold text-gray-700"
                        style={{
                          width: header.getSize() !== 150 ? header.getSize() : undefined,
                          minWidth: header.column.columnDef.minSize,
                        }}
                      >
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
                {table.getRowModel().rows.map(row => {
                  const isDeleting = state.deletingEmailIds.has(row.original.id || '');
                  return (
                    <ContextMenu.Root key={row.id}>
                      <ContextMenu.Trigger asChild>
                        <tr
                          onClick={() => !isDeleting && setCurrentEmail(row.original)}
                          className={`hover:bg-gray-50 cursor-pointer transition-colors ${
                            isDeleting ? 'opacity-50 pointer-events-none' : ''
                          }`}
                        >
                          {row.getVisibleCells().map(cell => (
                            <td
                              key={cell.id}
                              className={`px-4 py-3 text-sm text-gray-900 ${
                                cell.column.id === 'subject' || cell.column.id === 'actions'
                                  ? 'whitespace-normal'
                                  : 'whitespace-nowrap'
                              }`}
                            >
                              {flexRender(cell.column.columnDef.cell, cell.getContext())}
                            </td>
                          ))}
                        </tr>
                      </ContextMenu.Trigger>
                      <ContextMenu.Portal>
                        <ContextMenu.Content
                          className="min-w-[220px] bg-white rounded-md overflow-hidden p-[5px] shadow-[0px_10px_38px_-10px_rgba(22,_23,_24,_0.35),_0px_10px_20px_-15px_rgba(22,_23,_24,_0.2)] z-50"
                        >
                          <ContextMenu.Item
                            className="group text-[13px] leading-none text-red-600 rounded-[3px] flex items-center h-[25px] px-[5px] relative pl-[25px] select-none outline-none data-[disabled]:text-gray-400 data-[disabled]:pointer-events-none data-[highlighted]:bg-red-50 data-[highlighted]:text-red-700 cursor-pointer"
                            onSelect={() => {
                              if (row.original.id) {
                                deleteSingleEmail(row.original.id);
                              }
                            }}
                          >
                            <svg
                              className="w-4 h-4 mr-2 absolute left-1"
                              fill="none"
                              stroke="currentColor"
                              viewBox="0 0 24 24"
                            >
                              <path
                                strokeLinecap="round"
                                strokeLinejoin="round"
                                strokeWidth={2}
                                d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16"
                              />
                            </svg>
                            Delete
                          </ContextMenu.Item>
                        </ContextMenu.Content>
                      </ContextMenu.Portal>
                    </ContextMenu.Root>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>

        <div className="mt-4 flex flex-wrap justify-between items-center gap-4 bg-white rounded-lg shadow-sm border border-gray-200 px-4 py-3">
          <div className="flex items-center gap-2 flex-wrap">
            <button
              onClick={() => table.setPageIndex(0)}
              disabled={!table.getCanPreviousPage()}
              className="px-3 py-1 border border-gray-300 rounded-md hover:bg-gray-50 disabled:opacity-50 disabled:cursor-not-allowed transition-colors text-sm font-medium"
            >
              {'<<'}
            </button>
            <button
              onClick={() => table.previousPage()}
              disabled={!table.getCanPreviousPage()}
              className="px-3 py-1 border border-gray-300 rounded-md hover:bg-gray-50 disabled:opacity-50 disabled:cursor-not-allowed transition-colors text-sm font-medium"
            >
              {'<'}
            </button>
            <button
              onClick={() => table.nextPage()}
              disabled={!table.getCanNextPage()}
              className="px-3 py-1 border border-gray-300 rounded-md hover:bg-gray-50 disabled:opacity-50 disabled:cursor-not-allowed transition-colors text-sm font-medium"
            >
              {'>'}
            </button>
            <button
              onClick={() => table.setPageIndex(table.getPageCount() - 1)}
              disabled={!table.getCanNextPage()}
              className="px-3 py-1 border border-gray-300 rounded-md hover:bg-gray-50 disabled:opacity-50 disabled:cursor-not-allowed transition-colors text-sm font-medium"
            >
              {'>>'}
            </button>
            <span className="ml-4 text-sm text-gray-700">
              Page{' '}
              <strong className="font-semibold text-gray-900">
                {table.getState().pagination.pageIndex + 1} of{' '}
                {table.getPageCount()}
              </strong>
            </span>
            <select
              value={table.getState().pagination.pageSize}
              onChange={e => {
                table.setPageSize(Number(e.target.value));
              }}
              className="ml-4 px-3 py-1 border border-gray-300 rounded-md focus:ring-2 focus:ring-blue-500 focus:border-transparent text-sm"
            >
              {[10, 20, 50, 100].map(pageSize => (
                <option key={pageSize} value={pageSize}>
                  Show {pageSize}
                </option>
              ))}
            </select>
          </div>
          <div>
            <button
              onClick={deleteAllMails}
              className="text-red-600 hover:text-red-700 font-medium text-sm hover:underline transition-colors"
            >
              Delete all
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};

export default Mails;

