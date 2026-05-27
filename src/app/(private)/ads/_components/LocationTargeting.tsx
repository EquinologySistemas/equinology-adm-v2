"use client";

import { useEffect, useMemo, useState } from "react";
import { BRAZIL_STATES, fetchCitiesByUF } from "@/lib/locations";
import type { AdCityTarget, AdScope } from "@/types/admin";
import { ChevronDown, ChevronRight, Globe2, MapPin, MapPinned } from "lucide-react";

interface LocationTargetingProps {
  scope: AdScope;
  targetStates: string[];
  targetCities: AdCityTarget[];
  onScopeChange: (scope: AdScope) => void;
  onStatesChange: (states: string[]) => void;
  onCitiesChange: (cities: AdCityTarget[]) => void;
  statesError?: string;
  citiesError?: string;
}

const SCOPE_OPTIONS: Array<{ value: AdScope; label: string; description: string; icon: typeof Globe2 }> = [
  {
    value: "GLOBAL",
    label: "Global",
    description: "Exibido para todos os usuários, em qualquer localização.",
    icon: Globe2,
  },
  {
    value: "REGIONAL",
    label: "Estadual",
    description: "Exibido apenas para usuários nos estados selecionados.",
    icon: MapPin,
  },
  {
    value: "MUNICIPAL",
    label: "Municipal",
    description: "Exibido apenas para usuários nos municípios selecionados.",
    icon: MapPinned,
  },
];

export function LocationTargeting({
  scope,
  targetStates,
  targetCities,
  onScopeChange,
  onStatesChange,
  onCitiesChange,
  statesError,
  citiesError,
}: LocationTargetingProps) {
  return (
    <div className="rounded-xl border border-[var(--dash-border)] bg-[var(--dash-bg)]/40 p-4 space-y-4">
      <div>
        <p className="text-sm font-semibold text-[var(--dash-text)]">Escopo de exibição</p>
        <p className="text-xs text-[var(--dash-text-muted)]">
          Define quem verá o anúncio com base na localização da empresa do usuário.
        </p>
      </div>

      <div className="grid grid-cols-1 gap-2 sm:grid-cols-3">
        {SCOPE_OPTIONS.map((opt) => {
          const Icon = opt.icon;
          const selected = scope === opt.value;
          return (
            <button
              key={opt.value}
              type="button"
              onClick={() => onScopeChange(opt.value)}
              className={`flex flex-col items-start gap-1 rounded-xl border px-3 py-3 text-left text-sm transition-colors ${
                selected
                  ? "border-[var(--dash-accent)] bg-[var(--dash-accent-soft)] text-[var(--dash-accent)]"
                  : "border-[var(--dash-border)] bg-white text-[var(--dash-text)] hover:bg-[var(--dash-bg)]/60"
              }`}
            >
              <div className="flex items-center gap-2 font-medium">
                <Icon className="h-4 w-4" />
                {opt.label}
              </div>
              <p className="text-xs text-[var(--dash-text-muted)]">{opt.description}</p>
            </button>
          );
        })}
      </div>

      {scope === "REGIONAL" && (
        <StatesSelector
          selected={targetStates}
          onChange={onStatesChange}
          error={statesError}
        />
      )}

      {scope === "MUNICIPAL" && (
        <CitiesSelector
          selected={targetCities}
          onChange={onCitiesChange}
          error={citiesError}
        />
      )}
    </div>
  );
}

interface StatesSelectorProps {
  selected: string[];
  onChange: (states: string[]) => void;
  error?: string;
}

function StatesSelector({ selected, onChange, error }: StatesSelectorProps) {
  const selectedSet = useMemo(() => new Set(selected), [selected]);

  function toggle(uf: string) {
    const next = new Set(selectedSet);
    if (next.has(uf)) next.delete(uf);
    else next.add(uf);
    onChange(Array.from(next));
  }

  return (
    <div>
      <div className="mb-2 flex items-center justify-between">
        <p className="text-sm font-medium text-[var(--dash-text)]">Estados alvo</p>
        <button
          type="button"
          onClick={() => onChange(selected.length === BRAZIL_STATES.length ? [] : BRAZIL_STATES.map((s) => s.uf))}
          className="text-xs text-[var(--dash-accent)] hover:underline"
        >
          {selected.length === BRAZIL_STATES.length ? "Limpar" : "Selecionar todos"}
        </button>
      </div>
      <div className="grid max-h-56 grid-cols-2 gap-1 overflow-y-auto rounded-lg border border-[var(--dash-border)] bg-white p-2 sm:grid-cols-3">
        {BRAZIL_STATES.map((s) => {
          const isSelected = selectedSet.has(s.uf);
          return (
            <label
              key={s.uf}
              className={`flex cursor-pointer items-center gap-2 rounded-md px-2 py-1.5 text-sm transition-colors ${
                isSelected ? "bg-[var(--dash-accent-soft)]" : "hover:bg-[var(--dash-bg)]/60"
              }`}
            >
              <input
                type="checkbox"
                checked={isSelected}
                onChange={() => toggle(s.uf)}
                className="h-4 w-4 rounded border-[var(--dash-border)] text-[var(--dash-accent)] focus:ring-[var(--dash-accent)]"
              />
              <span className="font-mono text-xs text-[var(--dash-text-muted)]">{s.uf}</span>
              <span className="truncate text-[var(--dash-text)]">{s.name}</span>
            </label>
          );
        })}
      </div>
      {error && <p className="mt-1 text-xs text-red-600">{error}</p>}
      <p className="mt-1 text-xs text-[var(--dash-text-muted)]">
        {selected.length} estado(s) selecionado(s).
      </p>
    </div>
  );
}

interface CitiesSelectorProps {
  selected: AdCityTarget[];
  onChange: (cities: AdCityTarget[]) => void;
  error?: string;
}

function CitiesSelector({ selected, onChange, error }: CitiesSelectorProps) {
  const [openUfs, setOpenUfs] = useState<Set<string>>(() => {
    // Abre as UFs que já têm cidades selecionadas
    const set = new Set<string>();
    for (const c of selected) set.add(c.uf);
    return set;
  });
  const [cityCache, setCityCache] = useState<Record<string, string[]>>({});
  const [loading, setLoading] = useState<Record<string, boolean>>({});
  const [errorByUf, setErrorByUf] = useState<Record<string, string>>({});
  const [searchByUf, setSearchByUf] = useState<Record<string, string>>({});

  const selectedByUf = useMemo(() => {
    const map = new Map<string, Set<string>>();
    for (const c of selected) {
      const set = map.get(c.uf) ?? new Set<string>();
      set.add(c.city);
      map.set(c.uf, set);
    }
    return map;
  }, [selected]);

  async function toggleUf(uf: string) {
    setOpenUfs((prev) => {
      const next = new Set(prev);
      if (next.has(uf)) next.delete(uf);
      else next.add(uf);
      return next;
    });
    if (!cityCache[uf] && !loading[uf]) {
      setLoading((p) => ({ ...p, [uf]: true }));
      setErrorByUf((p) => {
        const { [uf]: _omit, ...rest } = p;
        return rest;
      });
      try {
        const cities = await fetchCitiesByUF(uf);
        setCityCache((p) => ({ ...p, [uf]: cities }));
      } catch (err) {
        setErrorByUf((p) => ({
          ...p,
          [uf]: (err as Error).message ?? "Falha ao carregar cidades.",
        }));
      } finally {
        setLoading((p) => ({ ...p, [uf]: false }));
      }
    }
  }

  function toggleCity(uf: string, city: string) {
    const exists = selected.some((c) => c.uf === uf && c.city === city);
    if (exists) {
      onChange(selected.filter((c) => !(c.uf === uf && c.city === city)));
    } else {
      onChange([...selected, { uf, city }]);
    }
  }

  function clearUf(uf: string) {
    onChange(selected.filter((c) => c.uf !== uf));
  }

  return (
    <div>
      <p className="mb-2 text-sm font-medium text-[var(--dash-text)]">Cidades alvo</p>
      <div className="space-y-2 rounded-lg border border-[var(--dash-border)] bg-white p-2">
        {BRAZIL_STATES.map((s) => {
          const open = openUfs.has(s.uf);
          const selectedCount = selectedByUf.get(s.uf)?.size ?? 0;
          const search = searchByUf[s.uf] ?? "";
          const cities = cityCache[s.uf] ?? [];
          const filtered = search
            ? cities.filter((c) => c.toLowerCase().includes(search.toLowerCase()))
            : cities;
          return (
            <div key={s.uf} className="rounded-md border border-[var(--dash-border)]/60">
              <button
                type="button"
                onClick={() => toggleUf(s.uf)}
                className="flex w-full items-center justify-between gap-2 px-3 py-2 text-left text-sm transition-colors hover:bg-[var(--dash-bg)]/60"
              >
                <span className="flex items-center gap-2">
                  {open ? (
                    <ChevronDown className="h-4 w-4 text-[var(--dash-text-muted)]" />
                  ) : (
                    <ChevronRight className="h-4 w-4 text-[var(--dash-text-muted)]" />
                  )}
                  <span className="font-mono text-xs text-[var(--dash-text-muted)]">{s.uf}</span>
                  <span className="text-[var(--dash-text)]">{s.name}</span>
                </span>
                {selectedCount > 0 && (
                  <span className="flex items-center gap-2">
                    <span className="rounded-full bg-[var(--dash-accent-soft)] px-2 py-0.5 text-xs font-medium text-[var(--dash-accent)]">
                      {selectedCount}
                    </span>
                    <button
                      type="button"
                      onClick={(e) => {
                        e.stopPropagation();
                        clearUf(s.uf);
                      }}
                      className="text-xs text-[var(--dash-text-muted)] hover:text-red-600"
                    >
                      limpar
                    </button>
                  </span>
                )}
              </button>
              {open && (
                <div className="border-t border-[var(--dash-border)]/60 p-2">
                  {loading[s.uf] && (
                    <p className="px-1 py-2 text-xs text-[var(--dash-text-muted)]">
                      Carregando municípios…
                    </p>
                  )}
                  {errorByUf[s.uf] && (
                    <div className="px-1 py-2 text-xs text-red-600">
                      {errorByUf[s.uf]}{" "}
                      <button
                        type="button"
                        onClick={() => toggleUf(s.uf)}
                        className="underline"
                      >
                        tentar novamente
                      </button>
                    </div>
                  )}
                  {!loading[s.uf] && !errorByUf[s.uf] && cities.length > 0 && (
                    <>
                      <input
                        type="text"
                        value={search}
                        onChange={(e) =>
                          setSearchByUf((p) => ({ ...p, [s.uf]: e.target.value }))
                        }
                        placeholder={`Buscar cidade em ${s.name}…`}
                        className="mb-2 w-full rounded-md border border-[var(--dash-border)] px-2 py-1 text-xs focus:outline-none focus:ring-2 focus:ring-[var(--dash-accent)]/30"
                      />
                      <div className="max-h-48 overflow-y-auto">
                        {filtered.map((city) => {
                          const isSelected = selectedByUf.get(s.uf)?.has(city) ?? false;
                          return (
                            <label
                              key={`${s.uf}-${city}`}
                              className={`flex cursor-pointer items-center gap-2 rounded-md px-2 py-1 text-xs transition-colors ${
                                isSelected
                                  ? "bg-[var(--dash-accent-soft)]"
                                  : "hover:bg-[var(--dash-bg)]/60"
                              }`}
                            >
                              <input
                                type="checkbox"
                                checked={isSelected}
                                onChange={() => toggleCity(s.uf, city)}
                                className="h-3.5 w-3.5 rounded border-[var(--dash-border)] text-[var(--dash-accent)] focus:ring-[var(--dash-accent)]"
                              />
                              <span className="text-[var(--dash-text)]">{city}</span>
                            </label>
                          );
                        })}
                        {filtered.length === 0 && (
                          <p className="px-1 py-2 text-xs text-[var(--dash-text-muted)]">
                            Nenhuma cidade encontrada.
                          </p>
                        )}
                      </div>
                    </>
                  )}
                </div>
              )}
            </div>
          );
        })}
      </div>
      {error && <p className="mt-1 text-xs text-red-600">{error}</p>}
      <p className="mt-1 text-xs text-[var(--dash-text-muted)]">
        {selected.length} cidade(s) selecionada(s) em {selectedByUf.size} estado(s).
      </p>
    </div>
  );
}
