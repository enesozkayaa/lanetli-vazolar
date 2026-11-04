// =============================================================
// Lanetli Vazolar - 3D sahne (Three.js)
// Mahzen, mumlar, 30 vazo, çekiç, kırık parçalar ve yılanlar burada çizilir.
// Bu dosya oyun kurallarını bilmez: oyun.js "şu vazoya vur", "şu vazodan
// yılan çıkar" der, burası sadece gösterir.
// =============================================================

const Sahne = (() => {
  const SUTUN = 6, SATIR = 5, ARALIK = 0.95;
  const V = (x = 0, y = 0, z = 0) => new THREE.Vector3(x, y, z);
  const rnd = Math.random;
  const lerp = (a, b, t) => a + (b - a) * t;

  // Vazo şekilleri: [yarıçap, yükseklik] noktaları alttan üste; torna gibi döndürülür
  const PROFILLER = [
    [[0, 0], [0.16, 0], [0.2, 0.05], [0.27, 0.2], [0.29, 0.32], [0.25, 0.45], [0.15, 0.56], [0.1, 0.62], [0.11, 0.68], [0.14, 0.72]],  // amfora
    [[0, 0], [0.15, 0], [0.25, 0.1], [0.3, 0.25], [0.28, 0.4], [0.2, 0.5], [0.15, 0.54], [0.17, 0.58]],                                // küp
    [[0, 0], [0.12, 0], [0.17, 0.08], [0.22, 0.3], [0.21, 0.5], [0.14, 0.66], [0.09, 0.76], [0.1, 0.82], [0.13, 0.86]],               // uzun testi
  ];

  let renderer, sahne, kamera, dinamik, odakIsigi, cekic, ayIsigi;
  const saat = new THREE.Clock();
  const isin = new THREE.Raycaster();
  const fare = new THREE.Vector2();
  const animasyonlar = [];  // her karede çalışan küçük fonksiyonlar; false dönünce silinir
  const mumlar = [];
  let vazolar = [];
  const bakis = { konum: V(0, 6, 5), hedef: V(0, 0, 0.15) };
  let sarsinti = 0, genelBakista = true, uzerinde = -1;
  let tiklaninca = () => {}, secilebilir = () => true, uzerineGelince = () => {};

  // ---------- Küçük animasyon yardımcıları ----------
  const yumusak = t => (t < 0.5 ? 2 * t * t : 1 - Math.pow(-2 * t + 2, 2) / 2);
  const dogrusal = t => t;

  // hizliMod: online oyuna geri dönen oyuncu kaçırdıklarını bir anda geçsin diye animasyonlar anında biter
  let hizliMod = false;
  function animasyon(sure, adim, egri = yumusak) {
    if (hizliMod) sure = 0.0001;
    return new Promise(coz => {
      let gecen = 0;
      animasyonlar.push(dt => {
        gecen += dt;
        const t = Math.min(gecen / sure, 1);
        adim(egri(t), t);
        if (t >= 1) {
          coz();
          return false;
        }
        return true;
      });
    });
  }
  const bekle = sn => animasyon(sn, () => {});

  // ---------- Kurulum ----------
  function baslat(kap) {
    renderer = new THREE.WebGLRenderer({ antialias: true });
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    renderer.shadowMap.enabled = true;
    renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    renderer.toneMapping = THREE.ACESFilmicToneMapping;
    renderer.toneMappingExposure = 1.75;
    kap.appendChild(renderer.domElement);

    sahne = new THREE.Scene();
    sahne.background = new THREE.Color(0x07050a);
    sahne.fog = new THREE.FogExp2(0x07050a, 0.06);
    kamera = new THREE.PerspectiveCamera(50, 1, 0.03, 60);

    isiklariKur();
    zeminKur();
    korkuKur();
    cekic = cekicYap();
    sahne.add(cekic);
    sifirla();

    boyutla();
    window.addEventListener('resize', boyutla);
    fareDinle(renderer.domElement);
    bakis.konum.copy(genelKonum());
    renderer.setAnimationLoop(dongu);
  }

  // Yeni oyun: eski vazoları, kırıkları ve yılanları silip 30 yeni vazo diz
  function sifirla() {
    if (dinamik) sahne.remove(dinamik);
    dinamik = new THREE.Group();
    sahne.add(dinamik);
    animasyonlar.length = 0;
    cekic.visible = false;
    odakIsigi.intensity = 0;
    vazolar = [];
    for (let s = 0; s < SATIR; s++) {
      for (let c = 0; c < SUTUN; c++) {
        const konum = V(
          (c - (SUTUN - 1) / 2) * ARALIK + (rnd() - 0.5) * 0.1,
          0,
          (s - (SATIR - 1) / 2) * ARALIK * 0.95 + (rnd() - 0.5) * 0.1,
        );
        vazolar.push(vazoYap(vazolar.length, konum));
      }
    }
    genelBakista = true;
    bakis.konum.copy(genelKonum());
    bakis.hedef.set(0, 0, 0.15);
  }

  function isiklariKur() {
    sahne.add(new THREE.AmbientLight(0x5a5a7a, 1.2));
    sahne.add(new THREE.HemisphereLight(0x8a90b8, 0x3a2414, 0.85));  // tepeden soğuk, yerden sıcak yansıma

    const ay = ayIsigi = new THREE.DirectionalLight(0x9aa6d0, 1.1);  // pencereden sızan ay ışığı
    ay.position.set(-3, 8, 2);
    ay.castShadow = true;
    ay.shadow.mapSize.set(1024, 1024);
    Object.assign(ay.shadow.camera, { left: -4, right: 4, top: 4, bottom: -4, near: 1, far: 20 });
    ay.shadow.bias = -0.0005;  // gölgelerde titreyen siyah çizgiler olmasın
    ay.shadow.normalBias = 0.02;
    sahne.add(ay);

    // Köşelerde titreyen mumlar
    [[-3.3, -2.4], [3.3, -2.1], [-3.1, 2.3], [3.2, 2.5], [0, -2.7], [-3.5, 0.1], [3.5, 0.2], [0, 2.8]].forEach(([x, z]) => {
      const mum = new THREE.Mesh(
        new THREE.CylinderGeometry(0.05, 0.06, 0.32, 12),
        new THREE.MeshStandardMaterial({ color: 0xd8ccb0, roughness: 0.9 }),
      );
      mum.position.set(x, 0.16, z);
      const alev = new THREE.Mesh(
        new THREE.SphereGeometry(0.035, 10, 8),
        new THREE.MeshBasicMaterial({ color: 0xffb347 }),
      );
      alev.scale.set(1, 1.8, 1);
      alev.position.set(x, 0.38, z);
      const isik = new THREE.PointLight(0xff8c3a, 6, 10, 1);
      isik.position.set(x, 0.55, z);
      sahne.add(mum, alev, isik);
      mumlar.push({ isik, alev, faz: rnd() * 100 });
    });

    // Seçilen vazonun üstüne düşen dar ışık
    odakIsigi = new THREE.SpotLight(0xffe2b8, 0, 7, 0.42, 0.7, 1);
    odakIsigi.castShadow = true;
    odakIsigi.shadow.mapSize.set(512, 512);
    odakIsigi.shadow.bias = -0.0005;
    odakIsigi.shadow.normalBias = 0.02;
    sahne.add(odakIsigi, odakIsigi.target);
  }

  function zeminKur() {
    const c = document.createElement('canvas');
    c.width = c.height = 512;
    const g = c.getContext('2d');
    g.fillStyle = '#141110';
    g.fillRect(0, 0, 512, 512);
    for (let y = 0; y < 4; y++) {
      for (let x = 0; x < 4; x++) {  // taş karolar
        const l = 14 + rnd() * 10;
        g.fillStyle = `hsl(25, 8%, ${l}%)`;
        g.fillRect(x * 128 + 3, y * 128 + 3, 122, 122);
      }
    }
    for (let k = 0; k < 4000; k++) {  // toz ve lekeler
      g.fillStyle = `rgba(${rnd() < 0.5 ? 0 : 200},${rnd() < 0.5 ? 0 : 180},${rnd() < 0.5 ? 0 : 150},${0.04 + rnd() * 0.06})`;
      g.fillRect(rnd() * 512, rnd() * 512, 1 + rnd() * 3, 1 + rnd() * 3);
    }
    const doku = new THREE.CanvasTexture(c);
    doku.colorSpace = THREE.SRGBColorSpace;
    doku.wrapS = doku.wrapT = THREE.RepeatWrapping;
    doku.repeat.set(5, 5);
    const zemin = new THREE.Mesh(
      new THREE.PlaneGeometry(20, 20),
      new THREE.MeshStandardMaterial({ map: doku, roughness: 0.95 }),
    );
    zemin.rotation.x = -Math.PI / 2;
    zemin.receiveShadow = true;
    sahne.add(zemin);
  }

  // ---------- Korku: mahzen süsleri ve ara sıra olan olaylar ----------
  // Kafatasları, kemikler, örümcek ağları, havada uçuşan toz; ara sıra şimşek, mumları söndüren rüzgâr,
  // karanlıkta beliren kırmızı gözler. Hepsi sadece görüntü: oyuna etkisi yok (her telefonda farklı anda olabilir).
  let havaTozu, mumGucu = 1;
  const olayZamani = { simsek: 25, ruzgar: 15, goz: 12 };
  const kemikMalz = () => new THREE.MeshStandardMaterial({ color: 0xcfc2a2, roughness: 0.9 });

  function kafatasi() {
    const grup = new THREE.Group();
    const m = kemikMalz();
    const kafa = new THREE.Mesh(new THREE.SphereGeometry(0.12, 16, 12), m);
    kafa.scale.set(1, 0.92, 1.12);
    kafa.position.y = 0.12;
    const cene = new THREE.Mesh(new THREE.BoxGeometry(0.13, 0.05, 0.1), m);
    cene.position.set(0, 0.04, 0.07);
    const kara = new THREE.MeshBasicMaterial({ color: 0x050303 });
    [-1, 1].forEach(yan => {
      const goz = new THREE.Mesh(new THREE.SphereGeometry(0.032, 10, 8), kara);
      goz.position.set(yan * 0.045, 0.13, 0.11);
      grup.add(goz);
    });
    const burun = new THREE.Mesh(new THREE.ConeGeometry(0.015, 0.035, 3), kara);
    burun.position.set(0, 0.085, 0.125);
    burun.rotation.x = Math.PI;
    grup.add(kafa, cene, burun);
    grup.traverse(n => (n.castShadow = true));
    return grup;
  }

  function kemik() {
    const grup = new THREE.Group();
    const m = kemikMalz();
    const govde = new THREE.Mesh(new THREE.CylinderGeometry(0.018, 0.018, 0.38, 8), m);
    govde.rotation.z = Math.PI / 2;
    grup.add(govde);
    [-0.19, 0.19].forEach(x => [-0.018, 0.018].forEach(z => {
      const uc = new THREE.Mesh(new THREE.SphereGeometry(0.026, 8, 6), m);
      uc.position.set(x, 0, z);
      grup.add(uc);
    }));
    grup.position.y = 0.03;
    return grup;
  }

  function orumcekAgi() {
    const c = document.createElement('canvas');
    c.width = c.height = 256;
    const g = c.getContext('2d');
    g.strokeStyle = 'rgba(230,230,235,.55)';
    g.lineWidth = 1.2;
    const kol = 9;
    for (let k = 0; k < kol; k++) {  // köşeden yayılan iplikler
      const a = (k / (kol - 1)) * Math.PI / 2;
      g.beginPath();
      g.moveTo(0, 0);
      g.lineTo(Math.cos(a) * 256, Math.sin(a) * 256);
      g.stroke();
    }
    for (let r = 25; r < 250; r += 22 + rnd() * 8) {  // halkalar
      g.beginPath();
      for (let k = 0; k < kol; k++) {
        const a = (k / (kol - 1)) * Math.PI / 2;
        const rr = r + (k % 2 ? 4 : 0);
        if (k) g.lineTo(Math.cos(a) * rr, Math.sin(a) * rr);
        else g.moveTo(Math.cos(a) * rr, Math.sin(a) * rr);
      }
      g.stroke();
    }
    const doku = new THREE.CanvasTexture(c);
    return new THREE.Mesh(new THREE.PlaneGeometry(1.4, 1.4), new THREE.MeshBasicMaterial({ map: doku, transparent: true, depthWrite: false, side: THREE.DoubleSide }));
  }

  function korkuKur() {
    // Mum diplerinde kafatasları ve kemikler
    [[-3.0, -2.75, 0.6], [3.55, 2.85, -0.8], [-3.75, 0.45, 1.2], [2.95, -2.45, -0.3]].forEach(([x, z, r]) => {
      const k = kafatasi();
      k.position.set(x, 0, z);
      k.rotation.y = r;
      sahne.add(k);
    });
    [[-3.4, 2.75, 0.5], [3.7, -0.35, 2.1], [0.6, -3.05, 1.3], [-0.9, 3.15, -0.6], [3.0, 2.2, 0.9]].forEach(([x, z, r]) => {
      const k = kemik();
      k.position.x = x;
      k.position.z = z;
      k.rotation.y = r;
      sahne.add(k);
    });
    // Arka köşelerde örümcek ağları
    [[-4.2, 1.6, -3.4, 0], [4.2, 1.6, -3.4, Math.PI / 2]].forEach(([x, y, z, r]) => {
      const ag = orumcekAgi();
      ag.position.set(x, y, z);
      ag.rotation.z = r + Math.PI;
      sahne.add(ag);
    });
    // Mum ışığında süzülen toz zerreleri
    const N = 260;
    const konum = new Float32Array(N * 3);
    for (let k = 0; k < N; k++) konum.set([(rnd() - 0.5) * 8, rnd() * 2.6, (rnd() - 0.5) * 7], k * 3);
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.BufferAttribute(konum, 3));
    havaTozu = new THREE.Points(geo, new THREE.PointsMaterial({ color: 0xffd9a0, size: 0.025, transparent: true, opacity: 0.45, depthWrite: false }));
    sahne.add(havaTozu);
  }

  // Şimşek: pencereden giren ay ışığı iki kez çakar, sonra gök gürler
  function simsek() {
    const i0 = ayIsigi.intensity;
    Ses.gokGurultusu();
    return animasyon(0.9, (t, ham) => {
      const cakma = ham < 0.08 ? 1 : ham < 0.16 ? 0.15 : ham < 0.26 ? 0.8 : Math.max(0, 1 - ham) * 0.25;
      ayIsigi.intensity = ham >= 1 ? i0 : i0 + cakma * 9;
    }, dogrusal);
  }

  // Ani rüzgâr: bütün mumlar sönmek üzere titrer, sonra toparlanır
  function ruzgar() {
    Ses.ruzgarHamlesi();
    return animasyon(2.2, (t, ham) => {
      mumGucu = ham >= 1 ? 1 : 1 - Math.sin(ham * Math.PI) * 0.75 + (rnd() - 0.5) * 0.15 * Math.sin(ham * Math.PI);
    }, dogrusal);
  }

  // Karanlığın içinde bir çift kırmızı göz belirir, bir kez kırpar, kaybolur
  function gozler() {
    const aci = -Math.PI / 2 + (rnd() - 0.5) * 2.2;  // çoğunlukla arkada ve yanlarda
    const r = 5 + rnd() * 1.2;
    const grup = new THREE.Group();
    grup.position.set(Math.cos(aci) * r, 0.35 + rnd() * 0.5, Math.sin(aci) * r);
    grup.lookAt(0, 0.4, 2);
    const malz = new THREE.MeshBasicMaterial({ color: 0xff2a1a, transparent: true, opacity: 0, fog: false });
    [-1, 1].forEach(yan => {
      const goz = new THREE.Mesh(new THREE.SphereGeometry(0.035, 10, 8), malz);
      goz.scale.set(1.4, 0.7, 0.5);
      goz.position.x = yan * 0.09;
      grup.add(goz);
    });
    sahne.add(grup);
    return animasyon(4, (t, ham) => {
      const parlak = ham < 0.25 ? ham / 0.25 : ham > 0.8 ? (1 - ham) / 0.2 : 1;
      malz.opacity = parlak * 0.9;
      grup.scale.y = Math.abs(ham - 0.55) < 0.025 ? 0.1 : 1;
      if (ham >= 1) sahne.remove(grup);
    }, dogrusal);
  }

  function korkuDongu(dt, z) {
    if (havaTozu) {
      havaTozu.rotation.y = z * 0.01;
      havaTozu.position.y = Math.sin(z * 0.2) * 0.08;
    }
    if (hizliMod) return;
    Object.keys(olayZamani).forEach(ad => (olayZamani[ad] -= dt));
    if (olayZamani.simsek <= 0) {
      olayZamani.simsek = 30 + rnd() * 35;
      simsek();
    }
    if (olayZamani.ruzgar <= 0) {
      olayZamani.ruzgar = 22 + rnd() * 30;
      ruzgar();
    }
    if (olayZamani.goz <= 0) {
      olayZamani.goz = 18 + rnd() * 25;
      gozler();
    }
  }

  // ---------- Vazolar ----------
  function vazoKanvasi(ton, koyu) {
    const c = document.createElement('canvas');
    c.width = c.height = 256;
    const g = c.getContext('2d');
    g.fillStyle = koyu ? `hsl(${ton}, 30%, 25%)` : `hsl(${ton}, 40%, 32%)`;
    g.fillRect(0, 0, 256, 256);
    for (let k = 0; k < 900; k++) {
      g.fillStyle = `rgba(${rnd() < 0.5 ? 0 : 255},${rnd() < 0.5 ? 0 : 220},${rnd() < 0.5 ? 0 : 180},${0.03 + rnd() * 0.05})`;
      g.fillRect(rnd() * 256, rnd() * 256, 1 + rnd() * 3, 1 + rnd() * 3);
    }
    // Süs bantları ve zikzak desen (eski, tozlu, unutulmuş vazolar)
    const desen = koyu ? 'rgba(170,120,60,.55)' : 'rgba(15,8,5,.72)';
    g.fillStyle = desen;
    g.fillRect(0, 44, 256, 7);
    g.fillRect(0, 150, 256, 5);
    g.fillRect(0, 198, 256, 3);
    g.strokeStyle = desen;
    g.lineWidth = 3;
    g.beginPath();
    for (let x = 0; x <= 256; x += 16) g.lineTo(x, 110 + ((x / 16) % 2 ? 14 : 0));
    g.stroke();
    for (let x = 8; x < 256; x += 32) {
      g.beginPath();
      g.arc(x, 172, 4, 0, Math.PI * 2);
      g.fill();
    }
    const golge = g.createLinearGradient(0, 170, 0, 256);
    golge.addColorStop(0, 'rgba(0,0,0,0)');
    golge.addColorStop(1, 'rgba(0,0,0,.55)');
    g.fillStyle = golge;
    g.fillRect(0, 170, 256, 86);
    return c;
  }

  function vazoYap(i, konum) {
    const profil = PROFILLER[Math.floor(rnd() * PROFILLER.length)];
    const olcek = 0.9 + rnd() * 0.2;
    const kanvas = vazoKanvasi(12 + rnd() * 25, rnd() < 0.2);
    const doku = new THREE.CanvasTexture(kanvas);
    doku.colorSpace = THREE.SRGBColorSpace;
    doku.anisotropy = 4;
    const malzeme = new THREE.MeshStandardMaterial({ map: doku, roughness: 0.85, metalness: 0.05, side: THREE.DoubleSide });
    const govde = new THREE.Mesh(
      new THREE.LatheGeometry(profil.map(([r, y]) => new THREE.Vector2(r, y)), 32),
      malzeme,
    );
    govde.castShadow = govde.receiveShadow = true;
    govde.userData.vazo = i;

    const grup = new THREE.Group();
    grup.position.copy(konum);
    grup.position.y = 0.002;  // zeminle çakışmasın
    grup.scale.setScalar(olcek);
    grup.rotation.y = Math.PI + (rnd() - 0.5) * 0.4;  // desenin ortası (çatlakların yeri) kameraya baksın
    grup.add(govde);
    dinamik.add(grup);

    const isaret = new THREE.Mesh(
      new THREE.RingGeometry(0.3, 0.37, 40),
      new THREE.MeshBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0.9, side: THREE.DoubleSide }),
    );
    isaret.rotation.x = -Math.PI / 2;
    isaret.position.set(konum.x, 0.012, konum.z);
    isaret.visible = false;
    dinamik.add(isaret);

    const yukseklik = profil[profil.length - 1][1] * olcek;
    const enGenis = Math.max(...profil.map(p => p[0])) * olcek;
    return { grup, govde, malzeme, kanvas, doku, profil, olcek, konum, yukseklik, enGenis, isaret, kirik: false };
  }

  // Her vuruşta vazonun ön yüzüne yeni çatlaklar çizilir
  function catlakCiz(v, adet) {
    const g = v.kanvas.getContext('2d');
    g.lineCap = 'round';
    for (let k = 0; k < adet; k++) {
      let x = 128 + (rnd() - 0.5) * 70, y = 60 + rnd() * 130, aci = rnd() * Math.PI * 2;
      const noktalar = [[x, y]];
      const adim = 6 + rnd() * 6;
      for (let s = 0; s < adim; s++) {
        aci += (rnd() - 0.5) * 1.3;
        const boy = 8 + rnd() * 13;
        x += Math.cos(aci) * boy;
        y += Math.sin(aci) * boy;
        noktalar.push([x, y]);
      }
      [['rgba(255,220,180,.18)', 1], ['rgba(6,3,2,.95)', 0]].forEach(([renk, kay]) => {
        g.strokeStyle = renk;
        g.lineWidth = 1.5 + rnd() * 1.5;
        g.beginPath();
        noktalar.forEach(([px, py], n) => (n ? g.lineTo(px + kay, py + kay) : g.moveTo(px + kay, py + kay)));
        g.stroke();
      });
    }
    v.doku.needsUpdate = true;
  }

  function vazoSalla(v, guc = 1) {
    const r0 = v.grup.rotation.z;
    return animasyon(0.4, (t, ham) => {
      v.grup.rotation.z = r0 + Math.sin(ham * 40) * 0.05 * guc * (1 - ham);
    }, dogrusal);
  }

  // Vazonun üst yarısı tek parça halinde yere kapaklanır; altında bir şey saklanıyor olabilir...
  function buyukParcaYap(v) {
    const r = v.enGenis * 0.95;
    const kubbe = new THREE.Mesh(
      new THREE.SphereGeometry(r, 20, 10, 0, Math.PI * 2, 0, Math.PI * 0.42),
      new THREE.MeshStandardMaterial({ map: v.doku, roughness: 0.85, side: THREE.DoubleSide }),
    );
    kubbe.castShadow = true;
    kubbe.position.set(v.konum.x + 0.03, -r * 0.28, v.konum.z + 0.04);  // biraz gömülü: yere oturmuş gibi
    kubbe.rotation.set(0.15, rnd() * 3, -0.12);
    dinamik.add(kubbe);
    v.buyukParca = kubbe;
  }

  // Büyük parça önce titrer (içeride bir şey kıpırdıyor), sonra savrulup kenara düşer
  async function parcaKaldir(i) {
    const v = vazolar[i];
    const p = v.buyukParca;
    if (!p) return;
    const r0 = p.rotation.clone(), y0 = p.position.y;
    Ses.hisirti(1.2);
    await animasyon(1.1, (t, ham) => {
      p.rotation.x = r0.x + Math.sin(ham * 55) * 0.06 * ham;
      p.rotation.z = r0.z + Math.sin(ham * 43) * 0.05 * ham;
      p.position.y = y0 + Math.abs(Math.sin(ham * 30)) * 0.02 * ham;
    }, dogrusal);
    Ses.vurus();
    sarsinti = 0.06;
    const hiz = V(0.9 + rnd() * 0.5, 1.6, -0.6 - rnd() * 0.4);
    v.buyukParca = null;
    animasyon(0.9, (t, ham) => {
      p.position.x += hiz.x * 0.016;
      p.position.z += hiz.z * 0.016;
      p.position.y = Math.max(0.02, y0 + hiz.y * ham * 0.9 - 4.9 * (ham * 0.9) ** 2 + 0.1);
      p.rotation.x = r0.x + ham * 2.6;
      p.rotation.z = r0.z - ham * 1.2;
    }, dogrusal);
  }

  function kir(v, buyukParca = false) {
    v.kirik = true;
    v.govde.visible = false;
    v.isaret.visible = false;
    if (buyukParca) buyukParcaYap(v);

    // Yerde kalan kırık dip: zeminle aynı yükseklikte olmasın diye hafif yukarıda
    // (aynı yükseklikte olunca iki yüzey çakışıp siyah siyah titriyordu)
    const dipProfil = v.profil.slice(1, 3).map(([r, y]) => new THREE.Vector2(r, y + 0.004));
    const dip = new THREE.Mesh(new THREE.LatheGeometry(dipProfil, 20), new THREE.MeshStandardMaterial({ map: v.doku, roughness: 0.9, side: THREE.DoubleSide }));
    const taban = new THREE.Mesh(new THREE.CircleGeometry(v.profil[1][0], 20), new THREE.MeshStandardMaterial({ color: 0x3a2618, roughness: 1 }));
    taban.rotation.x = -Math.PI / 2;
    taban.position.y = 0.006;
    v.grup.add(dip, taban);

    // Etrafa saçılan parçalar
    const parcalar = [];
    for (let k = 0; k < 16; k++) {
      const p = new THREE.Mesh(
        new THREE.BoxGeometry(0.05 + rnd() * 0.08, 0.04 + rnd() * 0.08, 0.014),
        v.malzeme,
      );
      const a = rnd() * Math.PI * 2;
      const y = 0.08 + rnd() * v.yukseklik * 0.9;
      p.position.set(v.konum.x + Math.cos(a) * v.enGenis * 0.8, y, v.konum.z + Math.sin(a) * v.enGenis * 0.8);
      p.rotation.set(rnd() * 3, rnd() * 3, rnd() * 3);
      p.castShadow = true;
      const hiz = 0.8 + rnd() * 1.6;
      parcalar.push({ p, h: V(Math.cos(a) * hiz, 0.8 + rnd() * 2, Math.sin(a) * hiz), d: V(rnd() * 12, rnd() * 12, rnd() * 12) });
      dinamik.add(p);
    }
    let sure = 0;
    animasyonlar.push(dt => {
      sure += dt;
      parcalar.forEach(({ p, h, d }) => {
        h.y -= 9.8 * dt;
        p.position.addScaledVector(h, dt);
        p.rotation.x += d.x * dt;
        p.rotation.y += d.y * dt;
        p.rotation.z += d.z * dt;
        if (p.position.y < 0.01) {  // yere çarptı: sekip yavaşla
          p.position.y = 0.01;
          h.y *= -0.3;
          h.x *= 0.55;
          h.z *= 0.55;
          d.multiplyScalar(0.5);
        }
      });
      return sure < 3;
    });
    toz(v.konum, v.yukseklik);
  }

  function toz(merkez, yukseklik) {
    const ADET = 80;
    const konumlar = new Float32Array(ADET * 3);
    const hizlar = [];
    for (let k = 0; k < ADET; k++) {
      konumlar.set([merkez.x + (rnd() - 0.5) * 0.3, rnd() * yukseklik, merkez.z + (rnd() - 0.5) * 0.3], k * 3);
      hizlar.push(V((rnd() - 0.5) * 0.9, 0.1 + rnd() * 0.4, (rnd() - 0.5) * 0.9));
    }
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.BufferAttribute(konumlar, 3));
    const malz = new THREE.PointsMaterial({ color: 0x9c8a70, size: 0.025, transparent: true, opacity: 0.8, depthWrite: false });
    const bulut = new THREE.Points(geo, malz);
    dinamik.add(bulut);
    let sure = 0;
    animasyonlar.push(dt => {
      sure += dt;
      for (let k = 0; k < ADET; k++) {
        konumlar[k * 3] += hizlar[k].x * dt;
        konumlar[k * 3 + 1] += hizlar[k].y * dt;
        konumlar[k * 3 + 2] += hizlar[k].z * dt;
      }
      geo.attributes.position.needsUpdate = true;
      malz.opacity = 0.8 * Math.max(0, 1 - sure / 2.5);
      if (sure > 2.5) {
        dinamik.remove(bulut);
        return false;
      }
      return true;
    });
  }

  // ---------- Çekiç ----------
  // Eski, kullanılmış bir pençeli çekiç: damarlı ahşap sap, deri sargılı tutamak, çelik kafa
  function ahsapDokusu() {
    const c = document.createElement('canvas');
    c.width = 64;
    c.height = 512;
    const g = c.getContext('2d');
    g.fillStyle = '#7a5230';
    g.fillRect(0, 0, 64, 512);
    for (let k = 0; k < 40; k++) {  // boyuna uzanan ağaç damarları
      g.strokeStyle = `rgba(${rnd() < 0.5 ? '40,22,10' : '150,105,60'},${0.25 + rnd() * 0.35})`;
      g.lineWidth = 0.5 + rnd() * 1.5;
      g.beginPath();
      let x = rnd() * 64;
      g.moveTo(x, 0);
      for (let y = 0; y <= 512; y += 32) g.lineTo((x += (rnd() - 0.5) * 3), y);
      g.stroke();
    }
    for (let k = 0; k < 6; k++) {  // budak ve kir lekeleri
      g.fillStyle = 'rgba(30,15,5,.35)';
      g.beginPath();
      g.ellipse(rnd() * 64, rnd() * 512, 3 + rnd() * 4, 8 + rnd() * 10, 0, 0, Math.PI * 2);
      g.fill();
    }
    const doku = new THREE.CanvasTexture(c);
    doku.colorSpace = THREE.SRGBColorSpace;
    return doku;
  }

  function cekicYap() {
    const grup = new THREE.Group();  // grubun merkezi = sapın tutulduğu yer; sap -x yönüne uzanır
    const celik = new THREE.MeshStandardMaterial({ color: 0x8c9098, metalness: 0.75, roughness: 0.32 });
    const parlak = new THREE.MeshStandardMaterial({ color: 0xc8ccd2, metalness: 0.9, roughness: 0.18 });

    // Sap: ucu şişkin, ortası incelen, kafaya doğru kalınlaşan ahşap
    const sapProfil = [[0, 0], [0.026, 0], [0.028, 0.03], [0.024, 0.12], [0.019, 0.3], [0.021, 0.44], [0.023, 0.5], [0, 0.5]]
      .map(([r, y]) => new THREE.Vector2(r, y));
    const sap = new THREE.Mesh(new THREE.LatheGeometry(sapProfil, 16), new THREE.MeshStandardMaterial({ map: ahsapDokusu(), roughness: 0.7 }));
    sap.rotation.z = Math.PI / 2;  // y ekseni boyunca yapılan sap, -x yönüne yatar
    grup.add(sap);
    // Deri sargılı tutamak
    const sargi = new THREE.MeshStandardMaterial({ color: 0x2a1a12, roughness: 0.9 });
    for (let k = 0; k < 9; k++) {
      const halka = new THREE.Mesh(new THREE.TorusGeometry(0.027, 0.006, 6, 16), sargi);
      halka.rotation.y = Math.PI / 2 + 0.25;
      halka.position.x = -0.025 - k * 0.014;
      grup.add(halka);
    }

    const kafa = new THREE.Group();
    kafa.position.x = -0.5;
    // Göz: sapın geçtiği orta blok
    const goz = new THREE.Mesh(new THREE.BoxGeometry(0.06, 0.07, 0.05), celik);
    kafa.add(goz);
    // Vuran yüz: aşağı bakan, ucu genişleyen silindir
    const boyun = new THREE.Mesh(new THREE.CylinderGeometry(0.024, 0.028, 0.07, 20), celik);
    boyun.position.y = -0.07;
    const yuz = new THREE.Mesh(new THREE.CylinderGeometry(0.033, 0.031, 0.025, 24), parlak);
    yuz.position.y = -0.115;
    const pah = new THREE.Mesh(new THREE.TorusGeometry(0.031, 0.004, 6, 24), celik);
    pah.rotation.x = Math.PI / 2;
    pah.position.y = -0.103;
    kafa.add(boyun, yuz, pah);
    // Pençe: yukarı çıkıp sapa doğru kıvrılan iki sivri tırnak
    [-1, 1].forEach(yan => {
      const tirnak = new THREE.Mesh(new THREE.TorusGeometry(0.065, 0.011, 8, 16, Math.PI * 0.72), celik);
      tirnak.rotation.z = Math.PI * 0.28;
      tirnak.position.set(0.062, 0.02, yan * 0.011);
      tirnak.scale.z = 0.7;
      kafa.add(tirnak);
    });
    grup.add(kafa);

    grup.traverse(o => (o.castShadow = true));
    grup.visible = false;
    return grup;
  }

  // Çekici vazonun sağ önüne yerleştir; dönüş açısı: 0 = vuruş anı, negatif = havada
  function cekiciHazirla(v) {
    const yon = V(1, 0, 1.1).normalize();
    cekic.position.copy(v.konum).addScaledVector(yon, 0.62);
    cekic.position.y = v.yukseklik * 0.8 + 0.13;
    cekic.rotation.set(0, Math.atan2(-yon.z, yon.x), -0.35);
    cekic.visible = true;
  }

  // hizli: Lanetli Sıra kartında vazolar kendiliğinden, seri vurulur
  // buyukParca: kırılınca üst yarısı tek parça halinde yere kapaklansın
  async function vur(i, kirilsin, hizli = false, buyukParca = false) {
    const v = vazolar[i];
    cekiciHazirla(v);
    await animasyon(hizli ? 0.18 : 0.3, t => (cekic.rotation.z = -0.35 - 1.0 * t));  // kaldır
    await animasyon(0.08, t => (cekic.rotation.z = -1.35 + 1.35 * t), dogrusal);       // indir
    Ses.vurus();
    if (kirilsin) {
      sarsinti = 0.12;
      cekic.visible = false;
      Ses.kirilma();
      kir(v, buyukParca);  // bekleme yok: yılan hemen arkasından çıkar
    } else {
      sarsinti = 0.05;
      catlakCiz(v, 2 + Math.floor(rnd() * 2));
      vazoSalla(v);
      await animasyon(hizli ? 0.15 : 0.3, t => (cekic.rotation.z = -0.35 * t));
    }
  }

  // ---------- Yılan ----------
  // Gövde tek parça bir "tüp": omurga boyunca dizilmiş halkalardan oluşur ve
  // her karede kafanın geçtiği yola (iz) göre yeniden bükülür.
  const GOVDE_N = 56, GOVDE_ARA = 0.036, HALKA = 14, BOYUN = 0.05, CINGIRAK_ARA = 0.026;

  // Kuyruktaki 4 çıngırak boğumu: sahiplerin renkleri sırayla dizilir
  function cingirakRenkleri(renkler) {
    return [0, 1, 2, 3].map(k => renkler[k % renkler.length]);
  }

  function baklava(g, x, y, gen, boy) {
    g.beginPath();
    g.moveTo(x, y - boy);
    g.lineTo(x + gen, y);
    g.lineTo(x, y + boy);
    g.lineTo(x - gen, y);
    g.closePath();
    g.fill();
  }

  // Çıngıraklı yılan derisi: sırtta baklava desen, yanlarda lekeler, açık renk karın, pullar
  let deriDokusu = null;
  function yilanDerisi() {
    if (deriDokusu) return deriDokusu;
    const c = document.createElement('canvas');
    c.width = 128;   // gövdenin etrafı: x=32 sırt, x=96 karın
    c.height = 1024; // gövdenin boyu
    const g = c.getContext('2d');
    const renk = g.createLinearGradient(0, 0, 128, 0);
    [[0, '#5e4b2b'], [0.25, '#6e5a34'], [0.5, '#5e4b2b'], [0.64, '#a8956a'], [0.75, '#d3c497'], [0.86, '#a8956a'], [1, '#5e4b2b']]
      .forEach(([d, r]) => renk.addColorStop(d, r));
    g.fillStyle = renk;
    g.fillRect(0, 0, 128, 1024);
    for (let y = 0; y < 1024; y += 46) {
      g.fillStyle = '#e3d3a0';
      baklava(g, 32, y + 23, 29, 25);
      g.fillStyle = '#24180b';
      baklava(g, 32, y + 23, 25, 21);
      g.fillStyle = '#4d3a1f';
      baklava(g, 32, y + 23, 13, 10);
      g.fillStyle = 'rgba(28,18,8,.7)';  // yan lekeler
      [0, 64, 128].forEach(x => {
        g.beginPath();
        g.ellipse(x, y, 7, 9, 0, 0, Math.PI * 2);
        g.fill();
      });
    }
    g.strokeStyle = 'rgba(0,0,0,.22)';  // pullar
    g.lineWidth = 1;
    for (let y = 0; y < 1024; y += 6) {
      for (let x = (y / 6) % 2 ? 4 : 0; x < 72; x += 8) {
        g.beginPath();
        g.arc(x, y, 4, 0, Math.PI);
        g.stroke();
      }
    }
    g.strokeStyle = 'rgba(70,52,24,.45)';  // karın plakaları
    for (let y = 0; y < 1024; y += 9) {
      g.beginPath();
      g.moveTo(76, y);
      g.lineTo(116, y);
      g.stroke();
    }
    for (let k = 0; k < 3000; k++) {
      g.fillStyle = `rgba(${rnd() < 0.5 ? 0 : 255},${rnd() < 0.5 ? 0 : 230},${rnd() < 0.5 ? 0 : 180},.06)`;
      g.fillRect(rnd() * 128, rnd() * 1024, 1, 1);
    }
    deriDokusu = new THREE.CanvasTexture(c);
    deriDokusu.colorSpace = THREE.SRGBColorSpace;
    deriDokusu.anisotropy = 4;
    return deriDokusu;
  }

  function govdeGeometrisi() {
    const n = GOVDE_N * (HALKA + 1);
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.BufferAttribute(new Float32Array(n * 3), 3));
    const uv = new Float32Array(n * 2);
    for (let i = 0; i < GOVDE_N; i++) {
      for (let j = 0; j <= HALKA; j++) {
        const k = i * (HALKA + 1) + j;
        uv[k * 2] = j / HALKA;
        uv[k * 2 + 1] = 1 - i / (GOVDE_N - 1);
      }
    }
    geo.setAttribute('uv', new THREE.BufferAttribute(uv, 2));
    const ucgenler = [];
    for (let i = 0; i < GOVDE_N - 1; i++) {
      for (let j = 0; j < HALKA; j++) {
        const a = i * (HALKA + 1) + j, b = a + HALKA + 1;
        ucgenler.push(a, b, a + 1, b, b + 1, a + 1);
      }
    }
    geo.setIndex(ucgenler);
    return geo;
  }

  // Boyundan kuyruğa kalınlık: ince boyun, kalın gövde, sivrilen kuyruk
  function govdeYaricapi(i) {
    const t = i / (GOVDE_N - 1);
    if (t < 0.08) return lerp(0.03, 0.042, t / 0.08);
    if (t < 0.6) return 0.042 + 0.009 * Math.sin(((t - 0.08) / 0.52) * Math.PI);
    return lerp(0.042, 0.016, (t - 0.6) / 0.4);
  }

  // Üçgen, yassı, burna doğru daralan engerek kafası
  function kafaGeometrisi(gen, ust, alt, boy) {
    const geo = new THREE.SphereGeometry(1, 28, 18);
    const p = geo.attributes.position;
    for (let k = 0; k < p.count; k++) {
      const x = p.getX(k), y = p.getY(k), z = p.getZ(k);
      const on = (z + 1) / 2;  // 0 ense, 1 burun
      p.setXYZ(k, x * gen * (1 - 0.45 * on * on), y * (y > 0 ? ust : alt) * (1 - 0.3 * on), z * boy);
    }
    geo.computeVertexNormals();
    return geo;
  }

  function yilanYap(renkler) {
    const grup = new THREE.Group();
    const malzemeler = [];
    const malz = ayar => {
      const m = new THREE.MeshStandardMaterial(ayar);
      malzemeler.push(m);
      return m;
    };

    const govdeGeo = govdeGeometrisi();
    const govde = new THREE.Mesh(govdeGeo, malz({ map: yilanDerisi(), roughness: 0.42, metalness: 0.08, side: THREE.DoubleSide }));
    govde.castShadow = true;
    govde.frustumCulled = false;
    grup.add(govde);

    const kure = new THREE.SphereGeometry(1, 14, 10);
    const cingirak = cingirakRenkleri(renkler).map((renk, k) => {
      const m = new THREE.Mesh(kure, malz({ color: renk, emissive: renk, emissiveIntensity: 1.1, roughness: 0.35 }));
      const r = 0.036 - k * 0.003;
      m.scale.set(r, r * 0.65, r * 0.75);  // üst üste dizilmiş düğmeler gibi
      grup.add(m);
      return m;
    });

    // Kafa
    const kafa = new THREE.Group();
    const deriRengi = malz({ color: 0x5a4628, roughness: 0.4, metalness: 0.08 });
    kafa.add(new THREE.Mesh(kafaGeometrisi(0.062, 0.03, 0.016, 0.09), deriRengi));
    const goz = malz({ color: 0xffc400, emissive: 0xff9900, emissiveIntensity: 1.3, roughness: 0.2 });
    const gozMalz = goz;
    const siyah = malz({ color: 0x000000, roughness: 0.2 });
    [-1, 1].forEach(yan => {
      const g = new THREE.Mesh(kure, goz);
      g.scale.setScalar(0.012);
      g.position.set(yan * 0.04, 0.014, 0.022);
      const bebek = new THREE.Mesh(kure, siyah);  // dikey yarık göz bebeği
      bebek.scale.set(0.0025, 0.01, 0.004);
      bebek.position.set(yan * 0.051, 0.014, 0.025);
      const kas = new THREE.Mesh(kure, deriRengi);  // gözün üstündeki kaş pulu: sinirli bakış
      kas.scale.set(0.017, 0.006, 0.02);
      kas.position.set(yan * 0.037, 0.026, 0.02);
      kas.rotation.z = yan * -0.35;
      const serit = new THREE.Mesh(kure, malz({ color: 0x1c1309, roughness: 0.5 }));  // gözden geçen koyu şerit
      serit.scale.set(0.004, 0.006, 0.035);
      serit.position.set(yan * 0.046, 0.008, -0.01);
      kafa.add(g, bebek, kas, serit);
    });
    const agizIci = new THREE.Mesh(kure, malz({ color: 0xc23a52, emissive: 0x3a0610, roughness: 0.6 }));
    agizIci.scale.set(0.045, 0.01, 0.07);
    agizIci.position.set(0, -0.01, 0.005);
    kafa.add(agizIci);
    // Boğaz: ağız sonuna kadar açılınca içeride kapkara bir delik görünür
    const bogaz = new THREE.Mesh(kure, malz({ color: 0x080203, roughness: 0.9 }));
    bogaz.scale.set(0.02, 0.012, 0.02);
    bogaz.position.set(0, -0.012, -0.035);
    kafa.add(bogaz);
    // Uzun zehir dişleri: ağız açıldıkça öne doğru dikleşir
    const disMalz = malz({ color: 0xf4f0e4, roughness: 0.25 });
    const disler = [-1, 1].map(yan => {
      const dis = new THREE.Mesh(new THREE.ConeGeometry(0.0055, 0.042, 6), disMalz);
      dis.rotation.x = Math.PI - 0.3;
      dis.position.set(yan * 0.02, -0.024, 0.058);
      kafa.add(dis);
      return dis;
    });
    const cene = new THREE.Group();  // açılıp kapanan alt çene
    cene.position.set(0, -0.012, -0.06);
    const alt = new THREE.Mesh(kafaGeometrisi(0.05, 0.008, 0.012, 0.08), malz({ color: 0xc9b98a, roughness: 0.5 }));
    alt.position.set(0, 0, 0.06);
    cene.add(alt);
    // Alt çenede küçük, sivri dişler
    for (let k = 0; k < 8; k++) {
      const yan = k % 2 ? 1 : -1;
      const d = new THREE.Mesh(new THREE.ConeGeometry(0.0022, 0.009, 5), disMalz);
      d.position.set(yan * (0.014 + Math.floor(k / 2) * 0.002), 0.006, 0.075 + Math.floor(k / 2) * 0.012);
      cene.add(d);
    }
    kafa.add(cene);
    const dil = new THREE.Group();
    dil.position.set(0, -0.01, 0.075);
    const dilMalz = malz({ color: 0x1a0a0e, roughness: 0.5 });  // gerçek yılanlarda dil koyu renklidir
    [-1, 1].forEach(yan => {
      const uc = new THREE.Mesh(new THREE.BoxGeometry(0.003, 0.002, 0.05), dilMalz);
      uc.position.set(yan * 0.006, 0, 0.024);
      uc.rotation.y = yan * 0.28;
      dil.add(uc);
    });
    kafa.add(dil);
    kafa.traverse(o => (o.castShadow = true));
    grup.add(kafa);
    dinamik.add(grup);

    return {
      grup, govdeGeo, cingirak, kafa, cene, dil, malzemeler, disler, agizIci, gozMalz,
      omurga: Array.from({ length: GOVDE_N + 4 }, () => V()),
      iz: [], bas: V(), bakis: null, agiz: 0, titre: false, zaman: 0, buyukluk: 1, ofke: 0,
    };
  }

  // Başlangıçta yılan, kırık vazonun içinde kangal olmuş yatar (kafa ortada, en üstte)
  function kangal(merkez, uzunluk) {
    const nokta = t => {
      const r = 0.05 + 0.03 * t;
      return V(merkez.x + Math.cos(t) * r, 0.05 + Math.max(0, 0.13 - t * 0.014), merkez.z + Math.sin(t) * r);
    };
    const noktalar = [nokta(0)];
    let t = 0, s = 0;
    while (s < uzunluk + 0.2) {
      t += 0.05;
      const n = nokta(t);
      s += n.distanceTo(noktalar[noktalar.length - 1]);
      noktalar.push(n);
    }
    return noktalar;
  }

  const T = V(), N = V(), B = V(), YUKARI = V(0, 1, 0), ILERI = V(0, 0, 1), gecici = V();

  function yilanGuncelle(y, dt) {
    y.zaman += dt;
    const iz = y.iz;
    if (iz[0].distanceTo(y.bas) > 0.004) iz.unshift(y.bas.clone());

    // Omurga noktalarını kafanın izinden, sabit aralıklarla al
    let k = 0, birikim = 0;
    y.omurga.forEach((nokta, i) => {
      const hedef = i < GOVDE_N
        ? BOYUN + i * GOVDE_ARA
        : BOYUN + (GOVDE_N - 1) * GOVDE_ARA + (i - GOVDE_N + 1) * CINGIRAK_ARA;
      while (k < iz.length - 1) {
        const d = iz[k].distanceTo(iz[k + 1]);
        if (birikim + d >= hedef) {
          nokta.lerpVectors(iz[k], iz[k + 1], (hedef - birikim) / d);
          return;
        }
        birikim += d;
        k++;
      }
      nokta.copy(iz[iz.length - 1]);
    });
    iz.length = Math.min(iz.length, k + 2);

    // Gövde tüpünü omurga üzerine giydir
    const p = y.omurga;
    const konum = y.govdeGeo.attributes.position.array;
    for (let i = 0; i < GOVDE_N; i++) {
      T.subVectors(p[Math.max(0, i - 1)], p[Math.min(GOVDE_N - 1, i + 1)]).normalize();
      N.crossVectors(T, YUKARI);
      if (N.lengthSq() < 0.01) N.crossVectors(T, ILERI);
      N.normalize();
      B.crossVectors(N, T).normalize();
      const r = govdeYaricapi(i);
      for (let j = 0; j <= HALKA; j++) {
        const a = (j / HALKA) * Math.PI * 2;
        const yan = Math.cos(a) * r, dik = Math.sin(a) * r * 0.82;  // biraz yassı gövde
        const n = (i * (HALKA + 1) + j) * 3;
        konum[n] = p[i].x + N.x * yan + B.x * dik;
        konum[n + 1] = p[i].y + N.y * yan + B.y * dik;
        konum[n + 2] = p[i].z + N.z * yan + B.z * dik;
      }
    }
    y.govdeGeo.attributes.position.needsUpdate = true;
    y.govdeGeo.computeVertexNormals();

    // Çıngırak boğumları, kuyruğun devamında yola bakarak dizilir
    y.cingirak.forEach((m, c) => {
      const i = GOVDE_N + c;
      m.position.copy(p[i]);
      if (y.titre) m.position.y += Math.sin(y.zaman * 70 + c) * 0.008;
      m.lookAt(p[i - 1]);
    });

    y.kafa.position.copy(y.bas);
    y.kafa.scale.setScalar(y.buyukluk);
    if (y.bakis) y.kafa.lookAt(y.bakis);
    else y.kafa.lookAt(gecici.copy(y.bas).multiplyScalar(2).sub(p[1]));
    // agiz 0..1.8: 1'in üstü saldırı anı, çene neredeyse dik açıyla açılır, üst çene de geriye kalkar
    y.cene.rotation.x = y.agiz * 0.85;
    if (y.agiz > 0.6) y.kafa.rotateX(-(y.agiz - 0.6) * 0.22);
    y.disler.forEach(d => (d.rotation.x = Math.PI - 0.3 - Math.min(y.agiz, 1.8) * 0.45));
    y.agizIci.scale.y = 0.01 + Math.min(y.agiz, 1.8) * 0.012;
    y.gozMalz.emissiveIntensity = 1.3 + y.ofke * 4 + (y.ofke ? Math.sin(y.zaman * 40) * 0.8 : 0);
    // Dil: saldırıda hızlı hızlı çıkıp girer
    y.dil.scale.z = 0.2 + 0.8 * Math.max(0, Math.sin(y.zaman * (y.ofke ? 30 : 9)));
  }

  function yilanSil(y) {
    y.olu = true;
    dinamik.remove(y.grup);
  }

  // Yılan karanlığa doğru, kameradan uzağa kıvrılarak sürünür ve kaybolur.
  // kesme: yolun ne kadarında kesilsin (dönecek yılan solmadan, yarı yolda aniden durur)
  async function kac(y, m, sure = 3.2, kesme = 1) {
    y.bakis = null;
    y.agiz = 0;
    const yon = V(Math.sign(m.x || 1) * (0.4 + rnd() * 0.5), 0, -1).normalize();
    const dik = V(-yon.z, 0, yon.x);
    const bas0 = y.bas.clone();
    y.malzemeler.forEach(mz => (mz.transparent = true));
    await animasyon(sure * kesme, (t, h) => {
      const ham = h * kesme;
      const s = ham * sure * 1.15;
      const kivrim = Math.sin(s * 7) * 0.1;
      y.bas.set(bas0.x + yon.x * s + dik.x * kivrim, lerp(bas0.y, 0.05, Math.min(1, ham * 4)), bas0.z + yon.z * s + dik.z * kivrim);
      if (ham > 0.6) y.malzemeler.forEach(mz => (mz.opacity = 1 - (ham - 0.6) / 0.4));
    }, dogrusal);
    if (kesme >= 1) yilanSil(y);
  }

  // Önce geri çekilip ağzını sonuna kadar açar, sonra hızlanarak kameraya yapışır ve ekranda iki kez ısırır.
  // Kafanın son yerini döndürür.
  async function yuzeAtla(y, olaylar, sure) {
    y.titre = true;
    y.bakis = bakis.konum;
    y.ofke = 1;
    const cikis = y.bas.clone();
    // 1) Gerilme: S gibi geri kasılır, ağız açılır, dişler dikleşir
    const geri = cikis.clone().add(V(0, 0.1, -0.1));
    Ses.tiss(0.45, 0.3);
    await animasyon(0.24, t => {
      y.bas.lerpVectors(cikis, geri, t);
      y.agiz = 0.5 + t * 1.1;
      y.buyukluk = 1 + t * 0.15;
    });
    // 2) Saldırı: hızlanarak ekrana yapışır, ağız sonuna kadar açık
    const hedef = bakis.konum.clone().lerp(bakis.hedef, 0.13);  // bütün surat (ağız, dişler) ekranı doldursun
    await animasyon(sure, t => {
      y.bas.lerpVectors(geri, hedef, t);
      y.buyukluk = 1.15 + t * 1.25;
      y.agiz = 1.6 + t * 0.2;
    }, t => t * t);
    Ses.atlama();
    Ses.ciglik();
    sarsinti = 0.5;
    if (navigator.vibrate) navigator.vibrate([300, 40, 200, 40, 450]);
    if (olaylar.atladi) olaylar.atladi();
    // 3) Ekranın dibinde iki kez ısırır: çene kapanıp açılır, kafa titrer
    let sonIsirik = -1;
    await animasyon(0.75, (t, ham) => {
      const isirik = Math.abs(Math.sin(ham * Math.PI * 2));
      y.agiz = 1.8 - isirik * 1.2;
      const kac = Math.floor(ham * 2);
      if (isirik > 0.95 && kac !== sonIsirik) {
        sonIsirik = kac;
        Ses.isirma();
      }
      y.bas.set(hedef.x + (rnd() - 0.5) * 0.02, hedef.y + (rnd() - 0.5) * 0.02, hedef.z);
    }, dogrusal);
    y.agiz = 1.6;
    await bekle(0.3);
    y.bas.copy(hedef);
    y.titre = false;
    y.ofke = 0;
    return hedef;
  }

  // davranis: 'kac' (sürünüp gider), 'tisla' (uzaktan tıslar), 'atla' (yüze atlar),
  //           'donus' (sürünüp gider, herkes rahatlar, sonra birden dönüp yüze atlar)
  async function yilanCikar(i, renkler, davranis, olaylar = {}) {
    const v = vazolar[i];
    const m = v.konum;
    const y = yilanYap(renkler);
    y.iz = kangal(m, BOYUN + GOVDE_N * GOVDE_ARA + 4 * CINGIRAK_ARA);
    y.bas.copy(y.iz[0]);
    yilanGuncelle(y, 0);
    animasyonlar.push(dt => {
      if (!y.olu) yilanGuncelle(y, dt);
      return !y.olu;
    });
    Ses.hisirti(1.2);
    if (olaylar.cikti) olaylar.cikti();
    y.bakis = bakis.konum;
    const ustNokta = V(m.x, davranis === 'kac' || davranis === 'donus' ? 0.3 : 0.5, m.z + 0.06);

    if (davranis === 'atla') {
      // Göründüğü an: hiç beklemeden kalkar ve yüze atılır
      y.agiz = 1;
      y.titre = true;
      Ses.cingirak(0.4);
      const bas0 = y.bas.clone();
      await animasyon(0.16, t => y.bas.lerpVectors(bas0, ustNokta, t), dogrusal);
      const hedef = await yuzeAtla(y, olaylar, 0.15);
      await animasyon(0.45, t => {
        y.bas.lerpVectors(hedef, ustNokta, t);
        y.buyukluk = 2.4 - t * 1.4;
        y.agiz = 1.6 - t * 0.6;
      });
    } else if (davranis === 'donus') {
      // Başı sürünüp giden yılanla birebir aynı; herkes rahatlar... ve sürünürken
      // hiç durmadan birden dönüp saldırır
      Ses.cingirak(0.7);
      const bas0 = y.bas.clone();
      await animasyon(0.5, (t, ham) => {
        y.bas.lerpVectors(bas0, ustNokta, t);
        y.bas.x += Math.sin(ham * 6) * 0.04 * (1 - ham);
      });
      await bekle(0.5);
      if (olaylar.gidiyor) olaylar.gidiyor();
      await kac(y, m, 3.2, 0.35 + rnd() * 0.2);  // solmaya başlamadan önce kesilir
      y.malzemeler.forEach(mz => (mz.opacity = 1));
      y.bakis = bakis.konum;  // kafasını çevirip bize bakar
      y.titre = true;
      const yer = y.bas.clone();
      const kalk = yer.clone().setY(0.45);
      Ses.tiss(0.6, 0.5);
      await animasyon(0.14, t => y.bas.lerpVectors(yer, kalk, t), dogrusal);
      const hedef = await yuzeAtla(y, olaylar, 0.2);
      await animasyon(0.45, t => {
        y.bas.lerpVectors(hedef, kalk, t);
        y.buyukluk = 2.4 - t * 1.4;
        y.agiz = 1.6 - t * 0.6;
      });
    } else {
      // Kafasını kaldırıp kameraya döner
      Ses.cingirak(davranis === 'kac' ? 0.7 : 0.4);
      const bas0 = y.bas.clone();
      await animasyon(0.5, (t, ham) => {
        y.bas.lerpVectors(bas0, ustNokta, t);
        y.bas.x += Math.sin(ham * 6) * 0.04 * (1 - ham);
      });
      if (davranis === 'tisla') {
        y.agiz = 1;
        y.titre = true;
        Ses.tiss(0.4, 1.8);
        Ses.cingirak(1.8);
        await animasyon(1.9, (t, ham) => {
          y.bas.x = ustNokta.x + Math.sin(ham * 12) * 0.05;
          y.bas.z = ustNokta.z + Math.sin(ham * Math.PI) * 0.09;  // ileri doğru bir yoklama
        }, dogrusal);
        y.titre = false;
      } else {
        await bekle(0.5);  // herkes çıngırağın rengine baksın
        if (olaylar.gidiyor) olaylar.gidiyor();  // dönecek yılanla aynı mesaj: hangisinin döneceği anlaşılmasın
      }
    }
    await kac(y, m);
  }

  async function bosCikar(i, sahte) {
    if (sahte) Ses.tiss(0.1, 0.7);  // bir şey tısladı mı yoksa rüzgâr mıydı?
    await bekle(1.2);
  }

  // ---------- Kamera ----------
  function genelKonum() {
    const k = Math.max(1, 0.95 / kamera.aspect);  // dik telefonda geri çekil ki 30 vazo sığsın
    return V(0, 5.3 * k, 4.5 * k);
  }

  function kameraGit(konum, hedef, sure = 1.1) {
    const k0 = bakis.konum.clone(), h0 = bakis.hedef.clone();
    return animasyon(sure, t => {
      bakis.konum.lerpVectors(k0, konum, t);
      bakis.hedef.lerpVectors(h0, hedef, t);
    });
  }

  function odakla(i, sure = 1.0) {
    const v = vazolar[i];
    genelBakista = false;
    odakIsigi.position.set(v.konum.x + 0.3, 3.2, v.konum.z + 0.8);
    odakIsigi.target.position.copy(v.konum);
    const i0 = odakIsigi.intensity;
    animasyon(0.8, t => (odakIsigi.intensity = lerp(i0, 16, t)));
    const uzaklik = kamera.aspect < 0.8 ? 2.2 : 1.6;
    return kameraGit(
      V(v.konum.x + 0.25, v.yukseklik + uzaklik * 1.05, v.konum.z + uzaklik),  // yukarıdan bak ki öndeki vazo görüşü kapatmasın
      V(v.konum.x, v.yukseklik * 0.55, v.konum.z),
      sure,
    );
  }

  function genelBakis() {
    genelBakista = true;
    cekic.visible = false;
    const i0 = odakIsigi.intensity;
    animasyon(0.8, t => (odakIsigi.intensity = lerp(i0, 0, t)));
    return kameraGit(genelKonum(), V(0, 0, 0.15), 1.1);
  }

  // ---------- Döndürme kartı ----------
  // Bütün vazolar (kırıkları ve parçalarıyla) tahtanın ortası etrafında yavaşça 90 derece döner,
  // döner tabla gibi: vazolar yer değiştirirken hep kameraya bakar. yon: 1 = sağa (saat yönü), -1 = sola.
  async function dondur(yon) {
    const aci = -yon * Math.PI / 2;  // yukarıdan bakınca saat yönü = Y ekseninde eksi
    const parcalar = dinamik.children.map(n => ({ n, x: n.position.x, z: n.position.z, ry: n.rotation.y }));
    const Y = V(0, 1, 0);
    sarsinti = 0.04;
    await animasyon(3.2, t => {
      const a = aci * t;
      const c = Math.cos(a), s = Math.sin(a);
      parcalar.forEach(p => {
        p.n.position.x = p.x * c + p.z * s;
        p.n.position.z = -p.x * s + p.z * c;
      });
      sarsinti = Math.max(sarsinti, 0.015);
    });
    sarsinti = 0;
    vazolar.forEach(v => v.konum.applyAxisAngle(Y, aci));
  }

  function boyutla() {
    const g = window.innerWidth, y = window.innerHeight;
    renderer.setSize(g, y);
    kamera.aspect = g / y;
    kamera.updateProjectionMatrix();
    if (genelBakista) bakis.konum.copy(genelKonum());
  }

  // ---------- Fare / dokunma ----------
  function vazoBul(e) {
    const kutu = renderer.domElement.getBoundingClientRect();
    fare.set(((e.clientX - kutu.left) / kutu.width) * 2 - 1, -((e.clientY - kutu.top) / kutu.height) * 2 + 1);
    isin.setFromCamera(fare, kamera);
    const govdeler = vazolar.filter(v => !v.kirik).map(v => v.govde);
    const vurulan = isin.intersectObjects(govdeler, false)[0];
    return vurulan ? vurulan.object.userData.vazo : -1;
  }

  function fareDinle(el) {
    let basX = 0, basY = 0;
    el.addEventListener('pointermove', e => {
      if (e.pointerType !== 'mouse') return;
      const i = vazoBul(e);
      const yeni = i >= 0 && secilebilir(i) ? i : -1;
      if (yeni !== uzerinde) {
        uzerinde = yeni;
        uzerineGelince(uzerinde);
      }
      el.style.cursor = uzerinde >= 0 ? 'pointer' : 'default';
    });
    el.addEventListener('pointerdown', e => {
      basX = e.clientX;
      basY = e.clientY;
    });
    el.addEventListener('pointerup', e => {
      if (Math.hypot(e.clientX - basX, e.clientY - basY) > 10) return;
      const i = vazoBul(e);
      if (i >= 0 && secilebilir(i)) tiklaninca(i, e.pointerType);
    });
  }

  // ---------- Her kare ----------
  function dongu() {
    const dt = Math.min(saat.getDelta(), 0.05);
    const z = saat.elapsedTime;
    for (let k = animasyonlar.length - 1; k >= 0; k--) {
      if (animasyonlar[k] && animasyonlar[k](dt) === false) animasyonlar.splice(k, 1);
    }

    korkuDongu(dt, z);
    mumlar.forEach(m => {
      const titreme = 0.75 + 0.15 * Math.sin(z * 9 + m.faz) + 0.1 * Math.sin(z * 23 + m.faz * 2) + (rnd() - 0.5) * 0.12;
      m.isik.intensity = 6 * titreme * mumGucu;
      m.alev.scale.set(1, (1.6 + titreme * 0.4) * (0.4 + 0.6 * mumGucu), 1);
    });

    vazolar.forEach((v, i) => {
      if (v.kirik) return;
      v.malzeme.emissive.setHex(i === uzerinde ? 0x3a1c08 : 0x000000);
      if (v.isaret.visible) v.isaret.material.opacity = 0.65 + 0.3 * Math.sin(z * 4);
    });

    kamera.position.copy(bakis.konum);
    kamera.position.x += Math.sin(z * 0.5) * 0.02;  // hafif nefes alır gibi sallanma
    kamera.position.y += Math.sin(z * 0.7) * 0.015;
    if (sarsinti > 0) {
      kamera.position.x += (rnd() - 0.5) * sarsinti;
      kamera.position.y += (rnd() - 0.5) * sarsinti;
      sarsinti = Math.max(0, sarsinti - dt * 0.5);
    }
    kamera.lookAt(bakis.hedef);
    renderer.render(sahne, kamera);
  }

  return {
    SUTUN,
    baslat, sifirla, odakla, genelBakis, vur, yilanCikar, bosCikar, parcaKaldir, dondur,
    isaretle(i, renk) {
      const v = vazolar[i];
      v.isaret.visible = !!renk;
      if (renk) v.isaret.material.color.set(renk);
    },
    isaretleriTemizle() {
      vazolar.forEach(v => (v.isaret.visible = false));
    },
    hizli(acik) { hizliMod = acik; },
    // Vazonun masadaki yeri (dönüşten sonra dizilişi kontrol etmek için)
    vazoKonumu(i) { return { x: vazolar[i].grup.position.x, z: vazolar[i].grup.position.z }; },
    tiklayinca(fn) { tiklaninca = fn; },
    uzerineGelinince(fn) { uzerineGelince = fn; },
    secilebilirlik(fn) { secilebilir = fn; },
  };
})();
