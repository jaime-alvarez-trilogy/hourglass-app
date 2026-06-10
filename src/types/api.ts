// Shared API response types

// FR1 (11-app-data-layer): Single event within a work diary slot.
// Represents one tracked activity (app + idleness + AI classification).
export interface WorkDiaryEvent {
  processName: string; // OS process name, e.g. "Cursor", "Slack"
  idle: boolean;
  activity: string;    // "AI" | "PURE_AI" | "OTHER"
}

// FR1 (01-hourly-data-layer): BrainLift probability breakdown attached to second_brain slots.
// Null on all other slots. probability is a float-as-string (e.g. "84.4").
export interface SecondBrainDeepDive {
  probability: string;                      // ← API: float-as-string, e.g. "84.4"
  ai_tool_actively_present: number;         // ← API: 0-100
  deep_ai_research_and_synthesis: number;   // ← API: 0-100
  building_custom_ai_tools: number;         // ← API: 0-100
  documenting_ai_system_or_prompts: number; // ← API: 0-100
  routine_operational_work: number;         // ← API: 0-100
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
  // Fields below confirmed 2026-06-09 from live prod API response
  date: string;              // ← API: ISO+tz, e.g. "2026-06-09T12:50:00Z" (UTC w/o timeZoneId param)
  time: string;              // ← API: "HH:MM:SS" (UTC w/o timeZoneId; use slot.date for hour extraction)
  activityLevel: number;     // ← API: 1-100
  intensityScore: number;    // ← API: 1-100
  productivityCategory: 'PRODUCTIVE' | 'COMMUNICATION' | 'UNCATEGORIZED'; // ← API
  activities: string[];      // ← API: e.g. ["AI","PURE_AI","Chat","Meeting","Office","Development","Uncategorized"]
  secondBrainDeepDive: SecondBrainDeepDive | null; // ← API: null on most slots; present on second_brain slots
}
