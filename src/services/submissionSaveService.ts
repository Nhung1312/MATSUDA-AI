import type { Submission } from '../types';
import { StorageService } from './storageService';
import { FirestoreService } from './firestoreService';
import { compactSubmissionImages } from '../utils/submissionImageUtils';

export interface SubmissionSaveResult { localSaved: boolean; cloudSaved: boolean }
const cloudQueues = new Map<string, Promise<boolean>>();

/** Save locally first; serialize confirmed cloud writes for the same submission. */
export async function saveSubmissionConfirmed(submission: Submission): Promise<SubmissionSaveResult> {
  const snapshot: Submission = JSON.parse(JSON.stringify(compactSubmissionImages(submission)));
  let localSaved = false;
  try {
    // The legacy default still auto-syncs; this path must send only one cloud write.
    StorageService.saveSubmission(snapshot, { syncCloud: false });
    localSaved = true;
  } catch (error) { console.warn('[SubmissionSave] Không lưu được bản trên máy:', error); }

  const previous = cloudQueues.get(snapshot.id);
  const cloudTask = (previous || Promise.resolve(true)).then(async () => {
    let timeout: ReturnType<typeof setTimeout> | undefined;
    try {
      return await Promise.race([
        FirestoreService.saveResult(snapshot).then(() => true).catch(error => {
          console.warn('[SubmissionSave] Chưa lưu được lên cloud:', error);
          return false;
        }),
        new Promise<boolean>(resolve => { timeout = setTimeout(() => resolve(false), 15000); })
      ]);
    } finally { if (timeout !== undefined) clearTimeout(timeout); }
  });
  cloudQueues.set(snapshot.id, cloudTask);
  const cloudSaved = await cloudTask;
  if (cloudQueues.get(snapshot.id) === cloudTask) cloudQueues.delete(snapshot.id);
  if (typeof window !== 'undefined') window.dispatchEvent(new CustomEvent('submissions-updated'));
  return { localSaved, cloudSaved };
}
