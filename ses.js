// =============================================================
// Lanetli Vazolar - gerilim sesleri
// Hiç ses dosyası yok: bütün sesler tarayıcının ses motoruyla (Web Audio API)
// o an üretilir. İki yapı taşı var:
//   ton()     → bir nota (kalp atışı, inilti, çan)
//   gurultu() → süzülmüş hışırtı (tıslama, kırılma, rüzgâr)
// Yeni ses eklemek için aşağıya bir fonksiyon yaz, en alttaki listeye ekle,
// oyun.js'te Ses.adi() diye çağır.
// =============================================================

const Ses = (() => {
  const ANAHTAR = 'lanetliVazolar.ses';
  let ctx = null, ana = null, ortamKazanc = null, tampon = null;
  let acik = true, ortamBasladi = false;
  let kalpBpm = 0, kalpZamanlayici = null;

  try {
    acik = localStorage.getItem(ANAHTAR) !== 'kapali';
  } catch (e) { /* hatırlanamazsa açık başlar */ }

  // Tarayıcılar sesi ancak bir tıklamadan sonra çalar; motor ilk seste açılır.
  function motor() {
    if (!ctx) {
      ctx = new (window.AudioContext || window.webkitAudioContext)();
      ana = ctx.createGain();
      ana.gain.value = acik ? 0.9 : 0;
      const sikistirici = ctx.createDynamicsCompressor();  // ani patlamalar kulak tırmalamasın
      ana.connect(sikistirici);
      sikistirici.connect(ctx.destination);
    }
    if (ctx.state === 'suspended') ctx.resume();
    return ctx;
  }

  function gurultuKaynagi() {
    const c = motor();
    if (!tampon) {
      tampon = c.createBuffer(1, c.sampleRate * 2, c.sampleRate);
      const veri = tampon.getChannelData(0);
      for (let i = 0; i < veri.length; i++) veri[i] = Math.random() * 2 - 1;
    }
    const kaynak = c.createBufferSource();
    kaynak.buffer = tampon;
    kaynak.loop = true;
    return kaynak;
  }

  // Sesi yumuşakça açıp kapatan düğme. tut: zirvede ne kadar kalsın (sürenin oranı)
  function zarf(t, atak, seviye, sure, hedef = ana, tut = 0) {
    const g = ctx.createGain();
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(seviye, t + atak);
    if (tut) g.gain.setValueAtTime(seviye, t + Math.max(atak, sure * tut));
    g.gain.exponentialRampToValueAtTime(0.0001, t + sure);
    g.connect(hedef);
    return g;
  }

  function filtre(tip, frekans, q = 1) {
    const f = ctx.createBiquadFilter();
    f.type = tip;
    f.frequency.value = frekans;
    f.Q.value = q;
    return f;
  }

  function ton(frekans, { gecikme = 0, sure = 0.3, tip = 'sine', seviye = 0.2, bitis, atak = 0.005 } = {}) {
    const c = motor();
    const t = c.currentTime + gecikme;
    const osc = c.createOscillator();
    osc.type = tip;
    osc.frequency.setValueAtTime(frekans, t);
    if (bitis) osc.frequency.exponentialRampToValueAtTime(bitis, t + sure);
    osc.connect(zarf(t, atak, seviye, sure));
    osc.start(t);
    osc.stop(t + sure + 0.05);
  }

  function gurultu({ gecikme = 0, sure = 0.2, seviye = 0.2, tip = 'bandpass', frekans = 1000, q = 1, atak = 0.005, tut = 0, bitisFrekans } = {}) {
    const c = motor();
    const t = c.currentTime + gecikme;
    const kaynak = gurultuKaynagi();
    const f = filtre(tip, frekans, q);
    if (bitisFrekans) f.frequency.exponentialRampToValueAtTime(bitisFrekans, t + sure);
    kaynak.connect(f);
    f.connect(zarf(t, atak, seviye, sure, ana, tut));
    kaynak.start(t, Math.random());
    kaynak.stop(t + sure + 0.05);
  }

  // ---------- Arka plan: hiç susmayan uğultu + rüzgâr + ara sıra tuhaf sesler ----------
  function ortamBaslat() {
    if (ortamBasladi) return;
    const c = motor();
    ortamBasladi = true;
    ortamKazanc = c.createGain();
    ortamKazanc.gain.value = 0.0001;
    ortamKazanc.connect(ana);
    ortamKazanc.gain.exponentialRampToValueAtTime(1, c.currentTime + 4);

    // Derin uğultu: birbirine çok yakın notalar "dalgalanır", aradaki triton (şeytan aralığı) huzursuzluk verir
    const alcak = filtre('lowpass', 180, 4);
    const ugultu = c.createGain();
    ugultu.gain.value = 0.11;
    alcak.connect(ugultu);
    ugultu.connect(ortamKazanc);
    [41.2, 55, 55.6, 77.8].forEach(f => {
      const o = c.createOscillator();
      o.type = 'sawtooth';
      o.frequency.value = f;
      o.connect(alcak);
      o.start();
    });
    yavasDalga(alcak.frequency, 0.06, 110);

    // Nefes alır gibi kabarıp sönen, göğüste hissedilen çok kalın ses
    const nefes = c.createOscillator();
    nefes.frequency.value = 36;
    const nefesG = c.createGain();
    nefesG.gain.value = 0.05;
    nefes.connect(nefesG);
    nefesG.connect(ortamKazanc);
    nefes.start();
    yavasDalga(nefesG.gain, 0.13, 0.05);

    // Tiz, gergin keman benzeri ses: yan yana iki nota yavaşça yükselip alçalır
    const tiz = c.createGain();
    tiz.gain.value = 0.008;
    tiz.connect(ortamKazanc);
    [880, 932.3, 1244.5].forEach((f, k) => {
      const o = c.createOscillator();
      o.type = k === 2 ? 'sine' : 'triangle';
      o.frequency.value = f;
      yavasDalga(o.frequency, 4 + k, 3);  // titreşim
      o.connect(tiz);
      o.start();
    });
    yavasDalga(tiz.gain, 0.035, 0.008);

    // Mahzende esen rüzgâr
    const ruzgar = gurultuKaynagi();
    const rf = filtre('bandpass', 380, 0.8);
    const rg = c.createGain();
    rg.gain.value = 0.065;
    ruzgar.connect(rf);
    rf.connect(rg);
    rg.connect(ortamKazanc);
    ruzgar.start();
    yavasDalga(rf.frequency, 0.09, 220);

    rastgeleOlay();
  }

  function yavasDalga(parametre, hiz, derinlik) {
    const lfo = ctx.createOscillator();
    lfo.frequency.value = hiz;
    const g = ctx.createGain();
    g.gain.value = derinlik;
    lfo.connect(g);
    g.connect(parametre);
    lfo.start();
  }

  // Ara sıra karanlıktan gelen sesler (4-10 saniyede bir, hangisinin geleceği belli olmaz)
  function rastgeleOlay() {
    setTimeout(() => {
      const olaylar = [damla, inilti, fisilti, gicirti, kapiVurusu, metal, muzikKutusu, gumbur];
      olaylar[Math.floor(Math.random() * olaylar.length)]();
      rastgeleOlay();
    }, 4000 + Math.random() * 6000);
  }

  // Birden çok ağızdan gelen, anlaşılmayan fısıltı
  function fisilti() {
    for (let k = 0; k < 3; k++) {
      const f = 1200 + Math.random() * 1800;
      gurultu({ gecikme: k * 0.35 + Math.random() * 0.2, sure: 0.9 + Math.random() * 0.6, seviye: 0.035, frekans: f, q: 8, atak: 0.2, bitisFrekans: f * (0.7 + Math.random() * 0.6) });
    }
  }

  // Yavaşça açılan eski bir kapının gıcırtısı
  function gicirti() {
    const f = 300 + Math.random() * 200;
    ton(f, { sure: 1.6, seviye: 0.03, tip: 'sawtooth', bitis: f * 0.55, atak: 0.3 });
    gurultu({ sure: 1.6, seviye: 0.03, frekans: f * 2, q: 12, atak: 0.3, bitisFrekans: f });
  }

  // Uzakta bir kapıya üç kez vuruluyor...
  function kapiVurusu() {
    [0, 0.45, 0.9].forEach(g => {
      ton(110, { gecikme: g, sure: 0.18, seviye: 0.12, bitis: 60 });
      gurultu({ gecikme: g, sure: 0.08, seviye: 0.05, tip: 'lowpass', frekans: 700 });
    });
  }

  // Taşa sürtünen metal
  function metal() {
    gurultu({ sure: 1.4, seviye: 0.025, tip: 'bandpass', frekans: 3200, q: 15, atak: 0.4, bitisFrekans: 5200 });
    ton(2600, { sure: 1.2, seviye: 0.008, tip: 'sine', bitis: 2400, atak: 0.5 });
  }

  // Bozuk, detone bir müzik kutusu
  function muzikKutusu() {
    const notalar = [1046.5, 987.8, 880, 830.6];
    notalar.forEach((f, k) => ton(f * (1 + (Math.random() - 0.5) * 0.03), { gecikme: k * 0.42, sure: 0.9, seviye: 0.025, tip: 'triangle' }));
  }

  // Derinlerden gelen gümbürtü
  function gumbur() {
    ton(38, { sure: 2.2, seviye: 0.18, bitis: 28, atak: 0.3 });
    gurultu({ sure: 2, seviye: 0.05, tip: 'lowpass', frekans: 200, atak: 0.4 });
  }

  function damla() {
    ton(1400, { sure: 0.18, seviye: 0.05, bitis: 500 });
    ton(900, { gecikme: 0.9, sure: 0.15, seviye: 0.03, bitis: 400 });
  }

  function inilti() {
    const f = 180 + Math.random() * 120;
    ton(f, { sure: 3.5, seviye: 0.035, bitis: f * 0.85, tip: 'triangle', atak: 1.2 });
    ton(f * 1.5 + 3, { sure: 3.5, seviye: 0.02, bitis: f * 1.25, atak: 1.4 });
  }

  // Ortamı bir anlığına susturur: en korkunç an, sessizliktir
  function sessizlik(sure = 1.2) {
    if (!ortamKazanc) return;
    const t = ctx.currentTime;
    const g = ortamKazanc.gain;
    g.cancelScheduledValues(t);
    g.setValueAtTime(Math.max(g.value, 0.0001), t);
    g.linearRampToValueAtTime(0.03, t + 0.25);
    g.setValueAtTime(0.03, t + sure);
    g.linearRampToValueAtTime(1, t + sure + 1.5);
  }

  // ---------- Kalp atışı: bpm arttıkça hızlanır, 0 verilirse durur ----------
  function kalp(bpm) {
    kalpBpm = bpm;
    if (!bpm) {
      clearTimeout(kalpZamanlayici);
      kalpZamanlayici = null;
    } else if (!kalpZamanlayici) {
      kalpDongu();
    }
  }

  function kalpDongu() {
    if (!kalpBpm) return;
    const seviye = Math.min(0.55, 0.25 + kalpBpm / 500);
    ton(62, { sure: 0.16, seviye, bitis: 38 });
    ton(55, { gecikme: 0.17, sure: 0.2, seviye: seviye * 0.75, bitis: 34 });
    kalpZamanlayici = setTimeout(kalpDongu, 60000 / kalpBpm);
  }

  // ---------- Oyun efektleri ----------
  function vurus() {
    ton(140, { sure: 0.2, seviye: 0.55, bitis: 45 });
    gurultu({ sure: 0.09, seviye: 0.45, frekans: 2200, q: 0.8 });
    for (let k = 0; k < 3; k++) {  // çatlama çıtırtıları
      gurultu({ gecikme: 0.03 + k * 0.025 + Math.random() * 0.02, sure: 0.03, seviye: 0.15, tip: 'highpass', frekans: 3500 });
    }
  }

  function kirilma() {
    ton(90, { sure: 0.4, seviye: 0.6, bitis: 35 });
    gurultu({ sure: 0.5, seviye: 0.5, tip: 'lowpass', frekans: 4000, bitisFrekans: 600 });
    for (let k = 0; k < 14; k++) {  // yere düşen kırık parçaların şıngırtısı
      ton(2500 + Math.random() * 4000, { gecikme: 0.05 + Math.random() * 0.7, sure: 0.06 + Math.random() * 0.08, seviye: 0.05 + Math.random() * 0.05, tip: 'triangle' });
    }
    for (let k = 0; k < 6; k++) {
      gurultu({ gecikme: 0.1 + Math.random() * 0.6, sure: 0.04, seviye: 0.12, tip: 'highpass', frekans: 3000 });
    }
  }

  // Vazonun içinden gelen kesik kesik hışırtı: "içeride bir şey mi var?"
  function hisirti(sure = 1.2) {
    const c = motor();
    const t = c.currentTime;
    const kaynak = gurultuKaynagi();
    const f = filtre('bandpass', 700, 1.5);
    const g = c.createGain();
    g.gain.value = 0;
    for (let s = 0; s < sure; s += 0.06) {
      g.gain.setValueAtTime(Math.random() < 0.5 ? 0 : 0.06 + Math.random() * 0.08, t + s);
    }
    g.gain.setValueAtTime(0, t + sure);
    kaynak.connect(f);
    f.connect(g);
    g.connect(ana);
    kaynak.start(t);
    kaynak.stop(t + sure + 0.1);
  }

  function tiss(seviye = 0.35, sure = 1.4) {
    gurultu({ sure, seviye, tip: 'highpass', frekans: 2800, atak: 0.06, tut: 0.6 });
    gurultu({ sure: sure * 0.9, seviye: seviye * 0.6, frekans: 6000, q: 0.7, atak: 0.04, tut: 0.5 });
  }

  // Çıngıraklı yılanın kuyruk sesi: hızla açılıp kapanan ince hışırtı
  function cingirak(sure = 1) {
    const c = motor();
    const t = c.currentTime;
    const kaynak = gurultuKaynagi();
    const f = filtre('bandpass', 5200, 2);
    const mod = c.createGain();
    mod.gain.value = 0.5;
    const lfo = c.createOscillator();
    lfo.type = 'square';
    lfo.frequency.value = 38;
    const lg = c.createGain();
    lg.gain.value = 0.5;
    lfo.connect(lg);
    lg.connect(mod.gain);
    kaynak.connect(f);
    f.connect(mod);
    mod.connect(zarf(t, 0.03, 0.3, sure, ana, 0.7));
    kaynak.start(t);
    lfo.start(t);
    kaynak.stop(t + sure + 0.1);
    lfo.stop(t + sure + 0.1);
  }

  // Yüze atlama anı: tıslama + çığlık gibi bir çatırtı + göğüste hissedilen bas
  function atlama() {
    tiss(0.9, 1.3);
    ton(48, { sure: 0.7, seviye: 0.9, bitis: 30 });
    [620, 655, 930, 1310].forEach(f => ton(f, { sure: 0.7, seviye: 0.12, tip: 'sawtooth', bitis: f * 1.6, atak: 0.01 }));
    gurultu({ sure: 0.4, seviye: 0.6, tip: 'lowpass', frekans: 1200 });
  }

  function rahatlama() {
    gurultu({ sure: 2, seviye: 0.06, tip: 'lowpass', frekans: 500, atak: 0.4 });
    ton(220, { sure: 2.2, seviye: 0.05, atak: 0.3, tip: 'triangle' });
    ton(330, { gecikme: 0.1, sure: 2, seviye: 0.035, atak: 0.3 });
  }

  function eleme() {
    [73, 147.6, 221, 296.5].forEach((f, k) => ton(f, { sure: 4 - k * 0.6, seviye: 0.25 / (k + 1), atak: 0.01 }));
  }

  function secim() {
    ton(180, { sure: 0.12, seviye: 0.12, bitis: 120, tip: 'triangle' });
  }

  function yerlestir() {
    gurultu({ sure: 0.25, seviye: 0.12, frekans: 900, q: 2 });
    ton(300, { sure: 0.15, seviye: 0.08, bitis: 200 });
  }

  function kazanma() {
    [110, 164.8, 196, 261.6].forEach((f, k) => ton(f, { gecikme: k * 0.25, sure: 3, seviye: 0.12, tip: 'triangle', atak: 0.05 }));
  }

  // Lanetli Sıra kartında çalan gerilim müziği: yavaşça tizleşen, titreyen yaylı sesi
  let gerilimDugum = null;
  function gerilim(ac) {
    const c = motor();
    const t = c.currentTime;
    if (ac && !gerilimDugum) {
      const g = c.createGain();
      g.gain.value = 0.0001;
      g.gain.exponentialRampToValueAtTime(0.16, t + 1.5);
      g.connect(ana);
      const f = filtre('lowpass', 900, 2);
      f.connect(g);
      const titresim = c.createGain();
      titresim.gain.value = 0.6;
      titresim.connect(f);
      const osclar = [110, 116.5, 220.5, 466].map(fr => {
        const o = c.createOscillator();
        o.type = fr > 400 ? 'sine' : 'sawtooth';
        o.frequency.setValueAtTime(fr, t);
        o.frequency.linearRampToValueAtTime(fr * 1.6, t + 25);
        o.connect(titresim);
        o.start(t);
        return o;
      });
      const lfo = c.createOscillator();
      lfo.frequency.value = 7;
      const lg = c.createGain();
      lg.gain.value = 0.4;
      lfo.connect(lg);
      lg.connect(titresim.gain);
      lfo.start(t);
      osclar.push(lfo);
      gerilimDugum = { g, osclar };
    } else if (!ac && gerilimDugum) {
      const { g, osclar } = gerilimDugum;
      gerilimDugum = null;
      g.gain.cancelScheduledValues(t);
      g.gain.setValueAtTime(g.gain.value, t);
      g.gain.linearRampToValueAtTime(0, t + 1.2);
      osclar.forEach(o => o.stop(t + 1.3));
    }
  }

  function kartCek() {
    gurultu({ sure: 0.35, seviye: 0.18, frekans: 3000, q: 0.6, bitisFrekans: 900 });
  }

  function iyiKart() {
    [392, 523.3, 659.3].forEach((f, k) => ton(f, { gecikme: k * 0.08, sure: 0.9, seviye: 0.08, tip: 'triangle' }));
  }

  function kotuKart() {
    ton(98, { sure: 1.6, seviye: 0.3, tip: 'sawtooth', bitis: 70 });
    ton(103.8, { sure: 1.6, seviye: 0.2, tip: 'sawtooth', bitis: 73 });
    gurultu({ sure: 1.2, seviye: 0.08, tip: 'lowpass', frekans: 400 });
  }

  // ---------- 🎙️ Oyuncunun kendi yılan sesi ----------
  // Mikrofondan kısa bir kayıt alınır: 16 kHz, tek kanal, 16 bit. Böyle ham sayılar olarak
  // tutulunca Android ve iPhone arasında "bu ses biçimini açamıyorum" sorunu çıkmaz.
  const KAYIT_ORANI = 16000;
  async function kaydet(saniye = 2) {
    const c = motor();
    const akis = await navigator.mediaDevices.getUserMedia({
      audio: { echoCancellation: false, noiseSuppression: false, autoGainControl: true },
    });
    const kaynak = c.createMediaStreamSource(akis);
    const isleyici = c.createScriptProcessor(4096, 1, 1);
    const parcalar = [];
    isleyici.onaudioprocess = e => parcalar.push(new Float32Array(e.inputBuffer.getChannelData(0)));
    const sessiz = c.createGain();  // kayıt sırasında hoparlörden geri çalmasın
    sessiz.gain.value = 0;
    kaynak.connect(isleyici);
    isleyici.connect(sessiz);
    sessiz.connect(c.destination);
    await new Promise(coz => setTimeout(coz, saniye * 1000));
    isleyici.disconnect();
    kaynak.disconnect();
    sessiz.disconnect();
    akis.getTracks().forEach(t => t.stop());

    // Parçaları birleştir, 16 kHz'e indir ve sesi olabildiğince yükselt
    const toplam = parcalar.reduce((a, p) => a + p.length, 0);
    const ham = new Float32Array(toplam);
    let yer = 0;
    parcalar.forEach(p => {
      ham.set(p, yer);
      yer += p.length;
    });
    let tepe = 0.0001;
    for (const x of ham) tepe = Math.max(tepe, Math.abs(x));
    const kazanc = Math.min(10, 0.95 / tepe);
    const oran = c.sampleRate / KAYIT_ORANI;
    const veri = new Int16Array(Math.floor(toplam / oran));
    for (let i = 0; i < veri.length; i++) {
      const a = Math.floor(i * oran), b = Math.max(a + 1, Math.floor((i + 1) * oran));
      let s = 0;
      for (let j = a; j < b; j++) s += ham[j];
      veri[i] = Math.max(-1, Math.min(1, (s / (b - a)) * kazanc)) * 32767;
    }
    return { oran: KAYIT_ORANI, veri };
  }

  // Kayıt 5 farklı şekilde çalınabilir
  const EFEKTLER = [
    { ad: 'normal', hiz: 1 },
    { ad: 'hızlı', hiz: 1.8 },
    { ad: 'yavaş', hiz: 0.55 },
    { ad: 'ince', hiz: 1.35, filtre: ['highpass', 700] },
    { ad: 'kalın', hiz: 0.72, filtre: ['lowpass', 900], bozuk: true },
  ];

  function kayitCal(kayit, efektNo = 0, { gecikme = 0, seviye = 1 } = {}) {
    if (!kayit?.veri?.length) return;
    const c = motor();
    const tampon = c.createBuffer(1, kayit.veri.length, kayit.oran);
    const kanal = tampon.getChannelData(0);
    for (let i = 0; i < kayit.veri.length; i++) kanal[i] = kayit.veri[i] / 32768;
    const kaynak = c.createBufferSource();
    kaynak.buffer = tampon;
    const efekt = EFEKTLER[efektNo % EFEKTLER.length];
    kaynak.playbackRate.value = efekt.hiz;
    let son = kaynak;
    if (efekt.filtre) {
      const f = filtre(efekt.filtre[0], efekt.filtre[1], 0.8);
      son.connect(f);
      son = f;
    }
    if (efekt.bozuk) {  // hafif cızırtı: canavar gibi
      const bozucu = c.createWaveShaper();
      const egri = new Float32Array(256);
      for (let i = 0; i < 256; i++) egri[i] = Math.tanh((i / 128 - 1) * 3);
      bozucu.curve = egri;
      son.connect(bozucu);
      son = bozucu;
    }
    const g = c.createGain();
    g.gain.value = seviye;
    son.connect(g);
    g.connect(ana);
    kaynak.start(c.currentTime + gecikme);
  }

  function seviyeyiAyarla() {
    if (ana) ana.gain.setTargetAtTime(acik && !susuk ? 0.9 : 0, ctx.currentTime, 0.05);
  }

  function acKapa() {
    acik = !acik;
    try {
      localStorage.setItem(ANAHTAR, acik ? 'acik' : 'kapali');
    } catch (e) { /* hatırlanmasa da olur */ }
    seviyeyiAyarla();
    return acik;
  }

  // Geçici susturma (online oyuna geri dönerken kaçırılan hamleler sessizce oynatılır)
  let susuk = false;
  function sustur(evet) {
    susuk = evet;
    if (!evet) kalp(0);
    seviyeyiAyarla();
  }

  // Lanetli Dönüş: taş zemin üstünde ağır bir şey sürünüyor (3 saniye boyunca gıcırtılı gürleme)
  function donus() {
    ton(46, { sure: 3.4, seviye: 0.35, tip: 'sawtooth', bitis: 40, atak: 0.4 });
    ton(49.5, { sure: 3.4, seviye: 0.25, tip: 'sawtooth', bitis: 43, atak: 0.5 });
    gurultu({ sure: 3.3, seviye: 0.16, tip: 'lowpass', frekans: 300, atak: 0.5, tut: 0.8 });
    for (let k = 0; k < 7; k++) {
      const f = 700 + Math.random() * 900;
      gurultu({ gecikme: 0.3 + k * 0.42, sure: 0.35, seviye: 0.05, frekans: f, q: 9, atak: 0.1, bitisFrekans: f * 0.7 });  // taş gıcırtısı
    }
  }

  // Şimşek çakınca uzaktan gelen gök gürültüsü
  function gokGurultusu() {
    gurultu({ gecikme: 0.4, sure: 3.2, seviye: 0.35, tip: 'lowpass', frekans: 260, atak: 0.05, bitisFrekans: 90 });
    ton(35, { gecikme: 0.4, sure: 2.6, seviye: 0.3, bitis: 28, atak: 0.1 });
    gurultu({ gecikme: 0.45, sure: 0.4, seviye: 0.12, tip: 'lowpass', frekans: 1200 });
  }

  // Mumları titreten ani rüzgâr
  function ruzgarHamlesi() {
    gurultu({ sure: 1.8, seviye: 0.12, frekans: 500, q: 0.6, atak: 0.5, bitisFrekans: 1400 });
  }

  return {
    donus, gokGurultusu, ruzgarHamlesi,
    ortamBaslat, sessizlik, kalp, vurus, kirilma, hisirti, tiss, cingirak,
    atlama, rahatlama, eleme, secim, yerlestir, kazanma, acKapa,
    gerilim, kartCek, iyiKart, kotuKart, sustur, kaydet, kayitCal,
    EFEKT_ADLARI: EFEKTLER.map(e => e.ad),
    get acik() { return acik; },
  };
})();
