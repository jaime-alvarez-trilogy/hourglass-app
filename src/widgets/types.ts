// FR1: WidgetData interface — shared data shape for iOS and Android widgets
// Written by app layer, read by both platform widget implementations.
// Extended in 08-widget-enhancements: daily bar chart, approval mode-switch, request status.

export type WidgetUrgency = 'none' | 'low' | 'high' | 'critical' | 'expired';

// ─── 08-widget-enhancements: new widget types ─────────────────────────────────

/** One day's bar chart entry — pre-computed from HoursData.daily */
export interface WidgetDailyEntry {
  /** Day abbreviation: "Mon" | "Tue" | "Wed" | "Thu" | "Fri" | "Sat" | "Sun" */
  day: string;
  /** Hours worked that day, 0–24 */
  hours: number;
  /** Whether this day is today */
  isToday: boolean;
  /** Whether this calendar day is strictly after today (local time); used to mute future bars */
  isFuture: boolean;
}

/** Pending approval item for manager widget view (max 3 shown) */
export interface WidgetApprovalItem {
  id: string;
  /** fullName truncated to 18 chars with "…" if needed */
  name: string;
  /** Pre-formatted hours string: "2.5h" */
  hours: string;
  category: 'MANUAL' | 'OVERTIME';
}

/** Contributor's own manual time request for widget view (max 3 shown) */
export interface WidgetMyRequest {
  id: string;
  /** Formatted date: "Mon Mar 18" */
  date: string;
  /** Pre-formatted hours string: "1.5h" */
  hours: string;
  /** Memo truncated to 18 chars with "…" if needed */
  memo: string;
  status: 'PENDING' | 'APPROVED' | 'REJECTED';
}

export interface WidgetData {
  /** Weekly hours total as string, 1 decimal: "32.5" */
  hours: string;
  /** Weekly hours with unit: "32.5h" */
  hoursDisplay: string;
  /** Formatted earnings: "$1,300" */
  earnings: string;
  /** Raw earnings number for calculations */
  earningsRaw: number;
  /** Today's hours with unit: "6.2h" */
  today: string;
  /** Remaining hours or overtime: "7.5h left" | "2.5h OT" */
  hoursRemaining: string;
  /** AI usage range: "71%–75%" or "N/A" */
  aiPct: string;
  /** BrainLift hours with unit: "3.2h" */
  brainlift: string;
  /** Deadline as Unix timestamp ms */
  deadline: number;
  /** Urgency level for color theming */
  urgency: WidgetUrgency;
  /** Pending approval count — 0 for contributors */
  pendingCount: number;
  /** Whether the current user is a manager */
  isManager: boolean;
  /** Unix timestamp ms of last data refresh */
  cachedAt: number;
  /** Whether using QA environment */
  useQA: boolean;

  // ─── 08-widget-enhancements: new fields ──────────────────────────────────

  /** Mon–Sun bar chart entries, always 7, Mon[0]–Sun[6] */
  daily: WidgetDailyEntry[];
  /** Pending approval items for manager widget action view, max 3; [] for contributors */
  approvalItems: WidgetApprovalItem[];
  /** Contributor's own manual time requests for widget action view, max 3; [] for managers */
  myRequests: WidgetMyRequest[];
  /** Background tint color in action mode, or "" in hours mode */
  actionBg: string;

  // ─── 01-data-extensions: brand revamp fields ─────────────────────────────

  /** Pace state derived from hours vs expected progress; drives badge label + color */
  paceBadge: 'crushed_it' | 'on_track' | 'behind' | 'critical' | 'none';
  /** Week-over-week hours delta: "+2.1h" | "-3.4h" | "" (no history) */
  weekDeltaHours: string;
  /** Week-over-week earnings delta: "+$84" | "-$136" | "" (no history) */
  weekDeltaEarnings: string;
  /** BrainLift weekly target label — always "5h" */
  brainliftTarget: string;

  // ─── 01-widget-polish: layout fix fields ─────────────────────────────────

  /** Today's hours vs daily average: "+1.2h" | "-0.5h" | "" (no average yet) */
  todayDelta: string;
}
