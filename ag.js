// =============================================================
// Lanetli Vazolar - online oyun (2-4 kişi, oda koduyla)
// Bağlantı PeerJS ile cihazlar arasında doğrudan kurulur (kendi sunucumuz yok).
// Herkes odayı açan cihaza ("ev") bağlanır:
//
//   Ev:      oyunun "tohum"unu (ortak rastgele sayı başlangıcını) seçer. Herkesin hamlesini
//            (girdi) sıraya koyar, deftere yazar ve aynı sırayla herkese yollar.
//   Misafir: kendi hamlelerini eve yollar; gelen girdileri sırayla uygular.
//
// Herkes aynı tohum + aynı girdi sırasıyla oynadığı için her telefonda oyun birebir aynı akar.
// Bağlantısı kopan oyuncu aynı kod ve aynı adla geri girer: ev ona defteri yollar, telefonu
// kaçırdığı hamleleri sessizce ve hızlıca yeniden oynayıp kaldığı yere gelir.
//
// Mesajlar:
//   misafir → ev: { tip: 'katil', ad, surum }  { tip: 'girdi', g }  { tip: 'nabiz' }
//   ev → misafir: { tip: 'kabul', no, surum }  { tip: 'lobi', isimler }  { tip: 'red', neden }
//                 { tip: 'basla', isimler, tohum, defter }  { tip: 'girdi', g }
//                 { tip: 'koptu', no }  { tip: 'dondu', no }  { tip: 'nabiz' }
// =============================================================

const Ag = (() => {
  // Online kısmı her değiştiğinde 1 artır: eski sürümle gelen oyuncu odaya alınmaz
  const SURUM = 1;
  const ODA_ONEKI = 'lanetli-vazolar-oda-';
  const KOD_HARFLERI = 'ABCDEFGHJKLMNPRSTUVYZ23456789';  // karışabilecek O/0, I/1 yok
  const KOD_UZUNLUK = 5;
  const EN_FAZLA = 4;
  const NABIZ_ARALIGI = 3000;
  const NABIZ_ZAMAN_ASIMI = 30000;
  const OTOMATIK_SURE = 8000;   // kopan oyuncunun sırası bu kadar bekledikten sonra otomatik oynanır
  const AD_ANAHTARI = 'lanetliVazolar.onlineAd';
  const OTOMATIK_KATIL = 'lanetliVazolar.otomatikKatil';

  const ag = {
    peer: null,
    baglanti: null,    // misafirde: eve olan bağlantı
    misafirler: [],    // evde: { baglanti, no, ad, sonMesaj }
    basladi: false,
    isimler: [],
    tohum: 0,
    defter: [],        // evde: oyunun başından beri bütün girdiler
    kod: '',
    sonMesaj: 0,
    nabiz: null,
  };

  // ---------- Ortak ----------
  function gonder(mesaj) {
    if (AG.mod === 'misafir') {
      if (ag.baglanti?.open) ag.baglanti.send(mesaj);
      return;
    }
    ag.misafirler.forEach(m => {
      if (m.baglanti.open) m.baglanti.send(mesaj);
    });
  }

  function durumYaz(html) {
    $('onlineDurum').innerHTML = html;
  }

  function adiAl() {
    const kutu = $('onlineAd');
    const ad = kutu.value.trim().slice(0, 12);
    if (!ad) {
      kutu.classList.remove('eksik');
      void kutu.offsetWidth;
      kutu.classList.add('eksik');
      kutu.focus();
      durumYaz('✏️ Önce adını yaz.');
      return null;
    }
    try {
      localStorage.setItem(AD_ANAHTARI, ad);
    } catch (e) { /* hatırlanmasa da olur */ }
    return ad;
  }

  function peerVarMi() {
    if (typeof Peer !== 'undefined') return true;
    durumYaz('❌ Online bağlantı kütüphanesi yüklenemedi. İnternet bağlantını kontrol et.');
    return false;
  }

  function kilitle() {
    ['odaAcBtn', 'katilBtn', 'odaKodu', 'onlineAd', 'baslaBtn'].forEach(id => ($(id).disabled = true));
  }

  // İnternet gidip gelince PeerJS sunucusuyla bağlantı da kopar; birkaç saniyede bir yeniden denenir
  function sunucuyaYenidenBaglan(peer) {
    peer.on('disconnected', () => {
      setTimeout(() => {
        if (peer.destroyed || !peer.disconnected) return;
        try {
          peer.reconnect();
        } catch (e) { /* bir sonraki denemede yine denenir */ }
      }, 2000);
    });
  }

  // Düzenli nabız: ev herkese atar ve uzun süre sessiz kalanı düşürür; misafir eve atar
  function nabziBaslat() {
    ag.sonMesaj = Date.now();
    clearInterval(ag.nabiz);
    ag.nabiz = setInterval(() => {
      gonder({ tip: 'nabiz' });
      if (AG.mod === 'ev') {
        ag.misafirler.filter(m => Date.now() - m.sonMesaj > NABIZ_ZAMAN_ASIMI).forEach(m => {
          m.baglanti.close();
          misafirKoptu(m);
        });
      } else if (ag.baglanti && Date.now() - ag.sonMesaj > NABIZ_ZAMAN_ASIMI) {
        baglantiKoptu();
      }
    }, NABIZ_ARALIGI);
  }

  // ---------- Ev: oda açma ----------
  function odaAc() {
    const ad = adiAl();
    if (!ad || !peerVarMi()) return;
    const kod = [...Array(KOD_UZUNLUK)].map(() => KOD_HARFLERI[Math.floor(Math.random() * KOD_HARFLERI.length)]).join('');
    durumYaz('⏳ Oda açılıyor...');
    try {
      ag.peer?.destroy();
    } catch (e) { /* eski deneme zaten kapanmış */ }
    ag.peer = new Peer(ODA_ONEKI + kod);
    ag.peer.on('open', () => {
      if (AG.mod === 'ev') return;  // internet gidip gelince tekrar "open" gelir; oda zaten açık
      AG.mod = 'ev';
      AG.benimNo = 0;
      ag.kod = kod;
      ag.isimler = [ad];
      kilitle();
      nabziBaslat();
      lobiyiCiz();
    });
    sunucuyaYenidenBaglan(ag.peer);
    ag.peer.on('connection', baglanti => {
      const misafir = { baglanti, no: null, ad: '', sonMesaj: Date.now() };
      baglanti.on('data', m => {
        misafir.sonMesaj = Date.now();
        if (m?.tip !== 'nabiz') evMesaji(misafir, m);
      });
      baglanti.on('close', () => misafirKoptu(misafir));
      baglanti.on('error', () => misafirKoptu(misafir));
    });
    ag.peer.on('error', e => {
      if (e.type === 'unavailable-id') odaAc();  // kod alınmışsa yenisi denenir
      else if (AG.mod !== 'ev') durumYaz(`❌ Oda açılamadı (${e.type}). İnternet bağlantını kontrol et.`);
    });
  }

  function lobiyiCiz() {
    const isimler = [ag.isimler[0], ...ag.misafirler.map(m => m.ad)];
    durumYaz(`Oda kodun: <b class="odaKodu">${ag.kod}</b><br>Bu kodu arkadaşına söyle, "Katıl" kısmına yazsın.`
      + lobiListesi(isimler, 0)
      + (ag.misafirler.length ? 'Herkes geldiyse "Oyunu başlat"a bas.' : '⏳ Arkadaşın bekleniyor...'));
    $('onlineBaslaBtn').hidden = false;
    $('onlineBaslaBtn').disabled = !ag.misafirler.length;
    gonder({ tip: 'lobi', isimler });
  }

  function lobiListesi(isimler, benimNo) {
    return `<ol class="lobiListesi">${isimler.map((ad, i) => `<li><span class="nokta" style="background:${RENKLER[i].hex}"></span>`
      + `${guvenli(ad)}${i === 0 ? ' <small>(oda sahibi)</small>' : ''}${i === benimNo ? ' <b>(sen)</b>' : ''}</li>`).join('')}</ol>`;
  }

  function reddet(baglanti, neden) {
    baglanti.send({ tip: 'red', neden });
    setTimeout(() => baglanti.close(), 500);
  }

  function evMesaji(misafir, m) {
    if (m?.tip === 'katil' && misafir.no === null) {
      if (m.surum !== SURUM) {
        reddet(misafir.baglanti, 'Uygulaman eski sürümde kalmış. Uygulamayı tamamen kapatıp yeniden aç (tarayıcıdaysan sayfayı yenile), sonra tekrar katıl.');
        return;
      }
      const ad = String(m.ad ?? '').trim().slice(0, 12) || 'Oyuncu';
      if (ag.basladi) {
        geriAl(misafir, ad);
        return;
      }
      if (ag.misafirler.length >= EN_FAZLA - 1) {
        reddet(misafir.baglanti, `Oda dolu (${EN_FAZLA} kişi).`);
        return;
      }
      misafir.ad = ad;
      ag.misafirler.push(misafir);
      numaralariDagit();
      lobiyiCiz();
      Ses.secim();
      return;
    }
    // Misafir sadece kendi adına hamle yapabilir
    if (m?.tip === 'girdi' && misafir.no !== null && ag.basladi && m.g && typeof m.g.tip === 'string') {
      yay({ ...m.g, no: misafir.no });
    }
  }

  // Bekleme odasında her misafire oyuncu numarasını bildir (biri ayrılınca numaralar kayar)
  function numaralariDagit() {
    ag.misafirler.forEach((m, i) => {
      m.no = i + 1;
      if (m.baglanti.open) m.baglanti.send({ tip: 'kabul', no: m.no, surum: SURUM });
    });
  }

  // Oyun başladıktan sonra gelen: aynı adla kopmuş bir oyuncu varsa onun yerine geri girer
  function geriAl(misafir, ad) {
    const kucuk = s => s.trim().toLocaleLowerCase('tr');
    const no = ag.isimler.findIndex((x, i) => i > 0 && kucuk(x) === kucuk(ad));
    if (no === -1) {
      reddet(misafir.baglanti, 'Oyun başlamış. Bağlantısı kopan bir oyuncuysan oyundaki adının aynısını yazıp tekrar katıl.');
      return;
    }
    const eski = ag.misafirler.find(x => x.no === no);
    if (eski) {
      ag.misafirler.splice(ag.misafirler.indexOf(eski), 1);
      eski.baglanti.close();
    }
    misafir.no = no;
    misafir.ad = ag.isimler[no];
    ag.misafirler.push(misafir);
    misafir.baglanti.send({ tip: 'kabul', no, surum: SURUM });
    misafir.baglanti.send({ tip: 'basla', isimler: ag.isimler, tohum: ag.tohum, defter: ag.defter });
    gonder({ tip: 'dondu', no });
    dondu(no);
  }

  function misafirKoptu(misafir) {
    const sira = ag.misafirler.indexOf(misafir);
    if (sira === -1) return;
    ag.misafirler.splice(sira, 1);
    if (!ag.basladi) {
      numaralariDagit();
      lobiyiCiz();
      return;
    }
    gonder({ tip: 'koptu', no: misafir.no });
    koptu(misafir.no);
  }

  function oyunuBaslatEv() {
    if (AG.mod !== 'ev' || !ag.misafirler.length || ag.basladi) return;
    ag.basladi = true;
    ag.isimler = [ag.isimler[0], ...ag.misafirler.map(m => m.ad)];
    ag.tohum = Math.floor(Math.random() * 2 ** 31);
    gonder({ tip: 'basla', isimler: ag.isimler, tohum: ag.tohum, defter: [] });
    $('onlineBaslaBtn').hidden = true;
    oyunuBaslat(ag.isimler, ag.tohum);
  }

  // Girdiyi deftere yaz, herkese yolla, kendinde de uygula
  function yay(g) {
    ag.defter.push(g);
    gonder({ tip: 'girdi', g });
    girdiAl(g);
  }

  // ---------- Misafir: odaya katılma ----------
  function odayaKatil(kod = $('odaKodu').value.trim().toUpperCase()) {
    const ad = adiAl();
    if (!ad || !peerVarMi()) return;
    if (kod.length !== KOD_UZUNLUK) {
      durumYaz(`Oda kodu ${KOD_UZUNLUK} karakter olmalı.`);
      return;
    }
    ag.kod = kod;
    durumYaz('⏳ Odaya bağlanılıyor...');
    try {
      ag.peer?.destroy();
    } catch (e) { /* eski bağlantı zaten kapanmış */ }
    const peer = new Peer();
    ag.peer = peer;
    sunucuyaYenidenBaglan(peer);
    peer.on('open', () => {
      if (ag.peer !== peer || ag.baglanti) return;
      const baglanti = peer.connect(ODA_ONEKI + kod, { reliable: true });
      baglanti.on('open', () => {
        ag.baglanti = baglanti;
        AG.mod = 'misafir';
        gonder({ tip: 'katil', ad, surum: SURUM });
        nabziBaslat();
      });
      baglanti.on('data', m => {
        ag.sonMesaj = Date.now();
        if (m?.tip !== 'nabiz') misafirMesaji(m);
      });
      baglanti.on('close', () => ag.baglanti === baglanti && baglantiKoptu());
      baglanti.on('error', () => ag.baglanti === baglanti && baglantiKoptu());
    });
    peer.on('error', e => {
      if (ag.peer !== peer || ag.baglanti) return;
      durumYaz(e.type === 'peer-unavailable'
        ? '❌ Bu kodla bir oda bulunamadı. Arkadaşının oyunu açık mı? Kodu kontrol et.'
        : `❌ Bağlanılamadı (${e.type}). İnternet bağlantını kontrol et.`);
      $('baglantiMetni').textContent = 'Odaya bağlanılamadı. Oda sahibinin oyunu hâlâ açık mı?';
    });
  }

  function misafirMesaji(m) {
    if (m?.tip === 'kabul' && Number.isInteger(m.no)) {
      if (m.surum !== SURUM) {
        ag.baglanti.close();
        ag.baglanti = null;
        AG.mod = 'yerel';
        durumYaz('❌ Oda sahibinin uygulaması farklı sürümde. İkiniz de uygulamayı kapatıp yeniden açın.');
        return;
      }
      AG.benimNo = m.no;
      kilitle();
    } else if (m?.tip === 'lobi' && Array.isArray(m.isimler)) {
      durumYaz(`✅ Odaya bağlandın! Oyunu oda sahibi başlatacak, bekle...${lobiListesi(m.isimler, AG.benimNo)}`);
    } else if (m?.tip === 'red') {
      ag.baglanti = null;
      AG.mod = 'yerel';
      durumYaz(`❌ Odaya girilemedi: ${guvenli(m.neden ?? '')}`);
      $('baglantiMetni').textContent = `Odaya girilemedi: ${m.neden ?? ''}`;
    } else if (m?.tip === 'basla' && Array.isArray(m.isimler)) {
      ag.isimler = m.isimler;
      try {
        sessionStorage.setItem(OTOMATIK_KATIL, JSON.stringify({ kod: ag.kod, ad: $('onlineAd').value.trim() }));
      } catch (e) { /* kopunca kodu elle yazar */ }
      const defter = Array.isArray(m.defter) ? m.defter : [];
      if (defter.length) {
        // Geri dönüş: kaçırılan hamleler sessizce ve animasyonsuz yeniden oynanır
        HIZLI.acik = true;
        Sahne.hizli(true);
        Ses.sustur(true);
        $('baglantiMetni').textContent = '⏳ Oyuna geri dönülüyor, kaçırdığın hamleler yükleniyor...';
        $('yenidenBaglanBtn').hidden = true;
        $('baglantiEkrani').hidden = false;
      }
      oyunuBaslat(m.isimler, m.tohum);
      defter.forEach(g => girdiAl(g));
      if (HIZLI.acik && durum.hazir && !durum.kuyruk.length) hizliBitir();
    } else if (m?.tip === 'girdi' && m.g) {
      girdiAl(m.g);
    } else if (m?.tip === 'koptu' && Number.isInteger(m.no)) {
      koptu(m.no);
    } else if (m?.tip === 'dondu' && Number.isInteger(m.no)) {
      dondu(m.no);
    }
  }

  // Misafirde: oda sahibiyle bağlantı koptu. "Yeniden bağlan" sayfayı yenileyip aynı odaya otomatik girer.
  function baglantiKoptu() {
    if (!ag.baglanti) return;
    ag.baglanti = null;
    if (durum.asama === 'menu') {
      AG.mod = 'yerel';
      durumYaz('📡 Oda sahibiyle bağlantı koptu. Tekrar katılmayı dene.');
      ['odaAcBtn', 'katilBtn', 'odaKodu', 'onlineAd', 'baslaBtn'].forEach(id => ($(id).disabled = false));
      return;
    }
    $('baglantiMetni').textContent = 'Oda sahibiyle bağlantın kesildi. İnternetin geldiyse yeniden bağlanıp kaldığın yerden devam edebilirsin.';
    $('yenidenBaglanBtn').hidden = false;
    $('baglantiEkrani').hidden = false;
  }

  // ---------- Kopan ve dönen oyuncular (herkeste) ----------
  function koptu(no) {
    const o = durum.oyuncular[no];
    if (!o) return;
    o.koptu = true;
    oyunculariCiz();
    if (durum.asama === 'yerlestir' || durum.asama === 'oyun') {
      mesaj(`📡 ${adEtiketi(o)} oyuncusunun bağlantısı koptu. Aynı kod ve adla geri girebilir; o zamana kadar sırası otomatik oynanır.`);
    }
    hazirOldu();
  }

  function dondu(no) {
    const o = durum.oyuncular[no];
    if (!o) return;
    o.koptu = false;
    oyunculariCiz();
  }

  // Evde: sıra kopmuş bir oyuncudaysa biraz bekleyip onun yerine en sade hamleyi yap
  function hazirOldu() {
    if (AG.mod !== 'ev') return;
    const adim = durum.adim;
    // Tur başında geri dönmesi için uzun beklenir; turun devamındaki adımlar hızlı geçer
    setTimeout(() => otomatikHamle(adim), durum.hazir === 'turBasi' || durum.asama !== 'oyun' ? OTOMATIK_SURE : 1500);
  }

  function otomatikHamle(adim) {
    if (AG.mod !== 'ev') return;
    if (durum.asama === 'yerlestir') {
      // Kopan oyuncu yılanlarını saklamadıysa onun yerine rastgele saklanır
      durum.oyuncular.forEach((o, no) => {
        if (!o.koptu || o.yilanlar) return;
        const bos = [...Array(VAZO_SAYISI).keys()].sort(() => Math.random() - 0.5).slice(0, CAN);
        yay({ tip: 'yerlestir', no, adim: 0, vazolar: bos });
      });
      return;
    }
    const o = aktif();
    if (durum.adim !== adim || !durum.hazir || durum.asama !== 'oyun' || !o?.koptu) return;
    const g = { no: durum.sira, adim };
    // Seçim evde yapılıp girdiyle herkese gider; ortak tohumu bozmamak için Math.random kullanılır
    const rastgeleVazo = () => {
      const liste = kirilmamislar();
      return liste[Math.floor(Math.random() * liste.length)];
    };
    if (durum.hazir === 'turBasi') yay({ ...g, tip: 'direkt' });
    else if (durum.hazir === 'secim') yay({ ...g, tip: { sira: 'sira', dortlu: 'dortlu' }[durum.gorev.tur] ?? 'vazo', i: rastgeleVazo() });
    else if (durum.hazir === 'vur') yay({ ...g, tip: 'vur' });
    else if (durum.hazir === 'kart') yay({ ...g, tip: 'tamam' });
    else if (durum.hazir === 'rakip') {
      const hedef = durum.oyuncular.findIndex((r, no) => no !== durum.sira && r.can > 0);
      yay({ ...g, tip: 'rakip', hedef });
    }
  }

  // Misafirin hamlesi eve gider; ev kendi hamlesini doğrudan yayar
  function girdiGonder(g) {
    if (AG.mod === 'misafir') gonder({ tip: 'girdi', g });
    else if (AG.mod === 'ev') yay(g);
  }

  // ---------- Kurulum ----------
  try {
    $('onlineAd').value = localStorage.getItem(AD_ANAHTARI) ?? '';
  } catch (e) { /* hatırlanmadıysa boş */ }
  $('onlineAd').addEventListener('input', () => $('onlineAd').classList.remove('eksik'));
  $('odaAcBtn').addEventListener('click', odaAc);
  $('katilBtn').addEventListener('click', () => odayaKatil());
  $('odaKodu').addEventListener('keydown', e => {
    if (e.key === 'Enter') odayaKatil();
  });
  $('onlineBaslaBtn').addEventListener('click', oyunuBaslatEv);
  $('yenidenBaglanBtn').addEventListener('click', () => location.reload());
  $('surumNotu').textContent = `sürüm ${SURUM}`;

  // Bağlantı kopup sayfa yenilenince aynı odaya otomatik geri girilir
  try {
    const otomatik = JSON.parse(sessionStorage.getItem(OTOMATIK_KATIL));
    if (otomatik?.kod) {
      $('onlineAd').value = otomatik.ad;
      $('odaKodu').value = otomatik.kod;
      setTimeout(() => odayaKatil(otomatik.kod), 300);
    }
  } catch (e) { /* elle katılınır */ }

  return { girdiGonder, hazirOldu };
})();
