'use client';

import {
  Alert,
  Badge,
  Button,
  EmptyState,
  PageHeader,
  Skeleton,
  TextField,
  Toast,
} from '@meditation/ui';
import { BookOpen, FileUp, RefreshCw, Search, Upload, CheckCircle2, Archive } from 'lucide-react';
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
type Handoff = { id: string; studentId: string; reason: string; status: string; createdAt: string };
type VersionDetails = {
  id: string;
  filename: string;
  status: string;
  extractedText?: string | null;
  chunks: Array<{ id: string; chunkIndex: number; titlePath: string; content: string }>;
};
type Notice = { tone: 'success' | 'danger' | 'info'; text: string };

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
  const [stages, setStages] = useState<string[]>(['GENERAL']);
  const [files, setFiles] = useState<FileList | null>(null);
  const [versionDetails, setVersionDetails] = useState<VersionDetails>();
  const [query, setQuery] = useState('');
  const [searchResults, setSearchResults] = useState<SearchResult[]>();
  const [handoffs, setHandoffs] = useState<Handoff[]>([]);
  const [error, setError] = useState<string>();
  const [notice, setNotice] = useState<Notice>();
  const [busy, setBusy] = useState(false);

  const loadBases = useCallback(async () => {
    setError(undefined);
    try {
      const result = await read<Base[]>('/v1/admin/knowledge/bases');
      setBases(result);
      setSelectedBase((current) => current ?? result[0]);
      setHandoffs(await read<Handoff[]>('/v1/admin/knowledge/handoffs?status=OPEN'));
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
        headers: {
          'content-type': 'application/json',
          'x-csrf-token': sessionStorage.getItem('admin_csrf_token') ?? '',
        },
        body: JSON.stringify(body),
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
    form.append('stages', JSON.stringify(stages));
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
      const payload = await response.json().catch(() => ({}));
      if (!response.ok)
        throw new Error((payload as { message?: string }).message ?? `HTTP ${response.status}`);
      setNotice({
        tone: 'success',
        text: 'Dosyalar karantinaya alındı; tarama kuyruğa gönderildi.',
      });
      setFiles(null);
      await loadDocuments();
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
  async function resolveHandoff(id: string) {
    await mutate(`/v1/admin/knowledge/handoffs/${id}/resolve`, undefined);
    setHandoffs((current) => current.filter((item) => item.id !== id));
  }

  return (
    <main className="content">
      <PageHeader
        title="Bilgi Bankası"
        description="Aşamalara ayrılmış kaynakları güvenli biçimde yükleyin, tarayın ve yayınlayın"
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
                      <select
                        multiple
                        value={stages}
                        onChange={(event) =>
                          setStages(
                            Array.from(event.target.selectedOptions).map((option) => option.value),
                          )
                        }
                      >
                        <option value="GENERAL">Genel</option>
                        <option value="WEEK_1">1. hafta</option>
                        <option value="WEEK_2">2. hafta</option>
                        <option value="WEEK_3">3. hafta</option>
                        <option value="WEEK_4">4. hafta</option>
                        <option value="INTERMEDIATE">Intermediate</option>
                        <option value="ADVANCED">Advanced</option>
                      </select>
                      <Button disabled={busy || !files?.length} onClick={() => void upload()}>
                        <Upload /> Yükle
                      </Button>
                    </div>
                    {files?.length ? <small>{files.length} dosya seçildi</small> : null}
                  </div>
                  <div className="section-heading">
                    <h2>Belgeler</h2>
                    <span className="muted">{documents.length} kaynak</span>
                  </div>
                  <div className="knowledge-documents">
                    {documents.map((doc) => {
                      const version = doc.versions[0];
                      return (
                        <article
                          className="knowledge-document"
                          key={doc.id}
                          onClick={() => void loadVersion(version?.id)}
                        >
                          <div>
                            <strong>{doc.logicalName}</strong>
                            <span>
                              {version?.filename} · {version?._count.chunks ?? 0} parça
                            </span>
                          </div>
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
                              {version?.status ?? '—'}
                            </Badge>
                            {version?.status === 'READY' ? (
                              <Button
                                variant="ghost"
                                aria-label="Yayınla"
                                onClick={(event) => {
                                  event.stopPropagation();
                                  void status(version.id, 'PUBLISHED');
                                }}
                              >
                                <CheckCircle2 />
                              </Button>
                            ) : null}
                            {version?.status === 'PUBLISHED' ? (
                              <Button
                                variant="ghost"
                                aria-label="Arşivle"
                                onClick={(event) => {
                                  event.stopPropagation();
                                  void status(version.id, 'ARCHIVED');
                                }}
                              >
                                <Archive />
                              </Button>
                            ) : null}
                          </div>
                        </article>
                      );
                    })}
                  </div>
                  {versionDetails ? (
                    <div className="knowledge-preview panel">
                      <div className="section-heading">
                        <h2>{versionDetails.filename}</h2>
                        <Badge tone="info">{versionDetails.status}</Badge>
                      </div>
                      <pre>{versionDetails.extractedText ?? 'Metin çıkarılmadı.'}</pre>
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
                    </div>
                  ) : null}
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
          <div className="knowledge-handoffs panel">
            <div className="section-heading">
              <h2>Açık handoff</h2>
              <Badge tone={handoffs.length ? 'warning' : 'success'}>{handoffs.length}</Badge>
            </div>
            {handoffs.length ? (
              handoffs.map((handoff) => (
                <article className="handoff-row" key={handoff.id}>
                  <div>
                    <strong>{handoff.studentId.slice(0, 8)}</strong>
                    <span>{new Date(handoff.createdAt).toLocaleString('tr-TR')}</span>
                    <p>{handoff.reason}</p>
                  </div>
                  <Button variant="secondary" onClick={() => void resolveHandoff(handoff.id)}>
                    Çözüldü
                  </Button>
                </article>
              ))
            ) : (
              <p className="muted">Bekleyen handoff yok.</p>
            )}
          </div>
        </>
      )}
    </main>
  );
}
