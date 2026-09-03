import type { WorkerLocale } from './model';

export type TaskCode =
  | 'ONION_HARVEST'
  | 'ONION_COLLECT'
  | 'BAGGING'
  | 'LOADING'
  | 'WAREHOUSE_TRANSPORT'
  | 'STACKING';

export type Interpretation = 'READY' | 'AMBIGUOUS' | 'UNSUPPORTED';
export type RiskLevel = 'LOW' | 'HIGH' | 'UNKNOWN';
export type OverrideReason = 'EXPERIENCED_WORKER' | 'IN_PERSON_BRIEFING' | 'OWNER_ACCEPTED_OTHER';
export type NationalityCode = 'VN' | 'PH' | 'LA' | 'KH' | 'TH' | 'NP' | 'MM' | 'MN';

export interface TeamMember {
  member_id: string;
  display_name: string;
  nationality_code: NationalityCode;
  language_code: WorkerLocale;
  joined_at: string;
}

export interface TodayWorkTeam {
  team_id: string;
  work_date: string;
  status: 'ACTIVE';
  join_url: string;
  expires_at: string;
  members: TeamMember[];
}

export interface Quantity {
  value: number;
  unit: string;
}

export interface Ambiguity {
  field: string;
  message: string;
  blocking: boolean;
  kind: 'SAFETY' | 'TASK' | 'LOCATION' | 'QUANTITY' | 'TIME' | 'OTHER';
}

export interface Translation {
  segment: 'ACTION' | 'QUANTITY' | 'ORDER' | 'SAFETY' | 'LOCATION' | 'OTHER';
  language_code: WorkerLocale;
  text: string;
  source: 'OFFICIAL_GUIDE' | 'AI_TRANSLATION' | 'DETERMINISTIC';
  verified: boolean;
  guide_lookup: 'HIT' | 'MISS' | 'NOT_APPLICABLE';
  phrase_key: string | null;
  source_page: number | null;
  source_url: string | null;
  license: string | null;
}

export interface WorkStep {
  sequence: number;
  task_code: TaskCode | null;
  title_ko: string;
  description_ko: string;
  video: {
    asset_id: string;
    task_code: string;
    video_url: string;
    provenance: 'AI_GENERATED_PREGENERATED';
    review_status: 'PENDING' | 'APPROVED' | 'REJECTED';
    safety_level: 'LOW' | 'HIGH';
    captions_text: string;
  } | null;
  audio_url: string | null;
  delivery_mode: 'VIDEO' | 'TEXT_TTS' | 'TEXT';
  unsupported_reason: string | null;
  translations: Translation[];
}

export interface WorkState {
  task_family: 'ONION';
  location: {
    raw_text: string | null;
    kind: 'DEICTIC' | 'NAMED' | 'UNSPECIFIED';
    canonical_name: string | null;
  };
  location_display: string;
  quantity: Quantity | 'UNSPECIFIED' | null;
  deadline: string | null;
  safety: string[];
  notes: string | null;
  steps: WorkStep[];
}

export interface RiskAssessment {
  level: RiskLevel;
  reasons: string[];
  schema_version: '1';
  contract_version: 'safety-policy-v1';
}

export interface WorkDraft {
  draft_id: string;
  draft_revision: number;
  summary_ko: string;
  interpretation: Interpretation;
  state: WorkState;
  ambiguities: Ambiguity[];
  risk_assessment: RiskAssessment;
  transcript: string;
  schema_version: '1';
  contract_version: 'structure-v1';
}

export interface WorkVersion {
  version: number;
  lifecycle: 'PUBLISHED' | 'SUPERSEDED';
  state: WorkState;
  risk_assessment: RiskAssessment;
  ambiguity_override?: boolean;
  override_reason?: OverrideReason | null;
  overridden_at?: string | null;
  transcript?: string;
}

export interface OwnerWorkSession {
  session_id: string;
  current_version: number;
  lifecycle: 'PUBLISHED';
  version: WorkVersion;
}

export interface QuantityChangePreview {
  interpretation: 'READY' | 'AMBIGUOUS';
  quantity: Quantity | null;
  expected_version: number;
  ambiguities: Ambiguity[];
  schema_version: '1';
  contract_version: 'quantity-change-v1';
}

export interface WorkerAssignment {
  language_code: WorkerLocale;
  session_id: string;
  version: number;
  lifecycle: 'PUBLISHED';
  context: LocalizedWorkerContext;
  steps: WorkerStep[];
  badge_codes: WorkerBadgeCode[];
}

export interface Briefing {
  session_id: string;
  version: number;
  language_code: WorkerLocale;
  context: LocalizedWorkerContext;
  steps: WorkerStep[];
  badge_codes: WorkerBadgeCode[];
}

export interface LocalizedWorkerContext {
  location_display: string;
  quantity_display: string;
  deadline_display: string | null;
  safety: string[];
  notes: string | null;
}

export type WorkerBadgeCode = 'NEEDS_CONFIRMATION' | 'DEMO_FALLBACK';

export interface WorkerStep {
  sequence: number;
  task_code: TaskCode | null;
  title: string;
  description: string;
  video: WorkStep['video'];
  audio_url: string | null;
  delivery_mode: WorkStep['delivery_mode'];
  unsupported_reason: string | null;
  segments: Translation[];
}

export interface IssuedWorkerLink {
  session_id: string;
  issued_worker_link: {
    language_code: WorkerLocale;
    url: string;
    expires_at: string;
  };
}

export type ApiErrorCode =
  | 'UNAUTHORIZED'
  | 'NOT_FOUND'
  | 'ACCESS_DENIED'
  | 'LINK_EXPIRED'
  | 'VERSION_CONFLICT'
  | 'OVERRIDE_NOT_ALLOWED'
  | 'SCHEMA_INVALID'
  | 'PROVIDER_UNAVAILABLE'
  | 'RATE_LIMITED'
  | 'INTERNAL_ERROR';

export interface OwnerSession {
  authenticated: true;
  expires_at: string;
}
