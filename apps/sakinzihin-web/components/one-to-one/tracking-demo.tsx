import { Check, Heart, MessageCircle } from 'lucide-react';

export function TrackingDemo() {
  return (
    <div className="tracking-demo">
      <div className="tracking-head">
        <div>
          <span className="tracking-label">Bu hafta</span>
          <strong>Harika gidiyor ✨</strong>
        </div>
        <span className="tracking-week">12–18 Ağustos</span>
      </div>
      <div className="tracking-stats">
        <div>
          <strong>5 / 7</strong>
          <span>Pratik</span>
        </div>
        <div>
          <strong>85 dk</strong>
          <span>Meditasyon</span>
        </div>
        <div>
          <strong>4</strong>
          <span>Refleksiyon</span>
        </div>
      </div>
      <div className="tracking-bars" aria-label="Haftalık pratik görünümü">
        {[0.55, 0.82, 0.42, 0.95, 0.68, 0.88, 0.28].map((height, index) => (
          <div className="tracking-bar-wrap" key={index}>
            <span
              className={`tracking-bar ${index > 4 ? 'is-muted' : ''}`}
              style={{ height: `${height * 76}px` }}
            />
            <small>{['Pzt', 'Sal', 'Çar', 'Per', 'Cum', 'Cmt', 'Paz'][index]}</small>
          </div>
        ))}
      </div>
      <div className="tracking-reflections">
        <span>
          <Check size={15} /> Günlük pratik kaydı
        </span>
        <span>
          <MessageCircle size={15} /> 4 refleksiyon
        </span>
        <span>
          <Heart size={15} /> Süreç devam ediyor
        </span>
      </div>
    </div>
  );
}
