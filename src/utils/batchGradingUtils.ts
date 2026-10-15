type BatchEntry = { source: 'online' | 'paper'; status: string };
export type BatchSourceFilter = 'all' | BatchEntry['source'];
export type BatchStatusFilter = 'all' | 'pending' | 'completed' | 'needs_review' | 'failed';

export function filterBatchGradingItems<T extends BatchEntry>(items: T[], source: BatchSourceFilter, status: BatchStatusFilter): T[] {
  return items.filter(item => (source === 'all' || item.source === source) && (status === 'all' || item.status === status));
}

export function selectBatchGradingItems<T extends BatchEntry>(items: T[], source: BatchSourceFilter,
  status: BatchStatusFilter, skipAlreadyGraded: boolean, onlyFailed = false): T[] {
  return filterBatchGradingItems(items, source, status).filter(item => onlyFailed ? item.status === 'failed'
    : skipAlreadyGraded ? item.status === 'pending' || item.status === 'failed' : item.status !== 'grading');
}
