// =============================================================
// Lanetli Vazolar - oyun kuralları ve ekranlar
// Akış: menü → herkes gizlice 3 yılan saklar → sırası gelen ya kart çeker
//        ya da sadece 1 vazo kırar → yılan çıkarsa kıran (ya da kartla seçilen kurban)
//        1 can kaybeder → canı biten elenir → son kalan kazanır
//
// Online için: oyun bütün telefonlarda aynı "tohum"la (aynı rastgele sayı dizisiyle) çalışır.
// Oyuncunun her hamlesi bir "girdi" olur (kart çek, vazo seç, vur...). Girdiler oda sahibi
// üzerinden herkese aynı sırayla gider ve her telefon aynı girdiyi aynı anda (hazir olduğu
// adımda) uygular. Böylece kırılan vazolar, çıkan yılanlar herkeste birebir aynı olur.
// =============================================================

const RENKLER = [
  { ad: 'Kırmızı', hex: '#e23b3b' },
  { ad: 'Mavi', hex: '#3b82f6' },
  { ad: 'Yeşil', hex: '#22c55e' },
  { ad: 'Sarı', hex: '#facc15' },
];
const CAN = 3;               // her oyuncunun canı = sakladığı yılan sayısı
const VAZO_SAYISI = 30;
const ISIM_ANAHTARI = 'lanetliVazolar.isimler';

// 40 kartlık deste: 26 iyi (%65), 14 kötü. Adetleri değiştirerek oranla oynayabilirsin.
// Güçlü kartlar (Başkası Adına, Dörtlü Göz, Can Ekle) bilerek nadir tutuldu.
const KARTLAR = {
  pas:    { iyi: true,  adet: 6,  ikon: '⏭️', ad: 'Pas', aciklama: 'Bu tur hiç vazo kırmadan sıranı geçirirsin.' },
  yon:    { iyi: true,  adet: 6,  ikon: '🔄', ad: 'Ters Dön', aciklama: 'Sıranın yönü tersine döner. Bu tur vazo kırmazsın.' },
  muska:  { iyi: true,  adet: 3,  ikon: '🧿', ad: 'Nazar Muskası', aciklama: 'Sana gelecek bir sonraki yılanı engeller. Şimdi 1 vazo kır.' },
  hediye: { iyi: true,  adet: 3,  ikon: '🎁', ad: 'Lanet Hediyesi', aciklama: '1 vazo kır. Senden sonraki oyuncu 2 vazo kırmak zorunda kalır!' },
  adina:  { iyi: true,  adet: 3,  ikon: '🎭', ad: 'Başkası Adına', aciklama: 'Bir rakip seç, sonra bir vazo kır. Yılan çıkarsa canı giden o olur! (Kendi yılanının yerini biliyorsun...)' },
  dortlu: { iyi: true,  adet: 3,  ikon: '👁️', ad: 'Dörtlü Göz', aciklama: 'Kare şeklindeki 4 vazoyu seç. Altlarında kaç yılan olduğu herkese söylenir. Sonra 1 vazo kırarsın.' },
  can:    { iyi: true,  adet: 2,  ikon: '💖', ad: 'Can Ekle', aciklama: '+1 can kazanırsın! Sonra 1 vazo kırarsın.' },
  iki:    { iyi: false, adet: 7,  ikon: '✌️', ad: 'Çifte Lanet', aciklama: 'Peş peşe 2 vazo kırmak zorundasın.' },
  uc:     { iyi: false, adet: 5,  ikon: '💀', ad: 'Üçlü Lanet', aciklama: 'Peş peşe 3 vazo kırmak zorundasın.' },
  kor:    { iyi: false, adet: 1,  ikon: '🎲', ad: 'Kör Talih', aciklama: 'Vazoyu sen seçemezsin. Lanet senin yerine seçer.' },
  sira:   { iyi: false, adet: 1,  ikon: '☠️', ad: 'Lanetli Sıra', aciklama: 'Bir sıra seç. O sıradaki bütün vazolar tek tek kendiliğinden kırılır. Çıkan her yılan senden can alır!' },
};

// Hangi beklemede hangi girdiler kabul edilir
const KABUL = {
  turBasi: ['kart', 'direkt'],
  secim: ['vazo', 'dortlu', 'sira'],
  vur: ['vur', 'vazgec', 'vazo'],
  kart: ['tamam'],
  rakip: ['rakip'],
};

// Bu cihazın rolü: yerel (tek telefon), ev (odayı açan), misafir (katılan). ag.js değiştirir.
const AG = { mod: 'yerel', benimNo: 0 };
// Geri dönen oyuncu, kaçırdığı hamleleri animasyonsuz ve sessiz bir hızla yeniden oynar
const HIZLI = { acik: false };

const $ = id => document.getElementById(id);
const bekle = ms => (HIZLI.acik ? Promise.resolve() : new Promise(coz => setTimeout(coz, ms)));

// Tohumlu rastgele sayı (mulberry32): aynı tohum, her telefonda aynı sayı dizisi
let tohum = 1;
function rastgele() {
  tohum = (tohum + 0x6d2b79f5) | 0;
  let t = Math.imul(tohum ^ (tohum >>> 15), 1 | tohum);
  t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
  return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
}
const sec = liste => liste[Math.floor(rastgele() * liste.length)];
function karistir(liste) {
  for (let i = liste.length - 1; i > 0; i--) {
    const j = Math.floor(rastgele() * (i + 1));
    [liste[i], liste[j]] = [liste[j], liste[i]];
  }
  return liste;
}

const durum = {
  asama: 'menu',      // menu | yerlestir | oyun | bitti
  oyuncular: [],      // { ad, renk, hex, can, muska, yilanlar: [vazo no], koptu }
  vazolar: [],        // { sahipler: [oyuncu no], vurusGerek, vurus, kirik, davranis, hisirti }
  sira: 0,
  yon: 1,             // 1 = saat yönü, -1 = ters (Ters Dön kartı)
  deste: [],
  ceza: 0,            // Lanet Hediyesi: sıradaki oyuncunun zorunlu kıracağı vazo sayısı
  gorev: null,        // bu tur ne yapılacak: { kalan, hedef, tur: normal | kor | sira | dortlu }
  secimAcik: false,   // vazoya dokunulabilir mi
  secili: -1,
  mesgul: false,
  oyuncuSayisi: 4,
  yerlesim: new Set(),
  hazir: null,        // şu an hangi girdi bekleniyor (KABUL'deki anahtarlardan biri)
  adim: 0,            // kaçıncı bekleme: herkeste aynı sayılır, eski/tekrar girdiler ayıklanır
  kuyruk: [],         // gelmiş ama henüz sırası gelmemiş girdiler
  isleniyor: false,
  kartBitti: null,    // açık kartın "Tamam"ı gelince devam ettirecek fonksiyon
  rakipSecildi: null,
};

const aktif = () => durum.oyuncular[durum.sira];
const cevrimici = () => AG.mod !== 'yerel';
const benimSiram = () => !cevrimici() || durum.sira === AG.benimNo;

// ---------- Türkçe ekler: "Mavi'de", "Kırmızı'da", "Mavi'ye", "Sarı'ya" ----------
function kalinMi(kelime) {
  const unluler = kelime.toLocaleLowerCase('tr').match(/[aeıioöuü]/g) || ['e'];
  return 'aıou'.includes(unluler[unluler.length - 1]);
}
const ekDa = ad => `'${/[fstkçşhp]$/i.test(ad) ? 't' : 'd'}${kalinMi(ad) ? 'a' : 'e'}`;
const ekA = ad => `'${/[aeıioöuü]$/i.test(ad) ? 'y' : ''}${kalinMi(ad) ? 'a' : 'e'}`;
const guvenli = s => String(s).replace(/[&<>"']/g, c => `&#${c.charCodeAt(0)};`);
const adEtiketi = o => `<span style="color:${o.hex}">${guvenli(o.ad)}</span>`;

// ---------- Girdiler: her hamle buradan geçer ----------
function girdi(tip, veri = {}, no = cevrimici() ? AG.benimNo : durum.sira) {
  const g = { tip, no, adim: durum.adim, ...veri };
  if (cevrimici()) Ag.girdiGonder(g);
  else girdiAl(g);
}

function girdiAl(g) {
  durum.kuyruk.push(g);
  kuyrukIsle();
}

// Sıradaki girdiyi, oyun tam o girdiyi bekleyen adımdaysa uygula.
// Daha önceki adımdan kalanlar (çift tıklama vb.) atılır, ilerideki adımlar beklenir.
function kuyrukIsle() {
  if (durum.isleniyor) return;
  durum.isleniyor = true;
  while (durum.kuyruk.length) {
    const g = durum.kuyruk[0];
    if (g.tip === 'yerlestir') {
      durum.kuyruk.shift();
      yerlesimAl(g);
      continue;
    }
    if (g.adim > durum.adim) break;  // bu telefon o adıma henüz gelmedi (animasyon sürüyor): bekle
    durum.kuyruk.shift();
    // Eski adımın girdisi ya da bu adımda zaten bir girdi uygulanmış (çift tıklama): at
    if (g.adim < durum.adim || !durum.hazir) continue;
    if (!KABUL[durum.hazir].includes(g.tip) || g.no !== durum.sira) continue;
    durum.hazir = null;
    uygula(g);
  }
  durum.isleniyor = false;
}

function uygula(g) {
  if (g.tip === 'kart') kartCek();
  else if (g.tip === 'direkt') gorevBaslat({ kalan: 1 });
  else if (g.tip === 'vazo' && gecerliVazo(g.i)) vazoSec(g.i);
  else if (g.tip === 'dortlu' && gecerliVazo(g.i)) dortluBak(g.i);
  else if (g.tip === 'sira' && gecerliVazo(g.i)) satirAc(g.i);
  else if (g.tip === 'vur') vur();
  else if (g.tip === 'vazgec') vazgec();
  else if (g.tip === 'tamam') durum.kartBitti?.();
  else if (g.tip === 'rakip') durum.rakipSecildi?.(g.hedef);
}

const gecerliVazo = i => Number.isInteger(i) && i >= 0 && i < VAZO_SAYISI && !durum.vazolar[i].kirik;

// Oyun bir girdi beklemeye başladı (herkeste aynı sırayla)
function hazirOl(tip) {
  durum.hazir = tip;
  durum.adim++;
  if (HIZLI.acik && !durum.kuyruk.length) hizliBitir();
  if (cevrimici()) Ag.hazirOldu();
  kuyrukIsle();
}

function hizliBitir() {
  HIZLI.acik = false;
  Sahne.hizli(false);
  Ses.sustur(false);
  $('baglantiEkrani').hidden = true;
}

// ---------- Menü ----------
function menuKur() {
  let kayitli = [];
  try {
    kayitli = JSON.parse(localStorage.getItem(ISIM_ANAHTARI)) || [];
  } catch (e) { /* ilk kez oynanıyor */ }

  const sayilar = $('oyuncuSayisi');
  [2, 3, 4].forEach(n => {
    const b = document.createElement('button');
    b.textContent = n;
    b.onclick = () => {
      durum.oyuncuSayisi = n;
      isimleriCiz();
    };
    sayilar.appendChild(b);
  });

  function isimleriCiz() {
    [...sayilar.children].forEach(b => b.classList.toggle('secili', +b.textContent === durum.oyuncuSayisi));
    const kutu = $('isimler');
    const eski = [...kutu.querySelectorAll('input')].map(i => i.value);
    kutu.innerHTML = '';
    for (let k = 0; k < durum.oyuncuSayisi; k++) {
      const satir = document.createElement('label');
      satir.className = 'isimSatiri';
      satir.innerHTML = `<span class="nokta" style="background:${RENKLER[k].hex}"></span>`;
      const giris = document.createElement('input');
      giris.maxLength = 12;
      giris.placeholder = RENKLER[k].ad;
      giris.value = eski[k] ?? kayitli[k] ?? '';
      satir.appendChild(giris);
      kutu.appendChild(satir);
    }
  }
  isimleriCiz();

  $('baslaBtn').onclick = () => {
    const isimler = [...$('isimler').querySelectorAll('input')].map((g, k) => g.value.trim() || RENKLER[k].ad);
    try {
      localStorage.setItem(ISIM_ANAHTARI, JSON.stringify(isimler));
    } catch (e) { /* kaydedilemezse sorun değil */ }
    oyunuBaslat(isimler, Math.floor(Math.random() * 2 ** 31));
  };
  // Online oyunda "Tekrar oyna" sayfayı yeniler: oda baştan açılır
  $('tekrarBtn').onclick = () => {
    if (cevrimici()) {
      menuyeDon();
      return;
    }
    $('sonuc').hidden = true;
    $('menu').hidden = false;
    $('deste').hidden = true;
    durum.asama = 'menu';
    $('oyuncular').innerHTML = '';
    mesaj('');
  };
  $('sesBtn').onclick = () => sesDugmesi(Ses.acKapa());

  // Ana menüye dönüş: onay sorulur. Evet denirse sayfa baştan yüklenir; böylece
  // yarım kalan vuruşlar, yılanlar ve sesler temizce durur (isimler hatırlanır).
  $('menuBtn').onclick = () => {
    Ses.secim();
    $('cikisMetni').textContent = cevrimici()
      ? 'Emin misin? Online oyundan çıkacaksın. Aynı oda kodu ve aynı adla geri girebilirsin.'
      : 'Emin misin? Bu oyun silinecek ve baştan başlayacaksınız.';
    $('cikisEkrani').hidden = false;
  };
  $('cikisHayir').onclick = () => ($('cikisEkrani').hidden = true);
  $('cikisEvet').onclick = menuyeDon;
  sesDugmesi(Ses.acik);
}

// Bilerek çıkılınca, bağlantı kopmasındaki gibi odaya otomatik geri girilmesin
function menuyeDon() {
  try {
    sessionStorage.removeItem('lanetliVazolar.otomatikKatil');
  } catch (e) { /* zaten yoksa sorun değil */ }
  location.reload();
}

function sesDugmesi(acik) {
  $('sesBtn').textContent = acik ? '🔊' : '🔇';
}

// Hem tek telefonda hem online'da oyun buradan başlar (online'da herkes aynı tohumla)
function oyunuBaslat(isimler, yeniTohum) {
  Ses.ortamBaslat();
  tohum = yeniTohum;
  durum.oyuncular = isimler.map((ad, k) => ({ ad, renk: RENKLER[k].ad, hex: RENKLER[k].hex, can: CAN, muska: 0, yilanlar: null, koptu: false }));
  Object.assign(durum, {
    vazolar: [], sira: 0, yon: 1, ceza: 0, gorev: null, secimAcik: false, secili: -1, mesgul: false,
    hazir: null, adim: 0, kuyruk: [], isleniyor: false,
  });
  desteKur();
  Sahne.sifirla();
  $('menu').hidden = true;
  $('menuBtn').hidden = false;
  oyunculariCiz();
  if (cevrimici()) cevrimiciYerlestirme();
  else yerlestirmeyeGec(0);
}

// ---------- Ortak pencereler ----------
function perde(baslik, aciklama, dugme) {
  return new Promise(coz => {
    $('perdeBaslik').innerHTML = baslik;
    $('perdeAciklama').textContent = aciklama;
    $('perdeBtn').textContent = dugme;
    $('perde').hidden = false;
    $('perdeBtn').onclick = () => {
      $('perde').hidden = true;
      Ses.secim();
      coz();
    };
  });
}

// Kart herkese gösterilir; "Tamam"a sadece sırası gelen basar
function kartGoster(kart, dugme = 'Tamam') {
  return new Promise(coz => {
    const el = $('oyunKarti');
    el.className = 'oyunKarti ' + (kart.iyi ? 'iyi' : 'kotu');
    el.innerHTML = `
      <div class="etiket">${kart.etiket || (kart.iyi ? 'İYİ KART' : 'KÖTÜ KART')}</div>
      <div class="ikon">${kart.ikon}</div>
      <h2>${kart.ad}</h2>
      <p>${kart.aciklama}</p>`;
    $('kartTamam').textContent = dugme;
    $('kartTamam').hidden = !benimSiram();
    $('kartBekle').hidden = benimSiram();
    $('kartBekle').innerHTML = `${adEtiketi(aktif())} kartı okuyor...`;
    $('kartEkrani').hidden = HIZLI.acik;
    durum.kartBitti = () => {
      durum.kartBitti = null;
      $('kartEkrani').hidden = true;
      coz();
    };
    hazirOl('kart');
  });
}

function rakipSec(rakipler) {
  return new Promise(coz => {
    const kutu = $('rakipler');
    kutu.innerHTML = '';
    rakipler.forEach(no => {
      const o = durum.oyuncular[no];
      const b = document.createElement('button');
      b.style.background = o.hex;
      b.textContent = `${o.ad} (${o.can} ❤️)`;
      b.onclick = () => {
        Ses.secim();
        girdi('rakip', { hedef: no });
      };
      kutu.appendChild(b);
    });
    if (benimSiram()) $('rakipEkrani').hidden = HIZLI.acik;
    else mesaj(`🎭 ${adEtiketi(aktif())} kimin adına kıracağını seçiyor...`);
    durum.rakipSecildi = hedef => {
      if (!rakipler.includes(hedef)) hedef = rakipler[0];
      durum.rakipSecildi = null;
      $('rakipEkrani').hidden = true;
      coz(hedef);
    };
    hazirOl('rakip');
  });
}

// ---------- Yılan saklama ----------
// Tek telefonda: sırayla, telefon elden ele geçer
async function yerlestirmeyeGec(no) {
  durum.asama = 'yerlestir';
  durum.sira = no;
  durum.yerlesim = new Set();
  const o = durum.oyuncular[no];
  oyunculariCiz();
  mesaj('');
  await perde(
    `🐍 Sıra ${adEtiketi(o)}${ekDa(o.ad)}`,
    `Telefonu ${o.ad}${ekA(o.ad)} ver. Diğerleri ekrana bakmasın! ${o.ad}, ${CAN} vazo seçip yılanlarını saklayacak.`,
    `Ben ${o.ad}, hazırım`,
  );
  kayitDugmesiniAc();
  yerlesimMesaji();
  $('onayBtn').hidden = false;
}

// ---------- 🎙️ Yılan sesi kaydı (isteğe bağlı) ----------
function kayitDugmesiniAc() {
  durum.kayit = null;
  $('sesKaydetBtn').textContent = '🎙️ Yılan sesini kaydet';
  $('sesKaydetBtn').disabled = false;
  $('sesKaydetBtn').hidden = !navigator.mediaDevices?.getUserMedia;
  $('efektSecimi').hidden = true;
}

async function sesKaydet() {
  const dugme = $('sesKaydetBtn');
  dugme.disabled = true;
  $('onayBtn').disabled = true;
  $('efektSecimi').hidden = true;
  mesaj('🔴 Kaydediliyor (2 saniye)... Tısla, bağır, gül, ne istersen!');
  try {
    const efekt = durum.kayit?.efekt ?? 0;  // tekrar kaydedince önceki seçim korunur
    durum.kayit = { ...(await Ses.kaydet(2)), efekt };
    dugme.textContent = '🎙️ Tekrar kaydet';
    efektleriCiz();
    efektSec(efekt);
  } catch (e) {
    mesaj('🎙️ Mikrofona izin verilmedi. Sorun değil: yılanın normal tıslar.');
    dugme.hidden = true;
    await bekle(2500);
    yerlesimMesaji();
  }
  dugme.disabled = false;
  $('onayBtn').disabled = durum.yerlesim.size !== CAN;
}

// Kayıttan sonra 5 efekt düğmesi: basınca o efektle dinlenir ve seçilir.
// Seçilen efekt oyun boyunca hep aynı kalır.
const EFEKT_IKONLARI = ['🗣️', '🐿️', '🐌', '🎵', '👹'];
function efektleriCiz() {
  const kutu = $('efektSecimi');
  kutu.innerHTML = '';
  Ses.EFEKT_ADLARI.forEach((ad, i) => {
    const b = document.createElement('button');
    b.className = 'ikinci';
    b.dataset.efekt = i;
    b.textContent = `${EFEKT_IKONLARI[i]} ${ad[0].toLocaleUpperCase('tr')}${ad.slice(1)}`;
    b.onclick = () => efektSec(i);
    kutu.appendChild(b);
  });
  kutu.hidden = false;
}

function efektSec(i) {
  if (!durum.kayit) return;
  durum.kayit.efekt = i;
  Ses.kayitCal(durum.kayit, i);
  $('efektSecimi').querySelectorAll('button').forEach(b => b.classList.toggle('secili', +b.dataset.efekt === i));
  mesaj(`🎙️ Yılanın böyle çıkacak: <b>${EFEKT_IKONLARI[i]} ${Ses.EFEKT_ADLARI[i]}</b>. Diğerlerini dinlemek için düğmelere bas, beğendiğinde vazolarını seç.`);
}

// Online'da gönderilen kayıt: ham sayılar ArrayBuffer olarak gelir (çok uzunsa kabul edilmez)
function kayitCoz(ses) {
  if (!ses || !(ses.veri instanceof ArrayBuffer || ArrayBuffer.isView(ses.veri))) return null;
  const veri = new Int16Array(ses.veri instanceof ArrayBuffer ? ses.veri : ses.veri.buffer.slice(ses.veri.byteOffset, ses.veri.byteOffset + ses.veri.byteLength));
  const oran = Number(ses.oran);
  if (!veri.length || veri.length > 48000 || !(oran >= 8000 && oran <= 48000)) return null;
  const efekt = Number.isInteger(ses.efekt) && ses.efekt >= 0 && ses.efekt < Ses.EFEKT_ADLARI.length ? ses.efekt : 0;
  return { oran, veri, efekt };
}

// Yılanın sahiplerinin kayıtlarını, her birinin seçtiği efektle çal (birden çok sahip varsa biraz arayla)
function sahipSesleri(i, sahipler) {
  const kayitli = sahipler.filter(o => o.ses);
  kayitli.forEach((o, k) => Ses.kayitCal(o.ses, o.ses.efekt ?? 0, { gecikme: k * 0.35 }));
  return kayitli.length ? ` 🎙️ <small>(${kayitli.map(o => Ses.EFEKT_ADLARI[o.ses.efekt ?? 0]).join(', ')})</small>` : '';
}

// Online'da: herkes aynı anda, kendi telefonunda saklar
function cevrimiciYerlestirme() {
  durum.asama = 'yerlestir';
  durum.sira = AG.benimNo;
  durum.yerlesim = new Set();
  oyunculariCiz();
  if (durum.oyuncular[AG.benimNo].yilanlar) {
    yerlesimBekleniyor();
    return;
  }
  kayitDugmesiniAc();
  yerlesimMesaji();
  $('onayBtn').hidden = false;
}

function yerlesimMesaji() {
  const adet = durum.yerlesim.size;
  const o = durum.oyuncular[cevrimici() ? AG.benimNo : durum.sira];
  const kayit = $('sesKaydetBtn').hidden ? ''
    : durum.kayit ? ` · 🎙️ sesin: ${EFEKT_IKONLARI[durum.kayit.efekt]} ${Ses.EFEKT_ADLARI[durum.kayit.efekt]}`
      : ' · istersen 🎙️ yılan sesini kaydet';
  mesaj(`${adEtiketi(o)}: yılanlarını saklayacağın ${CAN} vazoya dokun (${adet}/${CAN})${kayit}`);
  $('onayBtn').disabled = adet !== CAN;
}

function yerlesimSecimi(i) {
  const o = durum.oyuncular[cevrimici() ? AG.benimNo : durum.sira];
  if (durum.yerlesim.has(i)) {
    durum.yerlesim.delete(i);
    Sahne.isaretle(i, null);
  } else if (durum.yerlesim.size < CAN) {
    durum.yerlesim.add(i);
    Sahne.isaretle(i, o.hex);
    Ses.yerlestir();
  }
  yerlesimMesaji();
}

function yerlesimiOnayla() {
  const secim = [...durum.yerlesim];
  const kayit = durum.kayit;
  Sahne.isaretleriTemizle();
  $('onayBtn').hidden = true;
  $('sesKaydetBtn').hidden = true;
  $('efektSecimi').hidden = true;
  if (cevrimici()) {
    // Kayıt da diğer telefonlara gider (ham sayılar ArrayBuffer olarak + seçilen efekt)
    const ses = kayit ? { oran: kayit.oran, veri: kayit.veri.buffer.slice(0), efekt: kayit.efekt } : null;
    girdi('yerlestir', { vazolar: secim, ses });
    yerlesimBekleniyor();
    return;
  }
  aktif().yilanlar = secim;
  aktif().ses = kayit;
  if (durum.sira + 1 < durum.oyuncular.length) yerlestirmeyeGec(durum.sira + 1);
  else vazolariHazirla();
}

function yerlesimBekleniyor() {
  const bekleyen = durum.oyuncular.filter(o => !o.yilanlar);
  if (bekleyen.length) mesaj(`🐍 Yılanların saklandı. Bekleniyor: ${bekleyen.map(adEtiketi).join(', ')}`);
}

// Online: bir oyuncunun sakladığı yılanlar geldi (herkeste aynı sırayla)
function yerlesimAl(g) {
  const o = durum.oyuncular[g.no];
  const vazolar = Array.isArray(g.vazolar) ? [...new Set(g.vazolar)].filter(i => Number.isInteger(i) && i >= 0 && i < VAZO_SAYISI) : [];
  if (durum.asama !== 'yerlestir' || !o || o.yilanlar || vazolar.length !== CAN) return;
  o.yilanlar = vazolar;
  o.ses = kayitCoz(g.ses);
  if (durum.oyuncular.every(x => x.yilanlar)) vazolariHazirla();
  else if (g.no === AG.benimNo || durum.oyuncular[AG.benimNo].yilanlar) yerlesimBekleniyor();
}

// Herkesin seçimi toplanır. Aynı vazoyu seçenler o vazodaki TEK yılanı paylaşır:
// yılanın çıngırağında hepsinin rengi olur.
async function vazolariHazirla() {
  durum.asama = 'hazirlik';
  const agirlikliVurus = [1, 1, 1, 2, 2, 2, 2, 2, 3, 3, 3, 3, 3, 4, 4, 4, 4, 5, 5, 5];
  durum.vazolar = Array.from({ length: VAZO_SAYISI }, () => ({
    sahipler: [],
    vurusGerek: sec(agirlikliVurus),  // kaç vuruşta kırılacağını kimse bilmez
    vurus: 0,
    kirik: false,
  }));
  durum.oyuncular.forEach((o, no) => o.yilanlar.forEach(i => durum.vazolar[i].sahipler.push(no)));

  // Yılanların davranışı: 1-2 tanesi hemen yüze atlar, 1 tanesi sürünüp giderken
  // birden dönüp yüze atlar, gerisi sürünüp gider
  const yilanliVazolar = karistir(durum.vazolar.filter(v => v.sahipler.length));
  const atlayanSayisi = 1 + Math.floor(rastgele() * 2);
  yilanliVazolar.forEach((v, k) => {
    v.davranis = k < atlayanSayisi ? 'atla' : k === atlayanSayisi ? 'donus' : 'kac';
  });
  // İçeriden hışırtı: yılanlıların çoğunda, ama boşların bir kısmında da (kafa karıştırsın)
  // Gizli yılan: vazo boş sanılır, "oh be" dendiği anda büyük bir kırık parçanın altından çıkar.
  // Şimdilik kapalı (oran 0): yılan kırılır kırılmaz çıksın. Açmak için oranı örneğin 0.3 yap.
  const GIZLI_YILAN_ORANI = 0;
  durum.vazolar.forEach(v => {
    v.hisirti = rastgele() < (v.sahipler.length ? 0.55 : 0.35);
    v.gizli = v.sahipler.length > 0 && rastgele() < GIZLI_YILAN_ORANI;
    v.buyukParca = v.gizli || (!v.sahipler.length && rastgele() < GIZLI_YILAN_ORANI);
  });

  if (cevrimici()) {
    mesaj(`🏺 Bütün yılanlar saklandı! ${adEtiketi(durum.oyuncular[0])} başlıyor...`);
    await bekle(1800);
  } else {
    await perde(
      '🏺 Bütün yılanlar saklandı',
      `Artık herkes ekrana bakabilir. ${durum.oyuncular[0].ad} başlıyor. Kart çekmeye cesaretin var mı?`,
      'Başlasın',
    );
  }
  durum.asama = 'oyun';
  durum.sira = 0;
  siraBasla();
}

// ---------- Deste ----------
function desteKur() {
  const deste = [];
  Object.entries(KARTLAR).forEach(([tur, k]) => {
    for (let n = 0; n < k.adet; n++) deste.push(tur);
  });
  durum.deste = karistir(deste);
}

function iyiOrani() {
  if (!durum.deste.length) desteKur();
  const iyi = durum.deste.filter(t => KARTLAR[t].iyi).length;
  return Math.round((100 * iyi) / durum.deste.length);
}

function desteyiCiz() {
  $('deste').hidden = durum.asama !== 'oyun';
  $('deste').textContent = `🃏 ${durum.deste.length} kart · %${iyiOrani()} iyi`;
}

// ---------- Tur başı: kart mı, tek vazo mu? ----------
function siraBasla() {
  Object.assign(durum, { secili: -1, mesgul: false, secimAcik: false, gorev: null });
  oyunculariCiz();
  desteyiCiz();
  dugmeleriGizle();
  const o = aktif();
  if (durum.ceza) {
    const n = durum.ceza;
    durum.ceza = 0;
    mesaj(`🎁 Lanet Hediyesi! ${adEtiketi(o)} bu tur ${n} vazo kırmak zorunda.`);
    gorevBaslat({ kalan: n });
    return;
  }
  if (benimSiram()) {
    mesaj(`Sıra ${cevrimici() ? 'sende' : adEtiketi(o) + ekDa(o.ad)}! Kart mı çekeceksin, yoksa sadece 1 vazo mu kıracaksın?`);
    $('kartBtn').innerHTML = `🃏 Kart çek <small>%${iyiOrani()} iyi</small>`;
    $('kartBtn').hidden = false;
    $('direktBtn').hidden = false;
  } else {
    mesaj(`Sıra ${adEtiketi(o)}${ekDa(o.ad)}. Kart mı çekecek, yoksa tek vazo mu kıracak?`);
  }
  hazirOl('turBasi');
}

function dugmeleriGizle() {
  ['vurBtn', 'vazgecBtn', 'kartBtn', 'direktBtn'].forEach(id => ($(id).hidden = true));
}

async function kartCek() {
  dugmeleriGizle();
  if (!durum.deste.length) desteKur();
  const tur = durum.deste.pop();
  const kart = KARTLAR[tur];
  Ses.kartCek();
  desteyiCiz();
  await bekle(250);
  if (kart.iyi) Ses.iyiKart();
  else Ses.kotuKart();
  await kartGoster(kart);

  const o = aktif();
  if (tur === 'pas') {
    mesaj(`⏭️ ${adEtiketi(o)} pas geçti.`);
    await bekle(1300);
    sonrakiOyuncu();
  } else if (tur === 'yon') {
    durum.yon *= -1;
    mesaj('🔄 Sıranın yönü tersine döndü!');
    await bekle(1300);
    sonrakiOyuncu();
  } else if (tur === 'adina') {
    const rakipler = durum.oyuncular.map((r, no) => no).filter(no => no !== durum.sira && durum.oyuncular[no].can > 0);
    const hedef = rakipler.length === 1 ? rakipler[0] : await rakipSec(rakipler);
    gorevBaslat({ kalan: 1, hedef });
  } else if (tur === 'muska') {
    o.muska++;
    oyunculariCiz();
    gorevBaslat({ kalan: 1 });
  } else if (tur === 'can') {
    o.can++;
    oyunculariCiz();
    gorevBaslat({ kalan: 1 }, `💖 ${adEtiketi(o)} 1 can kazandı!`);
  } else if (tur === 'hediye') {
    durum.ceza = 2;
    gorevBaslat({ kalan: 1 });
  } else {
    gorevBaslat({ iki: { kalan: 2 }, uc: { kalan: 3 }, kor: { kalan: 1, tur: 'kor' }, sira: { kalan: 1, tur: 'sira' }, dortlu: { kalan: 1, tur: 'dortlu' } }[tur]);
  }
}

function gorevBaslat(gorev, onMesaj = '') {
  dugmeleriGizle();
  durum.gorev = { tur: 'normal', hedef: null, ...gorev };
  secimAc(onMesaj);
}

const kirilmamislar = () => durum.vazolar.map((v, i) => i).filter(i => !durum.vazolar[i].kirik);

async function secimAc(onMesaj = '') {
  const g = durum.gorev;
  const o = aktif();
  durum.secili = -1;
  dugmeleriGizle();
  if (g.tur === 'kor') {
    mesaj(`🎲 Lanet, ${adEtiketi(o)} için bir vazo seçiyor...`);
    await bekle(1500);
    vazoSec(sec(kirilmamislar()), true);
    return;
  }
  durum.secimAcik = true;
  durum.onizleme = -1;
  const kim = benimSiram() ? '' : `${adEtiketi(o)} `;
  let metin;
  if (!benimSiram()) {
    metin = g.tur === 'sira' ? `☠️ ${kim}lanetli sırayı seçiyor...`
      : g.tur === 'dortlu' ? `👁️ ${kim}bakacağı dörtlüyü seçiyor...`
        : g.hedef !== null ? `🎭 ${kim}${adEtiketi(durum.oyuncular[g.hedef])} adına vazo seçiyor...`
          : `${kim}kıracağı vazoyu seçiyor${g.kalan > 1 ? ` (${g.kalan} vazo kıracak)` : ''}...`;
  } else if (g.tur === 'sira') metin = '☠️ Lanetli sırayı seç: vazoların üstünde gezin, kırmızı halkalı sıra kırılacak. Seçmek için tıkla.';
  else if (g.tur === 'dortlu') metin = '👁️ Vazoların üstünde gezin: mor halkalı 4 vazo bakacağın dörtlü. Tıklayınca altında kaç yılan olduğu yazar.';
  else if (g.hedef !== null) metin = `🎭 ${adEtiketi(durum.oyuncular[g.hedef])} adına kıracağın vazoyu seç. Yılan çıkarsa onun canı gidecek!`;
  else if (g.kalan > 1) metin = `${adEtiketi(o)}, ${g.kalan} vazo daha kırmalısın. Birini seç...`;
  else metin = `${adEtiketi(o)}, kıracağın vazoyu seç...`;
  mesaj((onMesaj ? onMesaj + ' ' : '') + metin);
  hazirOl('secim');
}

// ---------- Vazo seçme ve kırma ----------
async function vazoSec(i, zorla = false) {
  durum.secili = i;
  if (zorla) durum.secimAcik = false;
  Ses.secim();
  Ses.kalp(68);
  durum.mesgul = true;
  await Sahne.odakla(i);
  durum.mesgul = false;
  mesaj(benimSiram()
    ? sec(['Bu vazo... emin misin?', 'İçinde ne var dersin?', 'Çekiç elinde. Vur bakalım.'])
    : `${adEtiketi(aktif())} bu vazoyu seçti... ${sec(['Vuracak mı?', 'İçinde ne var dersin?', 'Nefesini tut...'])}`);
  $('vurBtn').hidden = !benimSiram();
  $('vazgecBtn').hidden = zorla || !benimSiram();
  hazirOl('vur');
}

async function vazgec() {
  dugmeleriGizle();
  durum.mesgul = true;
  Ses.kalp(0);
  await Sahne.genelBakis();
  durum.mesgul = false;
  secimAc();
}

// Tek basış yeter: çekiç vazo kırılana kadar kendi kendine vurur.
// Kaç vuruşta kırılacağına oyun karar verir; aradaki duraklamalar gerilim için.
async function vur() {
  durum.mesgul = true;
  durum.secimAcik = false;
  dugmeleriGizle();
  Sahne.isaretleriTemizle();
  const i = durum.secili;
  const v = durum.vazolar[i];

  for (;;) {
    v.vurus++;
    const kirilsin = v.vurus >= v.vurusGerek;
    const sessizlik = v.vurus === 1 ? rastgele() < 0.2 : rastgele() < 0.45;
    if (sessizlik) {  // her şey bir anda susar...
      Ses.sessizlik(1.4);
      mesaj('...');
      await bekle(1100 + rastgele() * 700);
    } else if (v.vurus > 1) {
      await bekle(450 + rastgele() * 600);
    }
    await Sahne.vur(i, kirilsin, false, v.buyukParca);
    if (kirilsin) break;
    Ses.kalp(Math.min(170, 68 + v.vurus * 25));
    if (v.hisirti && rastgele() < 0.6) {
      Ses.hisirti(1.1);
      mesaj(sec(['İçeriden bir hışırtı geldi...', 'Bir şey kıpırdadı!', 'Duydun mu? İçeride bir şey var...']));
    } else {
      mesaj(sec(['Çatlak büyüyor...', 'Dayanıyor...', 'Kalbinin sesini duyuyor musun?', 'Hâlâ kırılmadı...']));
    }
  }
  Ses.kalp(0);
  await vazoAcildi(i, durum.gorev.hedef ?? durum.sira);
  await turSonu();
}

// Kırılan vazodan ne çıktığını gösterir; yılansa kurbanın canını alır
async function vazoAcildi(i, kurban) {
  const v = durum.vazolar[i];
  v.kirik = true;

  const rahatlama = ['Boş... şimdilik.', 'Oh be... sadece toz.', 'Şanslısın. Bu sefer.', 'İçinden sadece eski bir koku çıktı.'];
  if (!v.sahipler.length) {
    await Sahne.bosCikar(i, v.hisirti);
    Ses.rahatlama();
    mesaj(sec(rahatlama));
    return;
  }
  if (v.gizli) {
    // Önce boş gibi görünür... herkes rahatlar... ve sonra
    await Sahne.bosCikar(i, false);
    Ses.rahatlama();
    mesaj(sec(rahatlama));
    await bekle(1700 + rastgele() * 1300);
    mesaj('...bir dakika... o parça kıpırdadı mı?');
    await Sahne.parcaKaldir(i);
  }
  const sahipler = v.sahipler.map(no => durum.oyuncular[no]);
  mesaj('🐍 YILAN!');
  await Sahne.yilanCikar(i, sahipler.map(s => s.hex), v.davranis, {
    // Sahibinin kaydettiği ses: yüze atlayan yılanda atlama anında, diğerlerinde çıkınca
    cikti: () => {
      if (v.davranis !== 'atla') mesaj('🐍 YILAN!' + sahipSesleri(i, sahipler));
    },
    atladi: () => {
      if (!HIZLI.acik) kirmiziFlas();
      if (v.davranis !== 'kac') sahipSesleri(i, sahipler);
    },
    gidiyor: () => {
      Ses.rahatlama();
      mesaj('Gidiyor... oh be.');
    },
  });
  const kimin = v.sahipler.length === 1 && v.sahipler[0] === kurban
    ? 'Kendi yılanı!'
    : `${sahipler.map(adEtiketi).join(' ve ')} yılanı!`;
  hasar(kurban, kimin);
}

function hasar(no, kimin) {
  const o = durum.oyuncular[no];
  if (o.muska > 0) {
    o.muska--;
    oyunculariCiz();
    mesaj(`${kimin} Ama 🧿 muska ${adEtiketi(o)} oyuncusunu korudu!`);
    return;
  }
  o.can--;
  oyunculariCiz();
  if (o.can <= 0) {
    Ses.eleme();
    mesaj(`${kimin} ${adEtiketi(o)} son canını kaybetti ve ELENDİ 💀`);
  } else {
    mesaj(`${kimin} ${adEtiketi(o)} 1 can kaybetti.`);
  }
}

async function turSonu() {
  await bekle(2200);
  await Sahne.genelBakis();
  if (oyunBittiMi()) return;
  const g = durum.gorev;
  g.kalan--;
  durum.mesgul = false;
  if (aktif().can <= 0 || g.kalan <= 0) sonrakiOyuncu();
  else secimAc();
}

// ---------- Özel kartlar ----------
// Dörtlü Göz: dokunulan vazo + sağı + altı + çaprazı (kenardaysa kare içeri kayar)
function dortluVazolari(i) {
  const S = Sahne.SUTUN, satirSayisi = VAZO_SAYISI / S;
  const s = Math.min(Math.floor(i / S), satirSayisi - 2);
  const c = Math.min(i % S, S - 2);
  return [s * S + c, s * S + c + 1, (s + 1) * S + c, (s + 1) * S + c + 1];
}

function satirVazolari(i) {
  const S = Sahne.SUTUN, satir = Math.floor(i / S);
  return Array.from({ length: S }, (_, c) => satir * S + c);
}

// Karttan önce neyin seçileceğini halkalarla göster (fareyle üzerine gelince ya da ilk dokunuşta)
function onizle(i) {
  const g = durum.gorev;
  if (durum.asama !== 'oyun' || !durum.secimAcik || !benimSiram() || !g || (g.tur !== 'dortlu' && g.tur !== 'sira')) return;
  Sahne.isaretleriTemizle();
  durum.onizleme = i;
  if (i < 0) return;
  const liste = g.tur === 'dortlu' ? dortluVazolari(i) : satirVazolari(i).filter(k => !durum.vazolar[k].kirik);
  liste.forEach(k => Sahne.isaretle(k, g.tur === 'dortlu' ? '#a33cff' : '#ff2a3a'));
}

function ayniSecimMi(a, b) {
  if (a < 0) return false;
  const bul = durum.gorev.tur === 'dortlu' ? dortluVazolari : satirVazolari;
  return bul(a).join() === bul(b).join();
}

// Lanetli Sıra: seçilen sıradaki bütün vazolar gerilim müziğiyle tek tek kırılır
async function satirAc(i) {
  durum.secimAcik = false;
  durum.mesgul = true;
  Sahne.isaretleriTemizle();
  const liste = satirVazolari(i).filter(k => !durum.vazolar[k].kirik);
  liste.forEach(k => Sahne.isaretle(k, '#ff2a3a'));
  Ses.gerilim(true);
  Ses.kalp(130);
  mesaj(`☠️ Lanetli sıra açılıyor... ${liste.length} vazo`);
  await bekle(1600);
  for (const k of liste) {
    if (aktif().can <= 0) break;
    const v = durum.vazolar[k];
    await Sahne.odakla(k, 0.7);
    for (let h = 1; h <= v.vurusGerek; h++) {
      v.vurus = h;
      await Sahne.vur(k, h === v.vurusGerek, true, v.buyukParca);
      if (h < v.vurusGerek) await bekle(250);
    }
    await vazoAcildi(k, durum.sira);
    await bekle(900);
  }
  Ses.gerilim(false);
  Ses.kalp(0);
  Sahne.isaretleriTemizle();
  durum.gorev.kalan = 1;
  await turSonu();
}

// Dörtlü Göz: kare şeklindeki 4 vazonun altında kaç yılan olduğu herkese söylenir
async function dortluBak(i) {
  durum.secimAcik = false;
  Sahne.isaretleriTemizle();
  const dortlu = dortluVazolari(i);
  const yilan = dortlu.filter(k => !durum.vazolar[k].kirik && durum.vazolar[k].sahipler.length).length;
  const kirik = dortlu.filter(k => durum.vazolar[k].kirik).length;
  dortlu.forEach(k => Sahne.isaretle(k, '#a33cff'));
  Ses.hisirti(0.8);
  await bekle(700);
  const sonuc = `İşaretli dörtlünün altında <b>4'te ${yilan}</b> yılan var.` + (kirik ? ` (${kirik} tanesi zaten kırık)` : '');
  await kartGoster({ iyi: true, etiket: 'HERKES DUYSUN', ikon: yilan ? '🐍'.repeat(yilan) : '✨', ad: 'Dörtlü Göz', aciklama: sonuc }, 'Herkes gördü');
  durum.gorev.tur = 'normal';
  secimAc(`👁️ Dörtlüde ${yilan} yılan var.`);
}

// ---------- Sıra ve bitiş ----------
function sonrakiOyuncu() {
  const n = durum.oyuncular.length;
  do durum.sira = (durum.sira + durum.yon + n) % n;
  while (durum.oyuncular[durum.sira].can <= 0);
  siraBasla();
}

function oyunBittiMi() {
  const hayatta = durum.oyuncular.filter(o => o.can > 0);
  const kalanYilan = durum.vazolar.some(v => !v.kirik && v.sahipler.length);
  if (hayatta.length > 1 && kalanYilan) return false;

  const enCok = Math.max(0, ...hayatta.map(o => o.can));
  const kazananlar = hayatta.filter(o => o.can === enCok);
  durum.asama = 'bitti';
  if (HIZLI.acik) hizliBitir();
  dugmeleriGizle();
  $('menuBtn').hidden = true;
  $('deste').hidden = true;
  Ses.kazanma();
  $('sonucBaslik').innerHTML = kazananlar.length === 1
    ? `🏆 ${adEtiketi(kazananlar[0])} hayatta kaldı!`
    : kazananlar.length
      ? `🏆 Berabere: ${kazananlar.map(adEtiketi).join(', ')}`
      : '💀 Kimse hayatta kalamadı...';
  $('sonucAciklama').textContent = kalanYilan
    ? 'Herkes yılanlara yem oldu... biri hariç.'
    : 'Vazolarda yılan kalmadı. En çok canı olan kazandı.';
  $('sonuc').hidden = false;
  mesaj('');
  return true;
}

// ---------- Ekran parçaları ----------
function oyunculariCiz() {
  $('oyuncular').innerHTML = durum.oyuncular.map((o, no) => {
    const kalpler = '❤️'.repeat(Math.max(0, o.can)) + '🖤'.repeat(Math.max(0, CAN - o.can)) + '🧿'.repeat(o.muska);
    const sinif = ['oyuncu', no === durum.sira && durum.asama === 'oyun' ? 'aktif' : '', o.can <= 0 ? 'elendi' : '', o.koptu ? 'koptu' : ''].join(' ');
    const sen = cevrimici() && no === AG.benimNo ? ' <small>(sen)</small>' : '';
    return `<div class="${sinif}" style="--renk:${o.hex}"><span class="nokta"></span><b>${guvenli(o.ad)}</b>${sen}${o.koptu ? ' 📡' : ''}<span class="kalpler">${kalpler}</span></div>`;
  }).join('');
}

function mesaj(html) {
  $('mesaj').innerHTML = html;
  $('mesaj').hidden = !html;
}

function kirmiziFlas() {
  const f = $('flas');
  f.classList.remove('yak');
  void f.offsetWidth;  // animasyonu baştan başlatmak için
  f.classList.add('yak');
}

// ---------- Başlangıç ----------
Sahne.baslat($('sahne'));
Sahne.tiklayinca((i, isaretci) => {
  if (durum.asama === 'yerlestir' && $('perde').hidden) {
    yerlesimSecimi(i);
  } else if (durum.asama === 'oyun' && durum.secimAcik && benimSiram()) {
    const tur = durum.gorev.tur;
    if (tur === 'sira' || tur === 'dortlu') {
      // Telefonda fareyle gezinme yok: ilk dokunuş önizler, aynı yere ikinci dokunuş onaylar
      if (isaretci !== 'mouse' && !ayniSecimMi(durum.onizleme, i)) {
        onizle(i);
        Ses.secim();
        mesaj(tur === 'dortlu'
          ? '👁️ Halkalı 4 vazo seçildi. Bakmak için aynı yere tekrar dokun, değiştirmek için başka vazoya dokun.'
          : '☠️ Halkalı sıra seçildi. Onaylamak için aynı sıraya tekrar dokun, değiştirmek için başka sıraya dokun.');
        return;
      }
      girdi(tur, { i });
    } else {
      girdi('vazo', { i });
    }
  }
});
Sahne.uzerineGelinince(onizle);
Sahne.secilebilirlik(i => {
  if (!$('perde').hidden || !$('kartEkrani').hidden || !$('cikisEkrani').hidden || HIZLI.acik) return false;
  if (durum.asama === 'yerlestir') return $('onayBtn').hidden === false;
  if (durum.asama !== 'oyun' || !durum.secimAcik || !benimSiram() || durum.mesgul || durum.vazolar[i].kirik) return false;
  return durum.secili < 0 || durum.vazolar[durum.secili].vurus === 0;
});
$('vurBtn').onclick = () => girdi('vur');
$('vazgecBtn').onclick = () => girdi('vazgec');
$('onayBtn').onclick = yerlesimiOnayla;
$('sesKaydetBtn').onclick = sesKaydet;
$('kartBtn').onclick = () => girdi('kart');
$('direktBtn').onclick = () => girdi('direkt');
$('kartTamam').onclick = () => girdi('tamam');
window.addEventListener('keydown', e => {
  if (e.code === 'Space' && !$('vurBtn').hidden) {
    e.preventDefault();
    girdi('vur');
  }
});
menuKur();

// iPhone'da iki parmakla ya da çift dokunuşla sayfa yakınlaşmasın (oyunda geri küçültülemiyordu)
document.addEventListener('gesturestart', e => e.preventDefault());
document.addEventListener('dblclick', e => e.preventDefault(), { passive: false });
