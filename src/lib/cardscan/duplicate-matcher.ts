// CardScan Module – Duplikat-Erkennung
// Sucht parallel in beiden CRMs nach möglichen Duplikaten.
// Strategien: E-Mail exakt, Firmenname+Stadt, Name+PLZ, Telefon-Suffix.

import { logInfo } from "@/lib/logger";
import {
  searchCustomers,
  type CustomerSearchResult,
} from "@/lib/cardscan/das-programm-client";
import type {
  ExtractedContactData,
  DuplicateMatch,
  CrmTarget,
} from "@/lib/cardscan/types";

const ROUTE_TAG = "/lib/cardscan/duplicate-matcher";

interface DuplicateSearchResult {
  matches: DuplicateMatch[];
  durationMs: number;
}

/**
 * Normalisiert eine Telefonnummer auf die letzten 8 Ziffern (für Suffix-Suche).
 */
function phoneLastDigits(phone: string | null, count = 8): string | null {
  if (!phone) return null;
  const digits = phone.replace(/\D/g, "");
  if (digits.length < count) return null;
  return digits.slice(-count);
}

/**
 * Berechnet Levenshtein-Ähnlichkeit zwischen zwei Strings (0.0-1.0).
 */
function similarity(a: string, b: string): number {
  const al = a.toLowerCase().trim();
  const bl = b.toLowerCase().trim();
  if (al === bl) return 1.0;
  if (al.length === 0 || bl.length === 0) return 0.0;

  const matrix: number[][] = [];
  for (let i = 0; i <= al.length; i++) {
    matrix[i] = [i];
  }
  for (let j = 0; j <= bl.length; j++) {
    matrix[0][j] = j;
  }
  for (let i = 1; i <= al.length; i++) {
    for (let j = 1; j <= bl.length; j++) {
      const cost = al[i - 1] === bl[j - 1] ? 0 : 1;
      matrix[i][j] = Math.min(
        matrix[i - 1][j] + 1,
        matrix[i][j - 1] + 1,
        matrix[i - 1][j - 1] + cost
      );
    }
  }
  const maxLen = Math.max(al.length, bl.length);
  return 1 - matrix[al.length][bl.length] / maxLen;
}

/**
 * Vergleicht einen CRM-Treffer gegen die extrahierten Daten.
 * Gibt DuplicateMatch zurück, oder null wenn kein Match.
 */
function evaluateMatch(
  crm: CrmTarget,
  hit: CustomerSearchResult,
  data: ExtractedContactData
): DuplicateMatch | null {
  // Strategie 1: Exakter E-Mail-Match → Hard Duplicate (99%)
  if (
    data.email &&
    hit.email &&
    data.email.toLowerCase() === hit.email.toLowerCase()
  ) {
    return {
      crm,
      customerId: hit.id,
      referenceNumber: hit.referenceNumber,
      score: 0.99,
      reason: `Gleiche E-Mail: ${hit.email}`,
      firstName: hit.firstName,
      lastName: hit.lastName,
      companyName: hit.companyName,
      email: hit.email,
    };
  }

  // Strategie 2: Firmenname exakt + Ort exakt → Strong Match (85%)
  if (
    data.companyName &&
    hit.companyName &&
    data.address?.city &&
    hit.city
  ) {
    const nameSim = similarity(data.companyName, hit.companyName);
    const citySim = similarity(data.address.city, hit.city);
    if (nameSim > 0.85 && citySim > 0.85) {
      return {
        crm,
        customerId: hit.id,
        referenceNumber: hit.referenceNumber,
        score: 0.85,
        reason: `Firma "${hit.companyName}" in ${hit.city}`,
        firstName: hit.firstName,
        lastName: hit.lastName,
        companyName: hit.companyName,
        email: hit.email,
      };
    }
  }

  // Strategie 3: Vor-/Nachname + gleiche E-Mail-Domain → Strong Match (85%)
  if (
    data.firstName &&
    data.lastName &&
    hit.firstName &&
    hit.lastName &&
    data.email &&
    hit.email
  ) {
    const firstSim = similarity(data.firstName, hit.firstName);
    const lastSim = similarity(data.lastName, hit.lastName);
    const dataDomain = data.email.split("@")[1]?.toLowerCase();
    const hitDomain = hit.email.split("@")[1]?.toLowerCase();

    if (firstSim > 0.9 && lastSim > 0.9 && dataDomain && dataDomain === hitDomain) {
      return {
        crm,
        customerId: hit.id,
        referenceNumber: hit.referenceNumber,
        score: 0.85,
        reason: `${hit.firstName} ${hit.lastName} (gleiche Domain: @${hitDomain})`,
        firstName: hit.firstName,
        lastName: hit.lastName,
        companyName: hit.companyName,
        email: hit.email,
      };
    }
  }

  // Strategie 4: Firmenname fuzzy (> 0.85) + gleicher Ort → Soft Match (65%)
  if (data.companyName && hit.companyName && data.address?.city && hit.city) {
    const nameSim = similarity(data.companyName, hit.companyName);
    const cityExact =
      data.address.city.toLowerCase() === hit.city.toLowerCase();
    if (nameSim > 0.7 && cityExact) {
      return {
        crm,
        customerId: hit.id,
        referenceNumber: hit.referenceNumber,
        score: 0.65,
        reason: `Ähnliche Firma "${hit.companyName}" in ${hit.city}`,
        firstName: hit.firstName,
        lastName: hit.lastName,
        companyName: hit.companyName,
        email: hit.email,
      };
    }
  }

  // Strategie 5: Telefonnummer-Suffix → Strong Match (80%)
  const dataPhone = phoneLastDigits(data.phone) || phoneLastDigits(data.mobile);
  const hitPhone = phoneLastDigits(hit.phone) || phoneLastDigits(hit.mobile);
  if (dataPhone && hitPhone && dataPhone === hitPhone) {
    return {
      crm,
      customerId: hit.id,
      referenceNumber: hit.referenceNumber,
      score: 0.8,
      reason: `Gleiche Telefonnummer (Suffix: ...${dataPhone.slice(-4)})`,
      firstName: hit.firstName,
      lastName: hit.lastName,
      companyName: hit.companyName,
      email: hit.email,
    };
  }

  return null;
}

/**
 * Sucht in einem CRM nach Duplikaten basierend auf den extrahierten Daten.
 */
async function searchInCrm(
  token: string,
  crm: CrmTarget,
  data: ExtractedContactData
): Promise<DuplicateMatch[]> {
  const matches: DuplicateMatch[] = [];
  const seenIds = new Set<string>();

  // Verschiedene Such-Strategien parallel
  const searchPromises: Promise<CustomerSearchResult[]>[] = [];

  // 1. E-Mail-Suche (höchste Priorität)
  if (data.email) {
    searchPromises.push(
      searchCustomers(token, [{ column: "email", valueList: [data.email] }])
    );
  }

  // 2. Firmenname-Suche
  if (data.companyName) {
    const filters: { column: string; valueList: string[] }[] = [
      { column: "companyName", valueList: [data.companyName] },
    ];
    if (data.address?.city) {
      filters.push({ column: "city", valueList: [data.address.city] });
    }
    searchPromises.push(searchCustomers(token, filters));
  }

  // 3. Nachname + PLZ
  if (data.lastName && data.address?.zip) {
    searchPromises.push(
      searchCustomers(token, [
        { column: "lastName", valueList: [data.lastName] },
        { column: "zip", valueList: [data.address.zip] },
      ])
    );
  }

  // 4. Telefon-Suffix
  const phoneSuffix = phoneLastDigits(data.phone) || phoneLastDigits(data.mobile);
  if (phoneSuffix) {
    searchPromises.push(
      searchCustomers(token, [{ column: "phone", valueList: [phoneSuffix] }])
    );
  }

  // Alle Suchen parallel, max 5 Sekunden
  const results = await Promise.allSettled(
    searchPromises.map((p) =>
      Promise.race([p, new Promise<CustomerSearchResult[]>((_, reject) =>
        setTimeout(() => reject(new Error("Timeout")), 5000)
      )])
    )
  );

  // Treffer auswerten
  for (const result of results) {
    if (result.status !== "fulfilled") continue;
    for (const hit of result.value) {
      if (seenIds.has(hit.id)) continue;
      const match = evaluateMatch(crm, hit, data);
      if (match) {
        seenIds.add(hit.id);
        matches.push(match);
      }
    }
  }

  // Nach Score sortieren (höchster zuerst)
  matches.sort((a, b) => b.score - a.score);

  return matches;
}

/**
 * Sucht parallel in beiden CRMs nach Duplikaten.
 */
export async function findDuplicates(
  data: ExtractedContactData
): Promise<DuplicateSearchResult> {
  const start = Date.now();

  const token1 = process.env.DAS_PROGRAMM_TOKEN_CRM1 || "";
  const token2 = process.env.DAS_PROGRAMM_TOKEN_CRM2 || "";

  const [crm1Matches, crm2Matches] = await Promise.allSettled([
    searchInCrm(token1, "crm1", data),
    searchInCrm(token2, "crm2", data),
  ]);

  const matches: DuplicateMatch[] = [
    ...(crm1Matches.status === "fulfilled" ? crm1Matches.value : []),
    ...(crm2Matches.status === "fulfilled" ? crm2Matches.value : []),
  ];

  // Sortiert nach Score
  matches.sort((a, b) => b.score - a.score);

  const durationMs = Date.now() - start;

  logInfo(ROUTE_TAG, "Duplikat-Suche abgeschlossen", {
    totalMatches: matches.length,
    crm1Matches: crm1Matches.status === "fulfilled" ? crm1Matches.value.length : 0,
    crm2Matches: crm2Matches.status === "fulfilled" ? crm2Matches.value.length : 0,
    durationMs,
  });

  return { matches, durationMs };
}
