import axios, { AxiosInstance, AxiosError } from "axios";

export const QUICKBASE_BASE_URL = "https://api.quickbase.com/v1";
export const CHARACTER_LIMIT = 50000;

export interface QuickbaseConfig {
  userToken: string;
  realmHostname: string;
}

export interface QuickbaseRecord {
  [fieldId: string]: { value: unknown };
}

export interface QuickbaseQueryResponse {
  data: QuickbaseRecord[];
  fields: Array<{ id: number; label: string; type: string }>;
  metadata: {
    totalRecords: number;
    numRecords: number;
    numFields: number;
    skip: number;
    top?: number;
  };
}

export interface QuickbaseApp {
  id: string;
  name: string;
  description?: string;
  created?: { iso: string };
  updated?: { iso: string };
  dateFormat?: string;
  timeZone?: string;
}

export interface QuickbaseTable {
  id: string;
  name: string;
  alias?: string;
  description?: string;
  created?: string;
  updated?: string;
  nextRecordId?: number;
  nextFieldId?: number;
  defaultSortFieldId?: number;
  singleRecordName?: string;
  pluralRecordName?: string;
}

export interface QuickbaseField {
  id: number;
  label: string;
  fieldType: string;
  mode?: string;
  noWrap?: boolean;
  bold?: boolean;
  required?: boolean;
  appearsByDefault?: boolean;
  findEnabled?: boolean;
  unique?: boolean;
  doesDataCopy?: boolean;
  fieldHelp?: string;
  addToForms?: boolean;
}

export interface QuickbaseUpsertResponse {
  data: Array<{ [fieldId: string]: { value: unknown } }>;
  metadata: {
    createdRecordIds: number[];
    updatedRecordIds: number[];
    unchangedRecordIds: number[];
    totalNumberOfRecordsProcessed: number;
  };
}

/**
 * Creates an authenticated Axios instance for the Quickbase REST API.
 */
export function createQuickbaseClient(config: QuickbaseConfig): AxiosInstance {
  return axios.create({
    baseURL: QUICKBASE_BASE_URL,
    headers: {
      Authorization: `QB-USER-TOKEN ${config.userToken}`,
      "QB-Realm-Hostname": config.realmHostname,
      "Content-Type": "application/json",
    },
    timeout: 30000,
  });
}

/**
 * Extracts a readable error message from Axios errors.
 */
export function handleApiError(error: unknown): string {
  if (axios.isAxiosError(error)) {
    const axiosError = error as AxiosError<{ message?: string; description?: string }>;
    const status = axiosError.response?.status;
    const body = axiosError.response?.data;
    const detail = body?.message ?? body?.description ?? axiosError.message;

    if (status === 401) return `Authentication failed: Invalid or expired user token. Check your QB-USER-TOKEN. Detail: ${detail}`;
    if (status === 403) return `Authorization denied: Insufficient permissions for this operation. Detail: ${detail}`;
    if (status === 404) return `Resource not found: Check that the app/table/field IDs are correct. Detail: ${detail}`;
    if (status === 429) return `Rate limit exceeded: Too many requests. Please wait before retrying. Detail: ${detail}`;
    if (status === 400) return `Bad request: ${detail ?? "Check the request parameters and data format."}`;
    return `Quickbase API error (HTTP ${status}): ${detail ?? error.message}`;
  }
  if (error instanceof Error) return `Unexpected error: ${error.message}`;
  return `Unknown error occurred: ${String(error)}`;
}

/**
 * Truncates a string response if it exceeds the character limit.
 */
export function truncateIfNeeded(text: string, limit: number = CHARACTER_LIMIT): string {
  if (text.length <= limit) return text;
  return text.slice(0, limit) + `\n\n[Response truncated — ${text.length - limit} characters omitted. Use pagination or field filtering to reduce result size.]`;
}

/**
 * Formats field values from Quickbase records into a human-readable table.
 */
export function formatRecordsAsMarkdown(
  records: QuickbaseRecord[],
  fields: Array<{ id: number; label: string; type: string }>
): string {
  if (records.length === 0) return "_No records found._";

  const fieldMap = new Map(fields.map((f) => [String(f.id), f.label]));
  const headers = fields.map((f) => f.label);
  const separator = headers.map(() => "---").join(" | ");
  const headerRow = headers.join(" | ");

  const rows = records.map((rec) =>
    fields.map((f) => {
      const cell = rec[String(f.id)];
      if (cell === undefined || cell === null) return "";
      const v = cell.value;
      if (v === null || v === undefined) return "";
      if (typeof v === "object") return JSON.stringify(v);
      return String(v);
    }).join(" | ")
  );

  return [headerRow, separator, ...rows].join("\n");
}

/**
 * Safely parses a numeric field ID — supports both number and string inputs.
 */
export function parseFieldIds(ids: unknown): number[] | undefined {
  if (!ids) return undefined;
  if (!Array.isArray(ids)) return undefined;
  return (ids as unknown[]).map((id) => Number(id)).filter((n) => !isNaN(n));
}
