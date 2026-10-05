# Shinobi Auction

İki farklı internet ağındaki oyuncular için Node.js + WebSocket tabanlı çevrimiçi açık artırma oyunu.

## Render'a yayınlama

1. Bu klasörü bir GitHub deposuna yükle.
2. Render'da **New → Blueprint** seç ve GitHub deposunu bağla.
3. `render.yaml` dosyasını onayla.
4. Deploy tamamlanınca Render'ın verdiği `https://...onrender.com` adresini aç.
5. Birinci oyuncu oda oluşturur, çıkan 4 haneli kodu ikinci oyuncuya gönderir.
6. İkinci oyuncu aynı adreste kodu girerek odaya katılır.

Yerelde çalıştırmak için Node.js kurulu olmalı:

```bash
npm install
npm start
```

Ücretsiz Render servisleri 15 dakika trafik almazsa uykuya geçebilir; ilk bağlantıda kısa bir açılış beklemesi normaldir. Oyun durumu geçicidir ve sunucu yeniden başlarsa devam eden oda kapanır.
