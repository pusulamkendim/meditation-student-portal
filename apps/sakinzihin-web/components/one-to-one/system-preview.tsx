import { CalendarDays, Check, Clock3, MessageCircle, Video } from 'lucide-react';

export function SystemPreview() {
  return (
    <div
      className="one-to-one-system-preview"
      aria-label="Birebir çalışma sisteminin örnek görünümü"
    >
      <div className="system-preview-topline">
        <div>
          <span className="system-preview-kicker">Bu hafta</span>
          <strong>Kişisel pratik planın</strong>
        </div>
        <span className="system-preview-status">
          <span /> Sistem aktif
        </span>
      </div>

      <div className="system-preview-meeting">
        <span className="system-preview-icon">
          <Video size={18} />
        </span>
        <div>
          <small>Sıradaki görüşme</small>
          <strong>Perşembe · 19.30</strong>
          <p>Google Meet bağlantısı görüşmeden önce otomatik gönderilecek.</p>
        </div>
      </div>

      <div className="system-preview-plan">
        <div className="system-preview-plan-head">
          <span>
            <CalendarDays size={15} /> Günlük plan
          </span>
          <small>10 dakika</small>
        </div>
        <div className="system-preview-days">
          {['Pzt', 'Sal', 'Çar', 'Per', 'Cum', 'Cmt', 'Paz'].map((day, index) => (
            <div className={index < 4 ? 'is-done' : index === 4 ? 'is-today' : ''} key={day}>
              <span>
                {index < 4 ? <Check size={12} /> : index === 4 ? <Clock3 size={12} /> : '·'}
              </span>
              <small>{day}</small>
            </div>
          ))}
        </div>
      </div>

      <div className="system-preview-message">
        <span className="system-preview-icon">
          <MessageCircle size={17} />
        </span>
        <div>
          <small>Bugün · 21.30</small>
          <p>10 dakikalık nefes farkındalığı pratiğin hazır.</p>
        </div>
        <span className="system-preview-channel">WhatsApp</span>
      </div>
    </div>
  );
}
