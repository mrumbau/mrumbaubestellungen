// CardScan Module – TypeScript Types

export type CardScanSourceType = "image" | "text" | "url" | "file" | "clipboard" | "share";

export type CardScanStatus =
  | "pending"
  | "extracting"
  | "review"
  | "writing"
  | "success"
  | "partial_success"
  | "failed"
  | "discarded";

export type CrmWriteStatus = "pending" | "success" | "failed" | "skipped";

export type CrmTarget = "crm1" | "crm2";

export type CustomerType = "company" | "private" | "publicSector";

export type Gender = "m" | "f" | "family";

export type ContactPersonSalutation = "m" | "f";

export interface CardScanCapture {
  id: string;
  created_at: string;
  updated_at: string;
  user_id: string;
  source_type: CardScanSourceType;
  source_meta: Record<string, unknown> | null;
  raw_image_path: string | null;
  raw_text: string | null;
  extracted_data: ExtractedContactData | null;
  confidence_scores: ConfidenceScores | null;
  final_data: ExtractedContactData | null;
  crm1_customer_id: string | null;
  crm1_reference_number: string | null;
  crm1_status: CrmWriteStatus | null;
  crm1_error: string | null;
  crm2_customer_id: string | null;
  crm2_reference_number: string | null;
  crm2_status: CrmWriteStatus | null;
  crm2_error: string | null;
  status: CardScanStatus;
  duplicate_matches: DuplicateMatch[] | null;
  duplicate_override: boolean;
  ocr_duration_ms: number | null;
  llm_duration_ms: number | null;
  crm1_duration_ms: number | null;
  crm2_duration_ms: number | null;
}

export interface ExtractedContactData {
  customer_type: CustomerType;
  gender: Gender | null;
  title: string | null;
  firstName: string | null;
  lastName: string | null;
  companyName: string | null;
  email: string | null;
  phone: string | null;
  mobile: string | null;
  fax: string | null;
  website: string | null;
  vatId: string | null;
  address: ExtractedAddress | null;
  contactPerson: ExtractedContactPerson | null;
  notes: string | null;
}

export interface ExtractedAddress {
  street: string | null;
  houseNumber: string | null;
  zip: string | null;
  city: string | null;
  countryCode: string | null;
}

export interface ExtractedContactPerson {
  salutation: ContactPersonSalutation | null;
  firstName: string | null;
  lastName: string | null;
  title: string | null;
  role: string | null;
  email: string | null;
  phone: string | null;
  mobile: string | null;
}

export interface ConfidenceScores {
  overall: number;
  [fieldKey: string]: number;
}

export interface DuplicateMatch {
  crm: CrmTarget;
  customerId: string;
  referenceNumber: string | null;
  score: number;
  reason: string;
  firstName: string | null;
  lastName: string | null;
  companyName: string | null;
  email: string | null;
}

export interface CardScanSyncError {
  id: string;
  created_at: string;
  user_id: string;
  capture_id: string;
  crm: CrmTarget;
  error_type: string;
  error_message: string;
  error_details: Record<string, unknown> | null;
  acknowledged: boolean;
  acknowledged_at: string | null;
  acknowledged_by: string | null;
}
