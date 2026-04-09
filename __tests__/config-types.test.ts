// FR6: Config Types — runtime shape validation
// TypeScript compile-time checks are enforced by tsc --noEmit
import type { CrossoverConfig, Team, Credentials } from '../src/types/config';

describe('FR6: Config Types', () => {
  it('CrossoverConfig accepts a valid object with all 14 fields', () => {
    const config: CrossoverConfig = {
      userId: '2362707',
      fullName: 'Jane Doe',
      managerId: '2372227',
      primaryTeamId: '4584',
      teams: [{ id: '4584', name: 'Team Alpha', company: 'Acme Corp' }],
      hourlyRate: 25,
      weeklyLimit: 40,
      useQA: false,
      isManager: false,
      assignmentId: '79996',
      lastRoleCheck: '2026-03-08T00:00:00.000Z',
      debugMode: false,
      setupComplete: true,
      setupDate: '2026-01-01T00:00:00.000Z',
    };
    expect(config.userId).toBe('2362707');
    expect(config.hourlyRate).toBe(25);
    expect(config.teams).toHaveLength(1);
  });

  it('Team has id, name, company fields', () => {
    const team: Team = { id: '4584', name: 'Team Alpha', company: 'Acme Corp' };
    expect(team.id).toBe('4584');
    expect(team.name).toBe('Team Alpha');
    expect(team.company).toBe('Acme Corp');
  });

  it('Credentials has username and password fields', () => {
    const creds: Credentials = { username: 'user@example.com', password: 'pass123' };
    expect(creds.username).toBe('user@example.com');
    expect(creds.password).toBe('pass123');
  });

  it('CrossoverConfig teams is typed as Team array', () => {
    const teams: Team[] = [{ id: '1', name: 'A', company: 'B' }];
    const config: CrossoverConfig = {
      userId: '1',
      fullName: 'Test',
      managerId: '2',
      primaryTeamId: '1',
      teams,
      hourlyRate: 10,
      weeklyLimit: 40,
      useQA: false,
      isManager: false,
      assignmentId: '3',
      lastRoleCheck: '',
      debugMode: false,
      setupComplete: false,
      setupDate: '',
    };
    expect(config.teams[0].id).toBe('1');
  });
});
