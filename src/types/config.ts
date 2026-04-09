// FR6: Config types — direct port from Scriptable crossover-config.json schema

export interface Team {
  id: string;
  name: string;
  company: string;
}

export interface CrossoverConfig {
  userId: string;         // userAvatars[CANDIDATE].id — for timesheet API
  fullName: string;
  managerId: string;      // assignment.manager.id — for timesheet API
  primaryTeamId: string;  // assignment.team.id — for timesheet API
  teams: Team[];
  hourlyRate: number;     // assignment.salary
  weeklyLimit: number;    // default 40
  useQA: boolean;
  isManager: boolean;     // avatarTypes.includes("MANAGER")
  assignmentId: string;   // assignment.id — for work diary API
  lastRoleCheck: string;  // ISO timestamp, refreshed weekly Monday
  debugMode: boolean;
  showApprovals?: boolean; // dev toggle — show Approvals tab regardless of isManager
  devManagerView?: boolean; // dev toggle — preview manager UI with fake data (non-manager accounts)
  devOvertimePreview?: boolean; // dev toggle — force overtime panel state for UI testing
  setupComplete: boolean;
  setupDate: string;      // ISO timestamp
}

export interface Credentials {
  username: string; // SecureStore key: 'crossover_username'
  password: string; // SecureStore key: 'crossover_password'
}
