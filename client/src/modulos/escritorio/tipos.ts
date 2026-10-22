export const CATEGORIAS_DOCUMENTO = ["Contratos", "Jurídico", "Relatórios", "Outros"] as const;
export type CategoriaDocumento = (typeof CATEGORIAS_DOCUMENTO)[number];

export type Documento = {
  id: string;
  nome: string;
  categoria: CategoriaDocumento;
  tamanho: number;
  data: string;
  enviadoPor: string;
};

export type Reuniao = {
  id: string;
  titulo: string;
  data: string;
  hora: string;
  local: string;
  participantes: string;
  pauta: string;
};
