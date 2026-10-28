import { useColecao } from "@/_core/armazenamento/colecao";
import { pode } from "@/_core/identidade/permissoes";
import { useUsuarioAtual } from "@/_core/identidade/sessao";
import { formatarData, gerarId, HOJE } from "@/_core/tempo";
import Cabecalho from "@/admin/componentes/Cabecalho";
import Kpi from "@/admin/componentes/Kpi";
import Vazio from "@/admin/componentes/Vazio";
import { documentos, formatarTamanho } from "@/modulos/escritorio/colecoes";
import { CATEGORIAS_DOCUMENTO, type CategoriaDocumento } from "@/modulos/escritorio/tipos";
import { FileText, Info, Search, SearchX, Trash2, Upload } from "lucide-react";
import { useState, type ChangeEvent } from "react";

/** Mesma heurística do app antigo: a categoria sai do nome do arquivo. */
function categoriaPeloNome(nome: string): CategoriaDocumento {
  const texto = nome.toLowerCase();
  if (texto.includes("contrato")) return "Contratos";
  if (texto.includes("parecer") || texto.includes("jurídico") || texto.includes("juridico")) return "Jurídico";
  if (texto.includes("relatório") || texto.includes("relatorio")) return "Relatórios";
  return "Outros";
}

export default function Documentos() {
  const lista = useColecao(documentos);
  const usuario = useUsuarioAtual();
  const [busca, setBusca] = useState("");
  const [categoria, setCategoria] = useState<CategoriaDocumento | "Todos">("Todos");

  const termo = busca.trim().toLowerCase();
  const visiveis = lista
    .filter((doc) => categoria === "Todos" || doc.categoria === categoria)
    .filter((doc) => !termo || doc.nome.toLowerCase().includes(termo))
    .sort((a, b) => b.data.localeCompare(a.data));

  function enviar(evento: ChangeEvent<HTMLInputElement>) {
    const arquivos = Array.from(evento.target.files ?? []);
    if (!arquivos.length || !usuario) return;
    documentos.atualizar((atual) => [
      ...arquivos.map((arquivo) => ({
        id: gerarId("doc"),
        nome: arquivo.name,
        categoria: categoriaPeloNome(arquivo.name),
        tamanho: arquivo.size,
        data: HOJE,
        enviadoPor: usuario.nome,
      })),
      ...atual,
    ]);
    evento.target.value = "";
  }

  return (
    <>
      <Cabecalho
        rotulo="Escritório"
        titulo="Documentos"
        descricao={`${lista.length} arquivo(s) do escritório.`}
        acoes={
          pode(usuario, "documentos.editar") ? (
            <label className="button-primary">
              <Upload size={15} strokeWidth={2} /> Enviar arquivo
              <input type="file" multiple onChange={enviar} className="sr-only" />
            </label>
          ) : null
        }
      />
      <div className="acesso-alerta-info espaco-abaixo">
        <Info size={15} strokeWidth={2} />
        <span>
          <strong>Em construção.</strong> O protótipo registra nome, tamanho e categoria do arquivo — o conteúdo entra com o armazenamento do backend.
        </span>
      </div>
      <div className="kpi-grid">
        {CATEGORIAS_DOCUMENTO.map((item) => (
          <Kpi key={item} rotulo={item} valor={String(lista.filter((doc) => doc.categoria === item).length)} icone={FileText} aoClicar={() => setCategoria(item)} />
        ))}
      </div>
      <section className="operations-surface">
        <div className="surface-toolbar">
          <label className="inline-search">
            <Search size={15} strokeWidth={1.9} />
            <input value={busca} onChange={(e) => setBusca(e.target.value)} placeholder="Buscar pelo nome" aria-label="Buscar documentos" />
          </label>
          <div className="filter-chips" role="group" aria-label="Categoria">
            {(["Todos", ...CATEGORIAS_DOCUMENTO] as const).map((opcao) => (
              <button key={opcao} type="button" className={categoria === opcao ? "filter-chip filter-chip-active" : "filter-chip"} aria-pressed={categoria === opcao} onClick={() => setCategoria(opcao)}>
                {opcao}
              </button>
            ))}
          </div>
        </div>
        {visiveis.length === 0 ? (
          <Vazio icone={SearchX} titulo="Nenhum documento encontrado" />
        ) : (
          <div className="ged-list">
            {visiveis.map((doc) => (
              <div className="ged-line" key={doc.id}>
                <span className="doc-icon" aria-hidden="true">
                  <FileText size={16} strokeWidth={1.9} />
                </span>
                <div className="ged-line-copy">
                  <strong>{doc.nome}</strong>
                  <span>
                    {formatarTamanho(doc.tamanho)} · {formatarData(doc.data)} · {doc.enviadoPor}
                  </span>
                </div>
                <div className="ged-line-meta">
                  <span className="status-pill status-neutral">{doc.categoria}</span>
                  {pode(usuario, "documentos.excluir") ? (
                    <button
                      type="button"
                      className="icon-button icon-button-danger"
                      aria-label={`Excluir ${doc.nome}`}
                      onClick={() => documentos.atualizar((atual) => atual.filter((item) => item.id !== doc.id))}
                    >
                      <Trash2 size={15} strokeWidth={1.9} />
                    </button>
                  ) : null}
                </div>
              </div>
            ))}
          </div>
        )}
      </section>
    </>
  );
}
