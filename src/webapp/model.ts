export type AppRole = 'owner' | 'worker';
export type WorkerLocale = 'vi' | 'ne';

export type AppScreen =
  | 'role'
  | 'worker-entry'
  | 'owner-home'
  | 'owner-team'
  | 'owner-record'
  | 'owner-review'
  | 'owner-storyboard'
  | 'owner-current'
  | 'owner-change'
  | 'owner-change-confirm'
  | 'owner-brief'
  | 'worker-latest'
  | 'worker-step'
  | 'worker-link-error';

export interface ScreenProps {
  go: (screen: AppScreen) => void;
}
