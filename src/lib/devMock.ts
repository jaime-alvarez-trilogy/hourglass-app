// Dev-only mock data for Manager Preview mode.
// Injected when config.devManagerView === true on non-manager accounts.

import { getWeekStartDate } from './approvals';
import type { ManualApprovalItem } from './approvals';
import type { ManualRequestEntry } from '../types/requests';
import type { TeamMember } from '../types/api';

// The preview's requests sit in the current week (as of module load), so the Requests
// tab's This Week / Last Week grouping shows them
const MOCK_WEEK = getWeekStartDate();

/**
 * Hard-coded pending team approvals for the Manager Preview toggle
 * (`config.devManagerView === true`). Renders without hitting the API.
 */
export const MOCK_TEAM_ITEMS: ManualApprovalItem[] = [
  {
    id: 'mt-mock-1001',
    category: 'MANUAL',
    userId: 9901,
    fullName: 'Alice Chen',
    durationMinutes: 90,
    hours: '1.5',
    description: 'Debugging production auth issue',
    startDateTime: `${MOCK_WEEK}T16:00:00Z`,
    type: 'WEB',
    timecardIds: [1001],
    weekStartDate: MOCK_WEEK,
  },
  {
    id: 'mt-mock-1002',
    category: 'MANUAL',
    userId: 9902,
    fullName: 'Bob Torres',
    durationMinutes: 120,
    hours: '2.0',
    description: 'Architecture review and team sync',
    startDateTime: `${MOCK_WEEK}T14:30:00Z`,
    type: 'WEB',
    timecardIds: [1002, 1003],
    weekStartDate: MOCK_WEEK,
  },
];

/**
 * Hard-coded "My Requests" entries (one per status: PENDING, APPROVED,
 * REJECTED) used by the Manager Preview toggle to exercise the contributor UI.
 */
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

/**
 * Hard-coded direct reports for the Manager Preview toggle, used by auto-approve
 * (useDirectReports). userId matches MOCK_TEAM_ITEMS' userId (Alice 9901, Bob 9902), so
 * those items resolve to a report: in the preview only, mock manual requests resolve by
 * userId (real ones are proven from the work diary, with no userId match). The other three
 * have no pending items. Sorted by name, as directReports() returns them.
 */
export const MOCK_TEAM_ROSTER: TeamMember[] = [
  {
    assignmentId: '7701',
    candidateId: '8801',
    userId: '9901',
    managerId: '8800',
    teamId: '7700',
    teamName: 'Preview Team',
    name: 'Alice Chen',
    isManager: false,
  },
  {
    assignmentId: '7702',
    candidateId: '8802',
    userId: '9902',
    managerId: '8800',
    teamId: '7700',
    teamName: 'Preview Team',
    name: 'Bob Torres',
    isManager: false,
  },
  {
    assignmentId: '7703',
    candidateId: '8803',
    userId: '9903',
    managerId: '8800',
    teamId: '7700',
    teamName: 'Preview Team',
    name: 'Carmen Diaz',
    isManager: false,
  },
  {
    assignmentId: '7704',
    candidateId: '8804',
    userId: '9904',
    managerId: '8800',
    teamId: '7700',
    teamName: 'Preview Team',
    name: 'Dev Patel',
    isManager: false,
  },
  {
    assignmentId: '7705',
    candidateId: '8805',
    userId: '9905',
    managerId: '8800',
    teamId: '7700',
    teamName: 'Preview Team',
    name: 'Erin Walsh',
    isManager: true,
  },
];
