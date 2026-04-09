// Dev-only mock data for Manager Preview mode.
// Injected when config.devManagerView === true on non-manager accounts.

import type { ManualApprovalItem } from './approvals';
import type { ManualRequestEntry } from '../types/requests';

export const MOCK_TEAM_ITEMS: ManualApprovalItem[] = [
  {
    id: 'mt-mock-1001',
    category: 'MANUAL',
    userId: 9901,
    fullName: 'Alice Chen',
    durationMinutes: 90,
    hours: '1.5',
    description: 'Debugging production auth issue',
    startDateTime: '2026-03-14T10:00:00Z',
    type: 'WEB',
    timecardIds: [1001],
    weekStartDate: '2026-03-09',
  },
  {
    id: 'mt-mock-1002',
    category: 'MANUAL',
    userId: 9902,
    fullName: 'Bob Torres',
    durationMinutes: 120,
    hours: '2.0',
    description: 'Architecture review and team sync',
    startDateTime: '2026-03-13T14:30:00Z',
    type: 'WEB',
    timecardIds: [1002, 1003],
    weekStartDate: '2026-03-09',
  },
];

export const MOCK_MY_REQUESTS: ManualRequestEntry[] = [
  {
    id: '2026-03-14|Deploy hotfix to staging',
    date: '2026-03-14',
    durationMinutes: 60,
    memo: 'Deploy hotfix to staging',
    status: 'PENDING',
    rejectionReason: null,
  },
  {
    id: '2026-03-13|Update API documentation',
    date: '2026-03-13',
    durationMinutes: 90,
    memo: 'Update API documentation',
    status: 'APPROVED',
    rejectionReason: null,
  },
  {
    id: '2026-03-12|Fix login timeout bug',
    date: '2026-03-12',
    durationMinutes: 30,
    memo: 'Fix login timeout bug',
    status: 'REJECTED',
    rejectionReason: 'Please log this as regular tracked time — manual entries are for off-system work only.',
  },
];
