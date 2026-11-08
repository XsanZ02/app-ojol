"use client";

import { useEffect, useRef, useState } from "react";
import { LoaderCircle, MapPin, Search } from "lucide-react";
import type { LocationPoint } from "@/types/booking";
import { searchLocations } from "@/lib/geocoding";

interface LocationAutocompleteProps {
  value: string;
  bias?: Pick<LocationPoint, "lat" | "lng"> | null;
  locationHint?: string;
  onSearchFocus?: () => void;
  onSelect: (location: LocationPoint) => void;
}

export function LocationAutocomplete({
  value,
  bias,
  locationHint,
  onSearchFocus,
  onSelect,
}: LocationAutocompleteProps) {
  const [query, setQuery] = useState(value);
  const [isOpen, setIsOpen] = useState(false);
  const [locations, setLocations] = useState<LocationPoint[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [hasSearched, setHasSearched] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    setQuery(value);
  }, [value]);

  useEffect(() => {
    const searchQuery = query.trim();
    if (!isOpen || searchQuery.length < 2) {
      setLocations([]);
      setError(null);
      setHasSearched(false);
      setIsLoading(false);
      return;
    }

    const controller = new AbortController();
    setIsLoading(true);
    setError(null);
    setHasSearched(false);
    const timeout = window.setTimeout(() => {
      void searchLocations(searchQuery, bias ?? null, controller.signal)
        .then((results) => {
          if (controller.signal.aborted) return;
          setLocations(results);
          setHasSearched(true);
        })
        .catch((cause: unknown) => {
          if (controller.signal.aborted) return;
          setLocations([]);
          setError(
            cause instanceof Error
              ? cause.message
              : "Pencarian lokasi gagal. Silakan coba lagi."
          );
        })
        .finally(() => {
          if (!controller.signal.aborted) setIsLoading(false);
        });
    }, 400);

    return () => {
      window.clearTimeout(timeout);
      controller.abort();
    };
  }, [query, bias, isOpen]);

  const chooseLocation = (location: LocationPoint) => {
    setQuery(location.address);
    setIsOpen(false);
    setLocations([]);
    setError(null);
    onSelect(location);
  };

  return (
    <div className="relative z-30">
      <label
        htmlFor="destination-search"
        className="mb-1.5 block text-xs font-semibold text-slate-600"
      >
        Cari alamat atau nama tempat tujuan
      </label>
      <div className="relative">
        <Search
          aria-hidden="true"
          className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400"
        />
        <input
          ref={inputRef}
          id="destination-search"
          type="search"
          autoComplete="off"
          role="combobox"
          aria-autocomplete="list"
          aria-expanded={isOpen && query.trim().length >= 2}
          aria-controls="destination-search-results"
          value={query}
          onFocus={() => {
            setIsOpen(true);
            onSearchFocus?.();
          }}
          onChange={(event) => {
            setQuery(event.target.value);
            setIsOpen(true);
          }}
          onKeyDown={(event) => {
            if (event.key === "Escape") {
              setIsOpen(false);
              inputRef.current?.blur();
            }
          }}
          placeholder="Contoh: INSTIKI, Denpasar"
          className="h-11 w-full rounded-rf border border-slate-200 bg-white pl-10 pr-10 text-sm text-rf-text shadow-sm outline-none transition focus:border-rf-blue focus:ring-2 focus:ring-blue-100"
        />
        {isLoading ? (
          <LoaderCircle
            aria-label="Mencari lokasi"
            className="absolute right-3 top-1/2 h-4 w-4 -translate-y-1/2 animate-spin text-rf-blue"
          />
        ) : (
          <MapPin
            aria-hidden="true"
            className="pointer-events-none absolute right-3 top-1/2 h-4 w-4 -translate-y-1/2 text-rf-blue"
          />
        )}
      </div>

      {isOpen && query.trim().length >= 2 && (
        <div
          id="destination-search-results"
          role="listbox"
          aria-label="Rekomendasi lokasi tujuan"
          className="absolute left-0 right-0 top-full z-[1100] mt-1 max-h-72 overflow-y-auto rounded-rf border border-slate-200 bg-white py-1 shadow-xl"
        >
          {isLoading && locations.length === 0 && (
            <p className="px-4 py-3 text-sm text-slate-500">Mencari lokasi...</p>
          )}
          {error && (
            <p role="alert" className="px-4 py-3 text-sm text-rose-700">
              {error}
            </p>
          )}
          {!isLoading && !error && hasSearched && locations.length === 0 && (
            <p className="px-4 py-3 text-sm text-slate-500">
              Lokasi tidak ditemukan. Coba kata kunci lain.
            </p>
          )}
          {!isLoading && !error && !hasSearched && (
            <p className="px-4 py-3 text-sm text-slate-500">
              Menyiapkan pencarian lokasi...
            </p>
          )}
          {locations.map((location, index) => (
            <button
              key={`${location.lat},${location.lng},${location.name},${index}`}
              type="button"
              role="option"
              aria-selected="false"
              onMouseDown={(event) => event.preventDefault()}
              onClick={() => chooseLocation(location)}
              className="flex w-full items-start gap-3 px-4 py-3 text-left transition hover:bg-blue-50 focus-visible:bg-blue-50 focus-visible:outline-none"
            >
              <span className="mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-blue-50 text-rf-blue">
                <MapPin className="h-4 w-4" />
              </span>
              <span className="min-w-0">
                <span className="block truncate text-sm font-bold text-rf-navy">
                  {location.name}
                </span>
                <span className="mt-0.5 block text-xs leading-relaxed text-slate-500">
                  {location.address}
                </span>
              </span>
            </button>
          ))}
        </div>
      )}
      <p className="mt-1 text-[11px] text-slate-500">
        Ketik minimal 2 karakter, atau pilih tujuan langsung dari peta.
      </p>
      {locationHint && (
        <p className="mt-1 text-[11px] text-slate-500" aria-live="polite">
          {locationHint}
        </p>
      )}
    </div>
  );
}
