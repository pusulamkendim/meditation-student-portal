export default function HomePage() {
  return (
    <main className="content">
      <div className="page-heading">
        <div>
          <h1>Genel Bakış</h1>
          <p>Öğrenci ve operasyon durumlarının güncel özeti</p>
        </div>
      </div>

      <section className="metrics" aria-label="Temel metrikler">
        <article>
          <span>Aktif öğrenci</span>
          <strong>0</strong>
        </article>
        <article>
          <span>Ödeme incelemesi</span>
          <strong>0</strong>
        </article>
        <article>
          <span>Bugünkü pratik</span>
          <strong>0</strong>
        </article>
        <article>
          <span>Açık destek</span>
          <strong>0</strong>
        </article>
      </section>

      <section className="operation-panel">
        <div className="panel-heading">
          <h2>Operasyon kuyruğu</h2>
          <span>Bekleyen işlem yok</span>
        </div>
        <div className="empty-state">Yeni ödeme, destek veya güvenlik bildirimi bulunmuyor.</div>
      </section>
    </main>
  );
}
