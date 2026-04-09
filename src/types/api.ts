// Shared API response types

// FR1 (11-app-data-layer): Single event within a work diary slot.
// Represents one tracked activity (app + idleness + AI classification).
export interface WorkDiaryEvent {
  processName: string; // OS process name, e.g. "Cursor", "Slack"
  idle: boolean;
  activity: string;    // "AI" | "PURE_AI" | "OTHER"
}

// FR1 (04-ai-brainlift): Work diary slot returned by
// GET /api/timetracking/workdiaries?assignmentId={id}&date=YYYY-MM-DD
// Each slot represents 10 minutes of tracked time.
export interface WorkDiarySlot {
  tags: string[];
  autoTracker: boolean;
  status: 'PENDING' | 'APPROVED' | 'REJECTED';
  memo: string;
  actions: Array<{
    actionType: string;
    comment: string;
    actionMadeBy: number;
    createdDate: string;
  }>;
  events?: WorkDiaryEvent[]; // FR1 (11-app-data-layer): absent on manual time entries
}
