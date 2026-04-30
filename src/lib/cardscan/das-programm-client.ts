// CardScan Module – das-programm.io GraphQL Client
// Dual-CRM Write mit Dry-Run-Modus und sequentieller Sub-Erstellung.
//
// Dry-Run: Wenn DAS_PROGRAMM_TOKEN_CRM1 oder _CRM2 leer oder "DRY_RUN" ist,
// wird der GraphQL-Call nicht ausgeführt, sondern nur geloggt.

import { logError, logInfo } from "@/lib/logger";
import type { ExtractedContactData } from "@/lib/cardscan/types";

const ROUTE_TAG = "/lib/cardscan/das-programm-client";

const ENDPOINT =
  process.env.DAS_PROGRAMM_ENDPOINT ||
  "https://app.das-programm.io/api/graphql";

// ─── GraphQL Mutations ─────────────────────────────────────────────

const CREATE_CUSTOMER_MUTATION = `
mutation CreateCustomer($payload: CustomerInputObjectType!) {
  createCustomer(payload: $payload) {
    id
    referenceNumber
    firstName
    lastName
    companyName
    email
  }
}`;

const CREATE_CUSTOMER_ADDRESS_MUTATION = `
mutation CreateCustomerAddress($payload: CustomerAddressInputObjectType!) {
  createCustomerAddress(payload: $payload) {
    id
    street
    houseNumber
    zip
    city
    countryCode
  }
}`;

const CREATE_CUSTOMER_CONTACT_PERSON_MUTATION = `
mutation CreateCustomerContactPerson($payload: CustomerContactPersonInputObjectType!) {
  createCustomerContactPerson(payload: $payload) {
    id
    firstName
    lastName
    role
    email
  }
}`;

const UPDATE_CUSTOMER_MUTATION = `
mutation UpdateCustomer($payload: CustomerInputObjectType!) {
  updateCustomer(payload: $payload) {
    id
    referenceNumber
    firstName
    lastName
    companyName
    email
  }
}`;

const CREATE_PROJECT_MUTATION = `
mutation CreateProject($payload: ProjectInputObjectType!) {
  createProject(payload: $payload) {
    id
    referenceNumber
    name
  }
}`;

export const CUSTOMER_SEARCH_QUERY = `
query SearchCustomers($search: QueryRequest!) {
  customerSearch(search: $search) {
    id
    referenceNumber
    firstName
    lastName
    companyName
    email
    phone
    mobile
    street
    zip
    city
    type
  }
}`;

// ─── Types ──────────────────────────────────────────────────────────

export interface CrmCustomerResult {
  customerId: string;
  referenceNumber: string;
}

export interface CrmWriteResult {
  status: "success" | "partial_success" | "failed" | "dry_run";
  customerId: string | null;
  referenceNumber: string | null;
  error: string | null;
  warnings: string[];
  durationMs: number;
}

export interface DualWriteResult {
  overallStatus: "success" | "partial_success" | "failed" | "dry_run";
  crm1: CrmWriteResult;
  crm2: CrmWriteResult;
}

export interface CustomerSearchResult {
  id: string;
  referenceNumber: string | null;
  firstName: string | null;
  lastName: string | null;
  companyName: string | null;
  email: string | null;
  phone: string | null;
  mobile: string | null;
  street: string | null;
  zip: string | null;
  city: string | null;
  type: string | null;
}

// ─── Helpers ────────────────────────────────────────────────────────

function isDryRun(token: string | undefined): boolean {
  return !token || token === "DRY_RUN" || token.trim() === "";
}

async function graphqlRequest<T>(
  token: string,
  query: string,
  variables: Record<string, unknown>
): Promise<T> {
  const res = await fetch(ENDPOINT, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "x-techni-api-token": token,
    },
    body: JSON.stringify({ query, variables }),
    signal: AbortSignal.timeout(15_000), // 15s Timeout
  });

  if (!res.ok) {
    const text = await res.text().catch(() => "");
    throw new Error(`GraphQL HTTP ${res.status}: ${text.slice(0, 200)}`);
  }

  const json = await res.json();

  if (json.errors && json.errors.length > 0) {
    const msg = json.errors.map((e: { message: string }) => e.message).join("; ");
    throw new Error(`GraphQL Error: ${msg}`);
  }

  return json.data;
}

// ─── Customer Search (für Duplikat-Check) ───────────────────────────

export async function searchCustomers(
  token: string,
  filters: { column: string; valueList: string[] }[]
): Promise<CustomerSearchResult[]> {
  if (isDryRun(token)) {
    logInfo(ROUTE_TAG, "DRY_RUN: searchCustomers übersprungen", { filters });
    return [];
  }

  const data = await graphqlRequest<{
    customerSearch: CustomerSearchResult[];
  }>(token, CUSTOMER_SEARCH_QUERY, {
    search: {
      currentPage: 0,
      limit: 20,
      orderList: [{ column: "createdOn", sortOrder: "DESC" }],
      filterList: filters,
    },
  });

  return data.customerSearch || [];
}

// ─── Sequentielle Kunden-Erstellung (innerhalb eines CRMs) ─────────

async function createCustomerInCrm(
  token: string,
  data: ExtractedContactData,
  crmLabel: string
): Promise<CrmWriteResult> {
  const start = Date.now();
  const warnings: string[] = [];

  // Dry-Run-Modus
  if (isDryRun(token)) {
    logInfo(ROUTE_TAG, `DRY_RUN: ${crmLabel} createCustomer übersprungen`, {
      customerType: data.customer_type,
      name: data.companyName || `${data.firstName} ${data.lastName}`,
    });
    return {
      status: "dry_run",
      customerId: `dry-run-${Date.now()}`,
      referenceNumber: `DRY-${crmLabel}`,
      error: null,
      warnings: ["Dry-Run-Modus: Kein echter API-Call"],
      durationMs: Date.now() - start,
    };
  }

  // Schritt 1: Kunde erstellen (Pflichtfelder: gender, type)
  let customerId: string;
  let referenceNumber: string;

  try {
    const customerPayload: Record<string, unknown> = {
      gender: data.gender ?? "m",
      type: data.customer_type,
      acquisitionChannel: "CardScan",
      locale: "de_DE",
    };

    if (data.firstName) customerPayload.firstName = data.firstName;
    if (data.lastName) customerPayload.lastName = data.lastName;
    if (data.companyName) customerPayload.companyName = data.companyName;
    if (data.email) customerPayload.email = data.email;
    if (data.phone) customerPayload.phone = data.phone;
    if (data.mobile) customerPayload.mobile = data.mobile;
    if (data.fax) customerPayload.fax = data.fax;
    if (data.vatId) customerPayload.vatId = data.vatId;
    if (data.title) customerPayload.title = data.title;
    if (data.letterSalutation) customerPayload.letterSalutation = data.letterSalutation;

    // Website + Notes → comment-Feld zusammenführen
    const commentParts: string[] = [];
    if (data.website) commentParts.push(`Website: ${data.website}`);
    if (data.notes) commentParts.push(data.notes);
    if (commentParts.length > 0) {
      customerPayload.comment = commentParts.join("\n");
    }

    const result = await graphqlRequest<{
      createCustomer: { id: string; referenceNumber: string };
    }>(token, CREATE_CUSTOMER_MUTATION, { payload: customerPayload });

    customerId = result.createCustomer.id;
    referenceNumber = result.createCustomer.referenceNumber;

    logInfo(ROUTE_TAG, `${crmLabel}: Kunde erstellt`, {
      customerId,
      referenceNumber,
    });
  } catch (err) {
    return {
      status: "failed",
      customerId: null,
      referenceNumber: null,
      error: err instanceof Error ? err.message : String(err),
      warnings,
      durationMs: Date.now() - start,
    };
  }

  // Schritt 2: Adresse (falls vorhanden) – Fehler = Warning, nicht Abbruch
  if (data.address && (data.address.street || data.address.city)) {
    try {
      const addressPayload: Record<string, unknown> = {
        customerId,
        type: "default",
      };
      if (data.address.street) addressPayload.street = data.address.street;
      if (data.address.houseNumber) addressPayload.houseNumber = data.address.houseNumber;
      if (data.address.zip) addressPayload.zip = data.address.zip;
      if (data.address.city) addressPayload.city = data.address.city;
      if (data.address.countryCode) addressPayload.countryCode = data.address.countryCode;

      await graphqlRequest(token, CREATE_CUSTOMER_ADDRESS_MUTATION, {
        payload: addressPayload,
      });

      logInfo(ROUTE_TAG, `${crmLabel}: Adresse erstellt`, { customerId });
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      warnings.push(`Adresse konnte nicht erstellt werden: ${msg}`);
      logError(ROUTE_TAG, `${crmLabel}: Adresse fehlgeschlagen`, err);
    }
  }

  // Schritt 3: Ansprechpartner (nur bei Firma mit Kontaktperson) – Fehler = Warning
  if (
    data.customer_type === "company" &&
    data.contactPerson &&
    (data.contactPerson.firstName || data.contactPerson.lastName)
  ) {
    try {
      const cpPayload: Record<string, unknown> = {
        customerId,
        salutation: data.contactPerson.salutation ?? "m",
      };
      if (data.contactPerson.firstName) cpPayload.firstName = data.contactPerson.firstName;
      if (data.contactPerson.lastName) cpPayload.lastName = data.contactPerson.lastName;
      if (data.contactPerson.title) cpPayload.title = data.contactPerson.title;
      if (data.contactPerson.role) cpPayload.role = data.contactPerson.role;
      if (data.contactPerson.email) cpPayload.email = data.contactPerson.email;
      if (data.contactPerson.phone) cpPayload.phone = data.contactPerson.phone;
      if (data.contactPerson.mobile) cpPayload.mobile = data.contactPerson.mobile;

      await graphqlRequest(token, CREATE_CUSTOMER_CONTACT_PERSON_MUTATION, {
        payload: cpPayload,
      });

      logInfo(ROUTE_TAG, `${crmLabel}: Ansprechpartner erstellt`, { customerId });
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      warnings.push(`Ansprechpartner konnte nicht erstellt werden: ${msg}`);
      logError(ROUTE_TAG, `${crmLabel}: Ansprechpartner fehlgeschlagen`, err);
    }
  }

  return {
    status: warnings.length > 0 ? "partial_success" : "success",
    customerId,
    referenceNumber,
    error: null,
    warnings,
    durationMs: Date.now() - start,
  };
}

// ─── Dual-Write in beide CRMs (parallel) ───────────────────────────

export interface DualWriteOptions {
  /** F7.3: Wenn ein CRM bereits eine customer_id hat, wird dieser Write übersprungen.
   *  Verhindert Duplikate bei Retry nach partial_success. */
  existingCrm1CustomerId?: string | null;
  existingCrm2CustomerId?: string | null;
  /** F7.3: Optional capture_id als externe Referenz (Idempotenz-Marker im Log). */
  captureId?: string;
}

export async function createInBothCRMs(
  data: ExtractedContactData,
  options: DualWriteOptions = {},
): Promise<DualWriteResult> {
  const token1 = process.env.DAS_PROGRAMM_TOKEN_CRM1;
  const token2 = process.env.DAS_PROGRAMM_TOKEN_CRM2;

  // F7.3 Idempotenz-Skip: bei bekannter customer_id keinen erneuten Create
  const skipCrm1 = !!options.existingCrm1CustomerId;
  const skipCrm2 = !!options.existingCrm2CustomerId;

  if (skipCrm1 || skipCrm2) {
    logInfo(ROUTE_TAG, "Dual-Write Idempotenz-Skip", {
      capture_id: options.captureId,
      skip_crm1: skipCrm1,
      skip_crm2: skipCrm2,
      existing_crm1: options.existingCrm1CustomerId,
      existing_crm2: options.existingCrm2CustomerId,
    });
  }

  const skippedResult = (existingId: string): CrmWriteResult => ({
    status: "success",
    customerId: existingId,
    referenceNumber: null,
    error: null,
    warnings: ["idempotenz_skip_already_exists"],
    durationMs: 0,
  });

  // Parallel über beide CRMs, innerhalb sequentiell
  const [crm1Result, crm2Result] = await Promise.allSettled([
    skipCrm1
      ? Promise.resolve(skippedResult(options.existingCrm1CustomerId!))
      : createCustomerInCrm(token1 || "", data, "CRM1"),
    skipCrm2
      ? Promise.resolve(skippedResult(options.existingCrm2CustomerId!))
      : createCustomerInCrm(token2 || "", data, "CRM2"),
  ]);

  const crm1: CrmWriteResult =
    crm1Result.status === "fulfilled"
      ? crm1Result.value
      : {
          status: "failed",
          customerId: null,
          referenceNumber: null,
          error: String(crm1Result.reason),
          warnings: [],
          durationMs: 0,
        };

  const crm2: CrmWriteResult =
    crm2Result.status === "fulfilled"
      ? crm2Result.value
      : {
          status: "failed",
          customerId: null,
          referenceNumber: null,
          error: String(crm2Result.reason),
          warnings: [],
          durationMs: 0,
        };

  // Gesamt-Status berechnen
  const bothDryRun = crm1.status === "dry_run" && crm2.status === "dry_run";
  const bothSuccess =
    (crm1.status === "success" || crm1.status === "partial_success") &&
    (crm2.status === "success" || crm2.status === "partial_success");
  const anySuccess =
    crm1.status === "success" ||
    crm1.status === "partial_success" ||
    crm2.status === "success" ||
    crm2.status === "partial_success";

  let overallStatus: DualWriteResult["overallStatus"];
  if (bothDryRun) {
    overallStatus = "dry_run";
  } else if (bothSuccess) {
    overallStatus = "success";
  } else if (anySuccess) {
    overallStatus = "partial_success";
  } else {
    overallStatus = "failed";
  }

  logInfo(ROUTE_TAG, "Dual-Write abgeschlossen", {
    overallStatus,
    crm1Status: crm1.status,
    crm2Status: crm2.status,
  });

  return { overallStatus, crm1, crm2 };
}

// ─── Kunden-Update (für Duplikat-Merge) ─────────────────────────────

export interface CrmUpdateResult {
  status: "success" | "failed" | "dry_run";
  error: string | null;
}

/**
 * Aktualisiert einen bestehenden Kunden in einem CRM.
 * Wird verwendet wenn der Duplikat-Check einen Treffer findet
 * und der User "Daten ergänzen" wählt statt "Neu anlegen".
 */
export async function updateCustomerInCrm(
  token: string,
  customerId: string,
  data: ExtractedContactData,
  crmLabel: string
): Promise<CrmUpdateResult> {
  if (isDryRun(token)) {
    logInfo(ROUTE_TAG, `DRY_RUN: ${crmLabel} updateCustomer übersprungen`, { customerId });
    return { status: "dry_run", error: null };
  }

  try {
    const payload: Record<string, unknown> = {
      id: customerId,
      gender: data.gender ?? "m",
      type: data.customer_type,
    };

    // Nur nicht-leere Felder senden (damit bestehende Daten nicht überschrieben werden)
    if (data.firstName) payload.firstName = data.firstName;
    if (data.lastName) payload.lastName = data.lastName;
    if (data.companyName) payload.companyName = data.companyName;
    if (data.email) payload.email = data.email;
    if (data.phone) payload.phone = data.phone;
    if (data.mobile) payload.mobile = data.mobile;
    if (data.fax) payload.fax = data.fax;
    if (data.vatId) payload.vatId = data.vatId;
    if (data.title) payload.title = data.title;
    if (data.letterSalutation) payload.letterSalutation = data.letterSalutation;

    await graphqlRequest(token, UPDATE_CUSTOMER_MUTATION, { payload });

    logInfo(ROUTE_TAG, `${crmLabel}: Kunde aktualisiert`, { customerId });
    return { status: "success", error: null };
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    logError(ROUTE_TAG, `${crmLabel}: Update fehlgeschlagen`, err);
    return { status: "failed", error: msg };
  }
}

// ─── Projekt-Erstellung ─────────────────────────────────────────────

export interface CrmProjectResult {
  status: "success" | "failed" | "dry_run";
  projectId: string | null;
  referenceNumber: string | null;
  error: string | null;
}

/**
 * Erstellt ein Projekt im CRM, verknüpft mit einem Kunden.
 */
export async function createProjectInCrm(
  token: string,
  customerId: string,
  projectName: string,
  crmLabel: string,
  customerAddressId?: string
): Promise<CrmProjectResult> {
  if (isDryRun(token)) {
    logInfo(ROUTE_TAG, `DRY_RUN: ${crmLabel} createProject übersprungen`, { customerId, projectName });
    return { status: "dry_run", projectId: null, referenceNumber: null, error: null };
  }

  try {
    const payload: Record<string, unknown> = {
      name: projectName,
      customerId,
      status: "active",
    };

    if (customerAddressId) payload.objectAddressId = customerAddressId;

    const result = await graphqlRequest<{
      createProject: { id: string; referenceNumber: string; name: string };
    }>(token, CREATE_PROJECT_MUTATION, { payload });

    logInfo(ROUTE_TAG, `${crmLabel}: Projekt erstellt`, {
      projectId: result.createProject.id,
      name: result.createProject.name,
    });

    return {
      status: "success",
      projectId: result.createProject.id,
      referenceNumber: result.createProject.referenceNumber,
      error: null,
    };
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    logError(ROUTE_TAG, `${crmLabel}: Projekt-Erstellung fehlgeschlagen`, err);
    return { status: "failed", projectId: null, referenceNumber: null, error: msg };
  }
}
