import type { Assignment, ClassRoom, Submission, Contest, ContestSubmission } from '../types';
type Snapshot = { classes: ClassRoom[]; assignments: Assignment[]; submissions: Submission[]; contests: Contest[]; contestSubmissions: ContestSubmission[] };
let owner: string | null = null;
let snapshot: Partial<Snapshot> = {};
/** Memory only, scoped to the authenticated owner. Existing disk data is untouched. */
export const CloudSessionCache = {
  begin(uid: string | null) { if (owner !== uid) { owner = uid; snapshot = {}; } },
  get<K extends keyof Snapshot>(uid: string, key: K): Snapshot[K] {
    return (owner === uid ? snapshot[key] || [] : []) as Snapshot[K];
  },
  set<K extends keyof Snapshot>(uid: string, key: K, value: Snapshot[K]) {
    if (owner !== uid) { owner = uid; snapshot = {}; }
    snapshot[key] = value;
  }
};
