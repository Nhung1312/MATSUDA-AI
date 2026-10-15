import type { Assignment, Student, Submission } from '../types';

const normalizedName = (value?: string) => String(value || '').normalize('NFC').trim().replace(/\s+/g, ' ').toLocaleLowerCase('vi');
const normalizedClass = (value?: string) => normalizedName(value).replace(/^(?:lớp|lop|class)\s*/i, '').replace(/\s+/g, '');
const classKey = (assignment: Assignment, submission: Submission) =>
  assignment.classId && assignment.classId !== 'all' ? assignment.classId
    : normalizedClass(submission.className) || submission.classId || submission.id;
const nameKey = (assignment: Assignment, submission: Submission) => JSON.stringify([
  classKey(assignment, submission),
  normalizedName(submission.studentName) || submission.id
]);
const submittedTime = (submission: Submission) => {
  const time = Date.parse(submission.submittedAt);
  return Number.isFinite(time) ? time : -Infinity;
};
function newer(candidate: Submission, current: Submission): boolean {
  const a = submittedTime(candidate), b = submittedTime(current);
  if (a !== b) return a > b;
  const attemptA = candidate.attemptNumber || 0, attemptB = current.attemptNumber || 0;
  return attemptA !== attemptB ? attemptA > attemptB : candidate.id > current.id;
}
function keepLatest(groups: Map<string, Submission>, key: string, submission: Submission) {
  const previous = groups.get(key);
  if (!previous || newer(submission, previous)) groups.set(key, submission);
}

/** Read-only representatives; historical attempts remain in the caller's original list. */
export function selectLatestStudentSubmissions(assignment: Assignment, submissions: Submission[]): Submission[] {
  const scoped = submissions.filter(submission => submission.assignmentId === assignment.id);
  const idsByName = new Map<string, Set<string>>();
  for (const submission of scoped) {
    if (!submission.studentId) continue;
    const key = nameKey(assignment, submission);
    const ids = idsByName.get(key) || new Set<string>();
    ids.add(submission.studentId); idsByName.set(key, ids);
  }
  const groups = new Map<string, Submission>();
  for (const submission of scoped) {
    const name = nameKey(assignment, submission), knownIds = idsByName.get(name);
    // Join a legacy name-only attempt to an ID only if the name has one known ID.
    const id = submission.studentId || (knownIds?.size === 1 ? [...knownIds][0] : undefined);
    keepLatest(groups, id ? JSON.stringify([classKey(assignment, submission), 'id', id]) : name, submission);
  }
  return [...groups.values()];
}

/** A supplied roster is authoritative; ambiguous names never mark two students as submitted. */
export function getStudentSubmissionOverview(assignment: Assignment, submissions: Submission[], roster?: Student[]) {
  const scoped = submissions.filter(submission => submission.assignmentId === assignment.id);
  if (!roster) return {
    statisticsSubmissions: selectLatestStudentSubmissions(assignment, scoped),
    unsubmittedStudents: [] as Student[], unmatchedSubmissions: [] as Submission[]
  };
  const byId = new Map(roster.map(student => [student.id, student]));
  const byName = new Map<string, Student[]>();
  for (const student of roster) {
    const name = normalizedName(student.name);
    byName.set(name, [...(byName.get(name) || []), student]);
  }
  const groups = new Map<string, Submission>(), unmatchedSubmissions: Submission[] = [];
  for (const submission of scoped) {
    const name = normalizedName(submission.studentName);
    const expectedClass = normalizedClass(assignment.className), actualClass = normalizedClass(submission.className);
    const classMatches = !expectedClass || !actualClass || expectedClass === actualClass;
    const names = name && classMatches ? byName.get(name) : undefined;
    const student = submission.studentId ? byId.get(submission.studentId) : names?.length === 1 ? names[0] : undefined;
    if (!student) { unmatchedSubmissions.push(submission); continue; }
    keepLatest(groups, student.id, submission);
  }
  return { statisticsSubmissions: [...groups.values()], unmatchedSubmissions,
    unsubmittedStudents: roster.filter(student => !groups.has(student.id)) };
}
