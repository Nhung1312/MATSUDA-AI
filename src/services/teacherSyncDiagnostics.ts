export interface TeacherSyncDiagnostics {
  status: 'idle' | 'loading' | 'ready' | 'partial' | 'error';
  uid?: string;
  firebaseUid?: string | null;
  email?: string | null;
  projectId?: string;
  uidMatches?: number;
  emailMatches?: number;
  emailQueryFailed?: boolean;
  cloudExams?: number;
  visibleExams?: number;
  classesState?: 'profile-missing' | 'field-missing' | 'empty' | 'present' | 'read-error';
  classCount?: number;
  errorCode?: string;
}

let state: TeacherSyncDiagnostics = { status: 'idle' };
const listeners = new Set<() => void>();
export const getTeacherSyncDiagnostics = () => state;
export const subscribeTeacherSyncDiagnostics = (callback: () => void) => {
  listeners.add(callback); return () => { listeners.delete(callback); };
};
export function setTeacherSyncDiagnostics(next: TeacherSyncDiagnostics): void {
  state = { ...next }; for (const listener of listeners) listener();
}
