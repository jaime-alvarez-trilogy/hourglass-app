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
// Non-exhaustive: API returns additional scoring dimensions not captured here.
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

// FR1 (01-team-roster-api): One of the manager's owned teams, returned by
// GET /api/v2/teams?status=ACTIVE as a bare array (no Spring page envelope).
export interface RawTeam {
  id: number;
  name: string;
}

// FR1 (01-team-roster-api): One team-assignment row returned by
// GET /api/v2/teams/assignments?teamId={id}&status=ACTIVE (Spring `content`
// envelope, or a bare array as a defensive fallback — see src/api/team.ts).
export interface RawTeamAssignment {
  id: number;
  // Kept as string rather than an 'ACTIVE'-only literal because the client
  // deliberately filters unexpected inactive values itself.
  status: string;
  candidate: {
    id: number;
    // Login/profile identifier — NOT the same as `id` above. TeamMember's
    // candidateId is derived from `id`, not `userId`; see CLAUDE.md's
    // documented assignmentId/userId/candidateId gotcha before using this.
    userId: number;
    printableName: string;
    photoUrl?: string;
    avatarTypes?: string[];
  };
  manager: {
    id: number;
  };
  team: {
    id: number;
    name: string;
  };
}

// FR1 (01-team-roster-api): App-facing roster row normalized from
// RawTeamAssignment by fetchTeamRoster (src/api/team.ts). All identifiers
// are stringified at the transport boundary.
export interface TeamMember {
  assignmentId: string;
  candidateId: string;
  managerId: string;
  teamId: string;
  teamName: string;
  name: string;
  photoUrl?: string;
  isManager: boolean;
}
