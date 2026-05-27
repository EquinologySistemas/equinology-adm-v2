export interface BrazilState {
  uf: string;
  name: string;
}

export const BRAZIL_STATES: BrazilState[] = [
  { uf: "AC", name: "Acre" },
  { uf: "AL", name: "Alagoas" },
  { uf: "AP", name: "Amapá" },
  { uf: "AM", name: "Amazonas" },
  { uf: "BA", name: "Bahia" },
  { uf: "CE", name: "Ceará" },
  { uf: "DF", name: "Distrito Federal" },
  { uf: "ES", name: "Espírito Santo" },
  { uf: "GO", name: "Goiás" },
  { uf: "MA", name: "Maranhão" },
  { uf: "MT", name: "Mato Grosso" },
  { uf: "MS", name: "Mato Grosso do Sul" },
  { uf: "MG", name: "Minas Gerais" },
  { uf: "PA", name: "Pará" },
  { uf: "PB", name: "Paraíba" },
  { uf: "PR", name: "Paraná" },
  { uf: "PE", name: "Pernambuco" },
  { uf: "PI", name: "Piauí" },
  { uf: "RJ", name: "Rio de Janeiro" },
  { uf: "RN", name: "Rio Grande do Norte" },
  { uf: "RS", name: "Rio Grande do Sul" },
  { uf: "RO", name: "Rondônia" },
  { uf: "RR", name: "Roraima" },
  { uf: "SC", name: "Santa Catarina" },
  { uf: "SP", name: "São Paulo" },
  { uf: "SE", name: "Sergipe" },
  { uf: "TO", name: "Tocantins" },
];

interface IbgeCityResponse {
  nome: string;
}

const cityCache = new Map<string, string[]>();
const pendingFetches = new Map<string, Promise<string[]>>();

/**
 * Busca municípios da UF via API IBGE com cache em memória do módulo.
 * Retorna os nomes em ordem alfabética.
 */
export async function fetchCitiesByUF(uf: string): Promise<string[]> {
  const key = uf.toUpperCase();
  if (cityCache.has(key)) return cityCache.get(key)!;
  if (pendingFetches.has(key)) return pendingFetches.get(key)!;

  const promise = (async () => {
    const res = await fetch(
      `https://servicodados.ibge.gov.br/api/v1/localidades/estados/${key}/municipios`,
    );
    if (!res.ok) throw new Error(`IBGE retornou ${res.status} para UF ${key}`);
    const data = (await res.json()) as IbgeCityResponse[];
    const cities = data
      .map((c) => c.nome)
      .sort((a, b) => a.localeCompare(b, "pt-BR"));
    cityCache.set(key, cities);
    pendingFetches.delete(key);
    return cities;
  })();

  pendingFetches.set(key, promise);
  return promise;
}
