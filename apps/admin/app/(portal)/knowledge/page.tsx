'use client';

import {
  Alert,
  Badge,
  Button,
  EmptyState,
  Modal,
  PageHeader,
  Skeleton,
  TextField,
  Toast,
} from '@meditation/ui';
import {
  Archive,
  BookOpen,
  Eye,
  FileText,
  FileUp,
  RefreshCw,
  RotateCcw,
  Search,
  Upload,
} from 'lucide-react';
import { useCallback, useEffect, useState } from 'react';

const api = process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:3000';
type Base = {
  id: string;
  name: string;
  description?: string | null;
  _count: { documents: number };
};
type Doc = {
  id: string;
  logicalName: string;
  versions: Array<{
    id: string;
    version: number;
    status: string;
    filename: string;
    byteSize: number;
    stageAssignments: Array<{ stage: string }>;
    _count: { chunks: number };
  }>;
};
type SearchResult = {
  id: string;
  content: string;
  title_path: string;
  logical_name: string;
  rank: number;
};
type VersionDetails = {
  id: string;
  filename: string;
  status: string;
  extractedText?: string | null;
  chunks: Array<{ id: string; chunkIndex: number; titlePath: string; content: string }>;
};
type Notice = { tone: 'success' | 'danger' | 'info'; text: string };
type KnowledgeLevel = 'GENERAL' | 'INTERMEDIATE' | 'ADVANCED';

const LEVELS: Array<{ value: KnowledgeLevel; label: string; description: string }> = [
  {
    value: 'GENERAL',
    label: 'Introduction',
    description: 'Başlangıç, temel kavramlar ve ilk pratikler',
  },
  {
    value: 'INTERMEDIATE',
    label: 'Intermediate',
    description: 'Düzenli pratiği derinleştiren orta seviye içerikler',
  },
  {
    value: 'ADVANCED',
    label: 'Advanced',
    description: 'İleri teknikler ve deneyimli öğrenciler için kaynaklar',
  },
];

function documentLevel(document: Doc): KnowledgeLevel {
  const assignments = document.versions[0]?.stageAssignments.map(({ stage }) => stage) ?? [];
  if (assignments.includes('ADVANCED')) return 'ADVANCED';
  if (assignments.includes('INTERMEDIATE')) return 'INTERMEDIATE';
  return 'GENERAL';
}

function statusLabel(status?: string) {
  const labels: Record<string, string> = {
    UPLOADED: 'İşleme alındı',
    QUARANTINED: 'İşleme alındı',
    SCANNING: 'Kontrol ediliyor',
    PARSING: 'Metin okunuyor',
    CHUNKING: 'Bölümleniyor',
    EMBEDDING: 'İndeksleniyor',
    READY: 'Hazır',
    PUBLISHED: 'Yayında',
    ARCHIVED: 'Arşivde',
    FAILED: 'İşlenemedi',
  };
  return status ? (labels[status] ?? status) : 'Durum yok';
}

async function read<T>(path: string): Promise<T> {
  const response = await fetch(`${api}${path}`, { credentials: 'include' });
  const payload = await response.json().catch(() => ({}));
  if (!response.ok)
    throw new Error((payload as { message?: string }).message ?? `HTTP ${response.status}`);
  return payload as T;
}

export default function KnowledgePage() {
  const [bases, setBases] = useState<Base[]>();
  const [selectedBase, setSelectedBase] = useState<Base>();
  const [documents, setDocuments] = useState<Doc[]>([]);
  const [stage, setStage] = useState<KnowledgeLevel>('GENERAL');
  const [files, setFiles] = useState<FileList | null>(null);
  const [versionDetails, setVersionDetails] = useState<VersionDetails>();
  const [query, setQuery] = useState('');
  const [searchResults, setSearchResults] = useState<SearchResult[]>();
  const [error, setError] = useState<string>();
  const [notice, setNotice] = useState<Notice>();
  const [busy, setBusy] = useState(false);

  const loadBases = useCallback(async () => {
    setError(undefined);
    try {
      const result = await read<Base[]>('/v1/admin/knowledge/bases');
      setBases(result);
      setSelectedBase((current) => current ?? result[0]);
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : 'Bilgi bankaları yüklenemedi.');
    }
  }, []);
  const loadDocuments = useCallback(async () => {
    if (!selectedBase) return;
    try {
      setDocuments(await read<Doc[]>(`/v1/admin/knowledge/bases/${selectedBase.id}/documents`));
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : 'Belgeler yüklenemedi.');
    }
  }, [selectedBase]);
  useEffect(() => {
    void loadBases();
  }, [loadBases]);
  useEffect(() => {
    void loadDocuments();
  }, [loadDocuments]);

  async function createBase() {
    const name = window.prompt('Bilgi bankası adı');
    if (!name?.trim()) return;
    await mutate('/v1/admin/knowledge/bases', { name: name.trim() });
    await loadBases();
  }
  async function mutate(path: string, body: unknown, method = 'POST') {
    setBusy(true);
    try {
      const response = await fetch(`${api}${path}`, {
        method,
        credentials: 'include',
        headers:
          body === undefined
            ? { 'x-csrf-token': sessionStorage.getItem('admin_csrf_token') ?? '' }
            : {
                'content-type': 'application/json',
                'x-csrf-token': sessionStorage.getItem('admin_csrf_token') ?? '',
              },
        body: body === undefined ? undefined : JSON.stringify(body),
      });
      const payload = await response.json().catch(() => ({}));
      if (!response.ok)
        throw new Error((payload as { message?: string }).message ?? `HTTP ${response.status}`);
      setNotice({ tone: 'success', text: 'İşlem tamamlandı.' });
      return payload;
    } catch (reason) {
      setNotice({
        tone: 'danger',
        text: reason instanceof Error ? reason.message : 'İşlem tamamlanamadı.',
      });
      return undefined;
    } finally {
      setBusy(false);
    }
  }
  async function upload() {
    if (!selectedBase || !files?.length) return;
    const form = new FormData();
    for (const file of Array.from(files)) form.append('files', file);
    form.append('stages', JSON.stringify([stage]));
    setBusy(true);
    try {
      const response = await fetch(
        `${api}/v1/admin/knowledge/bases/${selectedBase.id}/documents/upload`,
        {
          method: 'POST',
          credentials: 'include',
          headers: { 'x-csrf-token': sessionStorage.getItem('admin_csrf_token') ?? '' },
          body: form,
        },
      );
      const payload = await response.json().catch(() => []);
      if (!response.ok)
        throw new Error((payload as { message?: string }).message ?? `HTTP ${response.status}`);
      setNotice({
        tone: 'success',
        text: 'Dosyalar yüklendi. İçerikler otomatik olarak hazırlanıyor.',
      });
      setFiles(null);
      await loadDocuments();
      const uploaded = Array.isArray(payload)
        ? (payload[0] as { id?: string } | undefined)
        : undefined;
      if (uploaded?.id) await loadVersion(uploaded.id);
    } catch (reason) {
      setNotice({
        tone: 'danger',
        text: reason instanceof Error ? reason.message : 'Yükleme başarısız.',
      });
    } finally {
      setBusy(false);
    }
  }
  async function search() {
    if (!query.trim()) return;
    setBusy(true);
    try {
      const result = await read<{ results: SearchResult[] }>(
        `/v1/admin/knowledge/search?q=${encodeURIComponent(query.trim())}`,
      );
      setSearchResults(result.results);
    } catch (reason) {
      setNotice({
        tone: 'danger',
        text: reason instanceof Error ? reason.message : 'Arama başarısız.',
      });
    } finally {
      setBusy(false);
    }
  }
  async function status(versionId: string, value: 'PUBLISHED' | 'ARCHIVED') {
    await mutate(`/v1/admin/knowledge/versions/${versionId}/status`, { status: value });
    await loadDocuments();
  }
  async function loadVersion(versionId?: string) {
    if (!versionId) return;
    try {
      setVersionDetails(await read<VersionDetails>(`/v1/admin/knowledge/versions/${versionId}`));
    } catch (reason) {
      setNotice({
        tone: 'danger',
        text: reason instanceof Error ? reason.message : 'Belge ayrıntısı yüklenemedi.',
      });
    }
  }
  return (
    <main className="content">
      <PageHeader
        title="Bilgi Bankası"
        description="Öğrencilerin sorularında kullanılacak kaynakları seviyelerine göre yönetin"
        actions={
          <Button variant="secondary" onClick={() => void loadDocuments()}>
            <RefreshCw /> Yenile
          </Button>
        }
      />
      {notice ? (
        <div className="toast-region">
          <Toast tone={notice.tone} onDismiss={() => setNotice(undefined)}>
            {notice.text}
          </Toast>
        </div>
      ) : null}
      {error ? (
        <Alert tone="danger">{error}</Alert>
      ) : !bases ? (
        <Skeleton />
      ) : (
        <>
          <div className="knowledge-layout">
            <aside className="knowledge-sidebar">
              <div className="section-heading">
                <h2>Bankalar</h2>
                <Button
                  variant="ghost"
                  aria-label="Yeni bilgi bankası"
                  onClick={() => void createBase()}
                >
                  <BookOpen />
                </Button>
              </div>
              {bases.map((base) => (
                <button
                  className="knowledge-base-item"
                  data-selected={base.id === selectedBase?.id}
                  key={base.id}
                  onClick={() => {
                    setSelectedBase(base);
                    setVersionDetails(undefined);
                  }}
                >
                  <span>{base.name}</span>
                  <Badge tone="neutral">{base._count.documents}</Badge>
                </button>
              ))}
              {!bases.length ? (
                <EmptyState
                  title="Henüz banka yok"
                  description="Kaynakları gruplayarak başlayın."
                />
              ) : null}
            </aside>
            <section className="knowledge-main">
              {selectedBase ? (
                <>
                  <div className="knowledge-upload panel">
                    <div>
                      <h2>{selectedBase.name}</h2>
                      <p>PDF, DOCX, Markdown veya metin dosyaları. Her dosya en fazla 25 MiB.</p>
                    </div>
                    <div
                      className="knowledge-level-picker"
                      role="radiogroup"
                      aria-label="İçerik seviyesi"
                    >
                      {LEVELS.map((level) => (
                        <button
                          type="button"
                          role="radio"
                          aria-checked={stage === level.value}
                          data-selected={stage === level.value}
                          key={level.value}
                          onClick={() => setStage(level.value)}
                        >
                          <strong>{level.label}</strong>
                          <span>{level.description}</span>
                        </button>
                      ))}
                    </div>
                    <div className="knowledge-upload-controls">
                      <label className="file-picker">
                        <FileUp /> Dosya seç
                        <input
                          type="file"
                          multiple
                          accept=".pdf,.docx,.md,.txt,.csv"
                          onChange={(event) => setFiles(event.target.files)}
                        />
                      </label>
                      <div className="knowledge-file-summary">
                        <strong>
                          {files?.length ? `${files.length} dosya seçildi` : 'Dosya bekleniyor'}
                        </strong>
                        <span>PDF, DOCX, Markdown, TXT veya CSV · en fazla 25 MiB</span>
                      </div>
                      <Button
                        disabled={busy || !files?.length}
                        loading={busy}
                        onClick={() => void upload()}
                      >
                        <Upload /> Yükle ve kullanıma al
                      </Button>
                    </div>
                  </div>
                  <div className="section-heading">
                    <h2>Belgeler</h2>
                    <span className="muted">{documents.length} kaynak</span>
                  </div>
                  <div className="knowledge-sections">
                    {LEVELS.map((level) => {
                      const levelDocuments = documents.filter(
                        (doc) => documentLevel(doc) === level.value,
                      );
                      return (
                        <section className="knowledge-section" key={level.value}>
                          <div className="knowledge-section-heading">
                            <div>
                              <h3>{level.label}</h3>
                              <p>{level.description}</p>
                            </div>
                            <Badge tone="neutral">{levelDocuments.length}</Badge>
                          </div>
                          <div className="knowledge-documents">
                            {levelDocuments.map((doc) => {
                              const version = doc.versions[0];
                              return (
                                <article className="knowledge-document" key={doc.id}>
                                  <FileText aria-hidden="true" />
                                  <button
                                    type="button"
                                    onClick={() => void loadVersion(version?.id)}
                                  >
                                    <strong>{doc.logicalName}</strong>
                                    <span>
                                      {version?.filename} · {version?._count.chunks ?? 0} bölüm
                                    </span>
                                  </button>
                                  <div className="knowledge-document-actions">
                                    <Badge
                                      tone={
                                        version?.status === 'PUBLISHED'
                                          ? 'success'
                                          : version?.status === 'FAILED'
                                            ? 'danger'
                                            : 'neutral'
                                      }
                                    >
                                      {statusLabel(version?.status)}
                                    </Badge>
                                    <Button
                                      variant="ghost"
                                      aria-label={`${doc.logicalName} içeriğini görüntüle`}
                                      onClick={() => void loadVersion(version?.id)}
                                    >
                                      <Eye />
                                    </Button>
                                    {version?.status === 'PUBLISHED' ? (
                                      <Button
                                        variant="ghost"
                                        aria-label="Arşivle"
                                        onClick={() => void status(version.id, 'ARCHIVED')}
                                      >
                                        <Archive />
                                      </Button>
                                    ) : null}
                                    {version?.status === 'ARCHIVED' ? (
                                      <Button
                                        variant="ghost"
                                        aria-label="Yeniden yayınla"
                                        onClick={() => void status(version.id, 'PUBLISHED')}
                                      >
                                        <RotateCcw />
                                      </Button>
                                    ) : null}
                                  </div>
                                </article>
                              );
                            })}
                            {!levelDocuments.length ? (
                              <p className="knowledge-section-empty">
                                Bu seviyede henüz kaynak yok.
                              </p>
                            ) : null}
                          </div>
                        </section>
                      );
                    })}
                  </div>
                  <div className="knowledge-search panel">
                    <div className="search-row">
                      <TextField
                        label="Bilgi bankasında test ara"
                        value={query}
                        onChange={(event) => setQuery(event.target.value)}
                      />
                      <Button variant="secondary" onClick={() => void search()} disabled={busy}>
                        <Search /> Ara
                      </Button>
                    </div>
                    {searchResults?.map((result) => (
                      <div className="knowledge-result" key={result.id}>
                        <div>
                          <strong>{result.logical_name}</strong>
                          <span>{result.title_path || 'Başlıksız bölüm'}</span>
                        </div>
                        <Badge tone="info">{result.rank.toFixed(2)}</Badge>
                        <p>{result.content}</p>
                      </div>
                    ))}
                  </div>
                </>
              ) : (
                <EmptyState
                  title="Bilgi bankası seçin"
                  description="Sol taraftan bir kaynak grubu seçin."
                />
              )}
            </section>
          </div>
        </>
      )}
      {versionDetails ? (
        <Modal
          title={versionDetails.filename}
          description={`Belge durumu: ${statusLabel(versionDetails.status)}`}
          onClose={() => setVersionDetails(undefined)}
          actions={
            <>
              <Button variant="secondary" onClick={() => void loadVersion(versionDetails.id)}>
                <RefreshCw /> Yenile
              </Button>
              <Button onClick={() => setVersionDetails(undefined)}>Kapat</Button>
            </>
          }
        >
          <div className="knowledge-preview">
            <div className="knowledge-preview-summary">
              <Badge tone={versionDetails.status === 'PUBLISHED' ? 'success' : 'info'}>
                {statusLabel(versionDetails.status)}
              </Badge>
              <span>{versionDetails.chunks.length} bölüm</span>
            </div>
            <pre>
              {versionDetails.extractedText ??
                'Belge işleniyor. İçeriği görmek için kısa süre sonra yenileyin.'}
            </pre>
            {versionDetails.chunks.length ? (
              <div className="knowledge-chunks">
                {versionDetails.chunks.map((chunk) => (
                  <article key={chunk.id}>
                    <strong>
                      #{chunk.chunkIndex + 1} {chunk.titlePath}
                    </strong>
                    <p>{chunk.content}</p>
                  </article>
                ))}
              </div>
            ) : null}
          </div>
        </Modal>
      ) : null}
    </main>
  );
}
