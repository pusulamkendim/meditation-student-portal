import { Check, Clock3, MessageCircle, Mic, Play, X } from 'lucide-react';

export function TrackingDemo() {
  return (
    <div className="tracking-phone" aria-label="Günlük pratik mesajlarının örnek görünümü">
      <div className="tracking-phone-head">
        <span className="tracking-phone-avatar">SZ</span>
        <div>
          <strong>Sakin Zihin</strong>
          <small>günlük pratik takibi</small>
        </div>
      </div>

      <div className="tracking-message-list">
        <div className="tracking-message">
          <span className="tracking-message-label">Hatırlatma · 21.30</span>
          <p>Bugünkü 10 dakikalık pratiğin için hazır mısın?</p>
          <span className="tracking-action">
            <Clock3 size={14} /> Sayacı aç
          </span>
        </div>

        <div className="tracking-timer-card">
          <span>Nefes farkındalığı</span>
          <strong>10:00</strong>
          <small>
            <Play size={12} fill="currentColor" /> Pratiği başlat
          </small>
        </div>

        <div className="tracking-message">
          <span className="tracking-message-label">Check-in</span>
          <p>Bugünkü pratiğini tamamlayabildin mi?</p>
          <div className="tracking-choice-row">
            <span className="is-complete">
              <Check size={13} /> Yaptım
            </span>
            <span>
              <X size={13} /> Yapamadım
            </span>
          </div>
        </div>

        <div className="tracking-message tracking-message-reflection">
          <span className="tracking-message-label">İsteğe bağlı refleksiyon</span>
          <p>Meditasyonun nasıl geçti? İstersen birkaç cümle veya sesli mesaj bırakabilirsin.</p>
          <div className="tracking-reflection-actions">
            <span>
              <MessageCircle size={13} /> Yaz
            </span>
            <span>
              <Mic size={13} /> Sesli gönder
            </span>
          </div>
        </div>
      </div>

      <p className="tracking-phone-note">Refleksiyon bırakmak zorunlu değildir.</p>
    </div>
  );
}

export function ProgressOverview() {
  const days = [
    { day: 'Pzt', state: 'done' },
    { day: 'Sal', state: 'done' },
    { day: 'Çar', state: 'missed' },
    { day: 'Per', state: 'done' },
    { day: 'Cum', state: 'done' },
    { day: 'Cmt', state: 'pending' },
    { day: 'Paz', state: 'pending' },
  ];

  return (
    <div className="progress-overview">
      <div className="progress-overview-head">
        <div>
          <span>Bu hafta</span>
          <strong>Pratik görünümü</strong>
        </div>
        <small>Örnek takip ekranı</small>
      </div>
      <div className="progress-overview-stats">
        <div>
          <strong>5 / 4</strong>
          <span>Planlanan / tamamlanan</span>
        </div>
        <div>
          <strong>40 dk</strong>
          <span>Toplam meditasyon</span>
        </div>
        <div>
          <strong>3</strong>
          <span>Refleksiyon</span>
        </div>
      </div>
      <div className="progress-overview-days" aria-label="Örnek haftalık pratik durumları">
        {days.map((item) => (
          <div key={item.day}>
            <span className={`progress-day-state is-${item.state}`}>
              {item.state === 'done' ? (
                <Check size={14} />
              ) : item.state === 'missed' ? (
                <X size={14} />
              ) : (
                '·'
              )}
            </span>
            <small>{item.day}</small>
          </div>
        ))}
      </div>
      <div className="progress-overview-reflection">
        <MessageCircle size={16} />
        <p>“İlk birkaç dakika zihnim çok hareketliydi; nefese döndükçe bedenim biraz gevşedi.”</p>
      </div>
    </div>
  );
}
