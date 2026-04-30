"use client";

import { useState, useCallback } from "react";
import { useToast } from "@/components/ui/toast";

/**
 * useListManager<T> — generischer Hook für CRUD-Listen-Pages.
 *
 * Eliminiert ~80 LOC Duplikation pro Listen-Page (haendler / subunternehmer /
 * projekte / abo-anbieter / blacklist) und garantiert konsistentes Verhalten
 * für: optimistische Updates, Toast-Feedback, Fehlerbehandlung, Lade-State,
 * Delete-Confirm-Flow.
 *
 * Form-State bleibt im Caller (jede Page hat eigene Felder), aber alle async-
 * Mutationen + Items-State + Error-Handling sind hier zentralisiert.
 *
 * Beispiel:
 *   const list = useListManager<Haendler>({
 *     initial: initialHaendler,
 *     endpoint: "/api/haendler",
 *     idKey: "id",
 *     responseKey: "haendler",
 *     toastLabels: {
 *       create: "Händler angelegt",
 *       update: "Händler aktualisiert",
 *       delete: (h) => `Händler "${h.name}" gelöscht`,
 *     },
 *     sortBy: (a, b) => a.name.localeCompare(b.name, "de"),
 *   });
 *
 *   await list.submit({ id: editId, payload });
 *   await list.remove(itemId);
 */

type SubmitArgs<TPayload> = {
  /** Wenn gesetzt: PUT, sonst POST */
  id?: string | null;
  payload: TPayload;
};

export type UseListManagerOptions<T> = {
  /** Anfangsliste vom Server-Component */
  initial: T[];
  /** Basis-URL ohne trailing slash. PUT/DELETE: `${endpoint}/${id}`. POST: `endpoint`. */
  endpoint: string;
  /** Property-Name der ID, default "id" */
  idKey?: keyof T;
  /** JSON-Antwort-Property, das das Item enthält. Default: dieselbe Antwort als Item. */
  responseKey?: string;
  /** Toast-Labels für CRUD-Aktionen */
  toastLabels: {
    create: string | ((item: T) => string);
    update: string | ((item: T) => string);
    delete: string | ((item: T) => string);
  };
  /** Optional: Sort-Comparator für Insert nach POST */
  sortBy?: (a: T, b: T) => number;
  /** Optional: Custom Error-Renderer (default: error.message) */
  formatError?: (err: unknown, action: "create" | "update" | "delete") => string;
};

export type UseListManagerResult<T, TPayload = unknown> = {
  items: T[];
  setItems: React.Dispatch<React.SetStateAction<T[]>>;
  loading: boolean;
  error: string | null;
  setError: (msg: string | null) => void;
  /** State für ConfirmDialog. null = closed. */
  deleteConfirm: { id: string; item: T } | null;
  openDeleteConfirm: (item: T) => void;
  closeDeleteConfirm: () => void;
  /** POST oder PUT je nach `id`. Returns das gespeicherte Item oder null bei Error. */
  submit: (args: SubmitArgs<TPayload>) => Promise<T | null>;
  /** DELETE. Returns true bei Erfolg. */
  remove: (id: string) => Promise<boolean>;
};

export function useListManager<T extends Record<string, unknown>, TPayload = unknown>(
  opts: UseListManagerOptions<T>,
): UseListManagerResult<T, TPayload> {
  const {
    initial,
    endpoint,
    idKey = "id" as keyof T,
    responseKey,
    toastLabels,
    sortBy,
    formatError,
  } = opts;
  const { toast } = useToast();

  const [items, setItems] = useState<T[]>(initial);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [deleteConfirm, setDeleteConfirm] = useState<{ id: string; item: T } | null>(null);

  const openDeleteConfirm = useCallback((item: T) => {
    const id = String(item[idKey]);
    setDeleteConfirm({ id, item });
  }, [idKey]);

  const closeDeleteConfirm = useCallback(() => {
    setDeleteConfirm(null);
  }, []);

  const extractItem = useCallback(
    (data: unknown): T => {
      if (responseKey && data && typeof data === "object" && responseKey in data) {
        return (data as Record<string, unknown>)[responseKey] as T;
      }
      return data as T;
    },
    [responseKey],
  );

  const labelFor = useCallback((tpl: string | ((item: T) => string), item: T): string => {
    return typeof tpl === "function" ? tpl(item) : tpl;
  }, []);

  const submit = useCallback(
    async ({ id, payload }: SubmitArgs<TPayload>): Promise<T | null> => {
      setLoading(true);
      setError(null);
      try {
        const url = id ? `${endpoint}/${id}` : endpoint;
        const method = id ? "PUT" : "POST";
        const res = await fetch(url, {
          method,
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(payload),
        });
        const data = await res.json();
        if (!res.ok) {
          throw new Error(data.error || "Speichern fehlgeschlagen");
        }
        const saved = extractItem(data);
        if (id) {
          setItems((prev) => prev.map((it) => (String(it[idKey]) === id ? saved : it)));
          toast.success(labelFor(toastLabels.update, saved));
        } else {
          setItems((prev) => {
            const next = [...prev, saved];
            return sortBy ? next.sort(sortBy) : next;
          });
          toast.success(labelFor(toastLabels.create, saved));
        }
        return saved;
      } catch (err) {
        const msg = formatError
          ? formatError(err, id ? "update" : "create")
          : err instanceof Error
            ? err.message
            : "Fehler beim Speichern";
        setError(msg);
        return null;
      } finally {
        setLoading(false);
      }
    },
    [endpoint, idKey, extractItem, labelFor, toastLabels, sortBy, toast, formatError],
  );

  const remove = useCallback(
    async (id: string): Promise<boolean> => {
      const target = items.find((it) => String(it[idKey]) === id);
      setLoading(true);
      try {
        const res = await fetch(`${endpoint}/${id}`, { method: "DELETE" });
        const data = await res.json().catch(() => ({}));
        if (!res.ok) {
          throw new Error(data.error || "Löschen fehlgeschlagen");
        }
        setItems((prev) => prev.filter((it) => String(it[idKey]) !== id));
        if (target) toast.success(labelFor(toastLabels.delete, target));
        return true;
      } catch (err) {
        toast.error("Löschen fehlgeschlagen", {
          description: err instanceof Error ? err.message : undefined,
        });
        return false;
      } finally {
        setLoading(false);
        setDeleteConfirm(null);
      }
    },
    [endpoint, idKey, items, labelFor, toastLabels, toast],
  );

  return {
    items,
    setItems,
    loading,
    error,
    setError,
    deleteConfirm,
    openDeleteConfirm,
    closeDeleteConfirm,
    submit,
    remove,
  };
}
