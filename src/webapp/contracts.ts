import type { WorkerLocale } from './model';

export type V2TaskCode =
  | 'ONION_HARVEST'
  | 'ONION_TRIMMING'
  | 'ONION_SORTING'
  | 'ONION_TRANSPORT'
  | 'STRAWBERRY_HARVEST'
  | 'STRAWBERRY_SORTING'
  | 'STRAWBERRY_INSPECTION'
  | 'STRAWBERRY_PACKING';

// Legacy values are query-only. Keep this open so old stored rows remain readable.
export type LegacyV1TaskCode = string;

export type Interpretation = 'READY' | 'AMBIGUOUS' | 'UNSUPPORTED';
export type RiskLevel = 'LOW' | 'HIGH' | 'UNKNOWN';
export type OverrideReason = 'EXPERIENCED_WORKER' | 'IN_PERSON_BRIEFING' | 'OWNER_ACCEPTED_OTHER';
export interface TeamMember {
  member_id: string;
  display_name: string;
  language_code: WorkerLocale;
  joined_at: string;
  assignment_session_ids: string[];
  assignment_receipts?: AssignmentReceipt[];
}

export interface AssignmentReceipt {
  work_session_id: string;
  current_version: number;
  acknowledged_version: number | null;
  acknowledged_at: string | null;
}

export interface TeamAssignmentsResponse {
  assignments: WorkerAssignment[];
  receipts: AssignmentReceipt[];
}

export interface TodayWorkTeam {
  team_id: string;
  work_date: string;
  status: 'ACTIVE';
  join_url: string | null;
  expires_at: string;
  members: TeamMember[];
}

export interface TeamAssignmentMeta {
  member_id: string;
  work_session_id: string;
  assigned_at: string;
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
  task_code: LegacyV1TaskCode | V2TaskCode | null;
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
  task_family: 'ONION' | 'STRAWBERRY';
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
  risk_assessment: RiskAssessment;
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
  transcript: string;
  schema_version: '2';
  contract_version: 'structure-v2';
  ontology_version: 'ontology-v2';
}

export interface WorkVersion {
  version: number;
  lifecycle: 'PUBLISHED' | 'SUPERSEDED';
  state: WorkState;
  ambiguity_override?: boolean;
  override_reason?: OverrideReason | null;
  overridden_at?: string | null;
  transcript?: string;
}

export interface OwnerWorkSession {
  session_id: string;
  current_version: number;
  contract_version: 'structure-v1' | 'structure-v2';
  ontology_version: 'ontology-v1' | 'ontology-v2';
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

export interface LocalizedWorkerContext {
  location_display: string;
  quantity_display: string;
  deadline_display: string | null;
  safety: string[];
  notes: string | null;
}

export type WorkerBadgeCode = 'NEEDS_CONFIRMATION' | 'DEMO_FALLBACK' | 'LEGACY_READ_ONLY';

export interface WorkerStep {
  sequence: number;
  task_code: LegacyV1TaskCode | V2TaskCode | null;
  title: string;
  description: string;
  video: WorkStep['video'];
  audio_url: string | null;
  tts_status: 'READY' | 'TEXT_FALLBACK' | 'UNAVAILABLE';
  tts_hash: string | null;
  delivery_mode: WorkStep['delivery_mode'];
  unsupported_reason: string | null;
  segments: Translation[];
}

interface LegacyWorkerBriefingBase {
  language_code: WorkerLocale;
  session_id: string;
  version: number;
  lifecycle: 'PUBLISHED';
  context: LocalizedWorkerContext;
  steps: WorkerStep[];
  badge_codes: WorkerBadgeCode[];
  source_detail: Translation[];
}

export interface LegacyWorkerBriefing extends LegacyWorkerBriefingBase {
  contract_version: 'structure-v1';
}

export interface V2WorkerContext {
  task_family: 'ONION' | 'STRAWBERRY';
  location_display: string;
  quantity: Quantity | 'UNSPECIFIED' | null;
  deadline: string | null;
  safety: string[];
  notes: string | null;
}

export type WorkerBriefingBadge = 'AMBIGUITY' | 'UNSUPPORTED' | 'TEXT_TTS_FALLBACK' | 'DEMO_FALLBACK';

export interface V2WorkerStep {
  sequence: number;
  task_code: V2TaskCode | null;
  title: string;
  description: string;
  delivery_mode: 'VIDEO' | 'TEXT_TTS' | 'TEXT';
}

export interface WorkerSourceDetail {
  step_sequence: number | null;
  segment: Translation['segment'];
  source: Translation['source'];
  guide_lookup: Translation['guide_lookup'];
  verified: boolean;
  source_page: number | null;
  source_url: string | null;
  license: string | null;
}

export interface WorkerTts {
  status: 'READY' | 'FALLBACK' | 'UNAVAILABLE';
  text_hash: string | null;
  audio_url: string | null;
}

export interface WorkerVideo {
  step_sequence: number;
  asset_id: string;
  task_code: V2TaskCode;
  video_url: string;
  provenance: 'AI_GENERATED_PREGENERATED';
  review_status: 'APPROVED';
  safety_level: 'LOW';
  captions_text: string;
}

export interface V2WorkerBriefing {
  session_id: string;
  version: number;
  contract_version: 'worker-briefing-v2';
  ontology_version: 'ontology-v2';
  language_code: WorkerLocale;
  context: V2WorkerContext;
  badges: WorkerBriefingBadge[];
  steps: V2WorkerStep[];
  source_detail: WorkerSourceDetail[];
  tts: WorkerTts;
  video: WorkerVideo[];
}

export type WorkerBriefing = LegacyWorkerBriefing | V2WorkerBriefing;
export type WorkerAssignment = WorkerBriefing;
export type Briefing = WorkerBriefing;

export interface IssuedWorkerLink {
  session_id: string;
  issued_worker_link: {
    language_code: WorkerLocale;
    url: string;
    expires_at: string;
  };
}

export interface InitialPublishResult {
  work_session: OwnerWorkSession;
  issued_worker_link: IssuedWorkerLink | null;
}

export type ApiErrorCode =
  | 'UNAUTHORIZED'
  | 'NOT_FOUND'
  | 'ACCESS_DENIED'
  | 'LINK_EXPIRED'
  | 'VERSION_CONFLICT'
  | 'LEGACY_READ_ONLY'
  | 'OVERRIDE_NOT_ALLOWED'
  | 'AUDIO_UNCLEAR'
  | 'SCHEMA_INVALID'
  | 'PROVIDER_UNAVAILABLE'
  | 'RATE_LIMITED'
  | 'INTERNAL_ERROR';

export interface OwnerSession {
  authenticated: true;
  expires_at: string;
  team?: { team_id: string; status: 'PENDING' | 'ACTIVE'; expires_at: string; management_url: string | null; pin: string | null } | null;
  farm: {
    code: string;
    display_name: string;
  };
}
