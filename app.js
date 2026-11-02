"use strict";
const firebaseConfig = {
  apiKey: "AIzaSyAiMAg6_CsXal5g_EXLbgoQ35VIboSRJ4A",
  authDomain: "kas-ac289.firebaseapp.com",
  databaseURL: "https://kas-ac289-default-rtdb.firebaseio.com",
  projectId: "kas-ac289",
  storageBucket: "kas-ac289.firebasestorage.app",
  messagingSenderId: "341907599331",
  appId: "1:341907599331:web:35f1d7e63014899a4abad6"
};
firebase.initializeApp(firebaseConfig);
let BANK = {};
const TAHUN = {1:"2014", 2:"2016", 3:"2017", 4:"2021", 5:"2018"};
const HURUF = ["A","B","C","D","E","F"];
const TARGET_HARIAN = 10;
const DETIK_PER_SOAL_SIMULASI = 60;
const JEDA_SRS = [1, 3, 7]; // hari: salah → +1; benar ke-1 → +3; benar ke-2 → +7; benar ke-3 → tuntas

// ID soal dipasang setelah data tiba dari Firebase (lihat muatSoal).

let sesi = null;
let pewaktu = null;

function $(id){ return document.getElementById(id); }
function acak(arr){
  const a = arr.slice();
  for(let i=a.length-1;i>0;i--){ const j = Math.floor(Math.random()*(i+1)); [a[i],a[j]]=[a[j],a[i]]; }
  return a;
}
function namaTipe(t){ return t.replace(/-/g," · "); }
function awalanTipe(t){ return t.split("-")[0]; } // Hiragana | Kanji | Kosakata | Grammar — kunci warna kategori
function tampil(id){
  ["layar-muat","layar-menu","layar-kuis","layar-hasil"].forEach(x => $(x).classList.toggle("tersembunyi", x !== id));
  window.scrollTo({top:0});
}
function kunciHari(d){
  const x = d || new Date();
  return x.getFullYear() + "-" + String(x.getMonth()+1).padStart(2,"0") + "-" + String(x.getDate()).padStart(2,"0");
}
function tambahHari(strHari, n){
  const d = new Date(strHari + "T00:00:00");
  d.setDate(d.getDate() + n);
  return kunciHari(d);
}
function bacaJSON(kunci, bawaan){
  try { const v = localStorage.getItem(kunci); return v ? JSON.parse(v) : bawaan; }
  catch(e){ return bawaan; }
}
function tulisJSON(kunci, nilai){
  try { localStorage.setItem(kunci, JSON.stringify(nilai)); } catch(e){}
}

/* ---------- Statistik & streak ---------- */
function catatStatistik(q, benar){
  const st = bacaJSON("n4r_stat", { perTipe:{}, perHari:{} });
  st.perTipe[q.type] = st.perTipe[q.type] || { b:0, t:0 };
  st.perTipe[q.type].t++; if (benar) st.perTipe[q.type].b++;
  const h = kunciHari();
  st.perHari[h] = st.perHari[h] || { b:0, t:0 };
  st.perHari[h].t++; if (benar) st.perHari[h].b++;
  tulisJSON("n4r_stat", st);
}
function hitungStreak(perHari){
  let streak = 0;
  let d = new Date();
  if (!perHari[kunciHari(d)] || perHari[kunciHari(d)].t === 0) d.setDate(d.getDate() - 1);
  while (perHari[kunciHari(d)] && perHari[kunciHari(d)].t > 0) { streak++; d.setDate(d.getDate() - 1); }
  return streak;
}

/* ---------- SRS (pengulangan terjadwal) ---------- */
function catatSRS(q, benar){
  const srs = bacaJSON("n4r_srs", {});
  const entri = srs[q.id];
  if (!benar){
    srs[q.id] = { tahap: 0, jatuh: tambahHari(kunciHari(), JEDA_SRS[0]) };
  } else if (entri){
    if (entri.tahap >= 2) delete srs[q.id]; // benar ketiga beruntun di ulasan → tuntas
    else srs[q.id] = { tahap: entri.tahap + 1, jatuh: tambahHari(kunciHari(), JEDA_SRS[entri.tahap + 1]) };
  }
  tulisJSON("n4r_srs", srs);
}
function soalJatuhTempo(){
  const srs = bacaJSON("n4r_srs", {});
  const hariIni = kunciHari();
  const hasil = [];
  Object.keys(BANK).forEach(n => BANK[n].forEach(q => {
    const e = srs[q.id];
    if (e && e.jatuh <= hariIni) hasil.push(q);
  }));
  return hasil;
}

/* ---------- Menu ---------- */
function bangunMenu(){
  const st = bacaJSON("n4r_stat", { perTipe:{}, perHari:{} });
  const hariIni = st.perHari[kunciHari()] || { b:0, t:0 };
  $("target-teks").textContent = Math.min(hariIni.t, TARGET_HARIAN) + " / " + TARGET_HARIAN + " soal" + (hariIni.t >= TARGET_HARIAN ? " — target tercapai!" : "");
  $("target-rel").style.width = Math.min(100, hariIni.t / TARGET_HARIAN * 100) + "%";
  $("ubin-streak").textContent = hitungStreak(st.perHari);
  let totB = 0, totT = 0;
  Object.values(st.perTipe).forEach(v => { totB += v.b; totT += v.t; });
  $("ubin-total").textContent = totT;
  $("ubin-akurasi").textContent = totT ? Math.round(totB / totT * 100) + "%" : "–";

  const simpanan = bacaJSON("n4r_sesi", null);
  if (simpanan && simpanan.daftar && simpanan.indeks < simpanan.daftar.length){
    $("panel-lanjut").classList.remove("tersembunyi");
    $("lanjut-teks").textContent = simpanan.judul + " · berhenti di soal " + (simpanan.indeks + 1) + " dari " + simpanan.daftar.length;
  } else $("panel-lanjut").classList.add("tersembunyi");

  const tempo = soalJatuhTempo();
  if (tempo.length){
    $("panel-srs").classList.remove("tersembunyi");
    $("srs-teks").textContent = tempo.length + " soal yang pernah salah sudah jatuh tempo untuk diulang hari ini.";
  } else $("panel-srs").classList.add("tersembunyi");

  const lemah = kategoriTerlemah(st.perTipe);
  if (lemah){
    $("panel-lemah").classList.remove("tersembunyi");
    $("lemah-teks").textContent = "Kategorimu terlemah saat ini: " + namaTipe(lemah.tipe) + " (" + Math.round(lemah.b / lemah.t * 100) + "% benar dari " + lemah.t + " soal). Racik 15 soal khusus kategori ini dari semua set.";
  } else $("panel-lemah").classList.add("tersembunyi");

  const wadah = $("daftar-latihan");
  wadah.innerHTML = "";
  Object.keys(BANK).forEach(n => {
    const soal = BANK[n];
    const perTipe = {};
    soal.forEach(q => perTipe[q.type] = (perTipe[q.type]||0)+1);
    const terbaik = localStorage.getItem("n4r_terbaik_" + n);
    const kartu = document.createElement("div");
    kartu.className = "kartu-latihan";
    kartu.innerHTML =
      '<div class="nomor-besar">' + n + '</div>' +
      '<div class="isi-latihan">' +
        '<h2>Latihan ' + n + '</h2>' +
        '<div class="meta">Soal Ujian Tahun ' + TAHUN[n] + ' · ' + soal.length + ' soal</div>' +
        '<div class="chip-baris">' +
          Object.keys(perTipe).map(t => '<span class="chip kat-' + awalanTipe(t) + '"><span class="titik"></span>' + namaTipe(t) + ' <b>' + perTipe[t] + '</b></span>').join("") +
        '</div>' +
        (terbaik !== null ? '<div class="terbaik">Skor terbaik: <span class="lencana">' + terbaik + '%</span></div>' : '') +
        '<div class="tombol-baris">' +
          '<button class="btn btn-putih" data-urut="' + n + '">Berurutan</button>' +
          '<button class="btn" data-acak="' + n + '">Acak Soal</button>' +
        '</div>' +
        '<button class="btn btn-hitam btn-blok" data-simulasi="' + n + '">Simulasi Ujian (Berwaktu)</button>' +
      '</div>';
    wadah.appendChild(kartu);
  });
  wadah.querySelectorAll("[data-urut]").forEach(b =>
    b.addEventListener("click", () => mulaiSesi({ jenis:"latihan", latihan:Number(b.dataset.urut), sumber:BANK[b.dataset.urut], acakSoal:false })));
  wadah.querySelectorAll("[data-acak]").forEach(b =>
    b.addEventListener("click", () => mulaiSesi({ jenis:"latihan", latihan:Number(b.dataset.acak), sumber:BANK[b.dataset.acak], acakSoal:true })));
  wadah.querySelectorAll("[data-simulasi]").forEach(b =>
    b.addEventListener("click", () => mulaiSesi({ jenis:"simulasi", latihan:Number(b.dataset.simulasi), sumber:BANK[b.dataset.simulasi], acakSoal:true })));
}

function kategoriTerlemah(perTipe){
  let calon = null;
  Object.keys(perTipe).forEach(t => {
    const v = perTipe[t];
    if (v.t >= 5 && (!calon || v.b / v.t < calon.b / calon.t)) calon = { tipe:t, b:v.b, t:v.t };
  });
  return calon;
}

/* ---------- Sesi ---------- */
function judulSesi(cfg){
  if (cfg.jenis === "srs") return "Ulasan Terjadwal";
  if (cfg.jenis === "lemah") return "Latihan Kategori Lemah";
  if (cfg.jenis === "simulasi") return "Simulasi Latihan " + cfg.latihan + " (Ujian " + TAHUN[cfg.latihan] + ")";
  return "Latihan " + cfg.latihan + " (Ujian " + TAHUN[cfg.latihan] + ")";
}
function mulaiSesi(cfg){
  const sumber = cfg.acakSoal ? acak(cfg.sumber) : cfg.sumber.slice();
  const daftar = sumber.map(q => ({
    id: q.id, type: q.type, question: q.question, explanation: q.explanation,
    correctAnswer: q.correctAnswer, options: acak(q.options)
  }));
  sesi = {
    jenis: cfg.jenis, latihan: cfg.latihan || null, mode: cfg.acakSoal ? "acak" : "urut",
    judul: judulSesi(cfg), sumber: cfg.sumber, daftar,
    indeks: 0, benar: 0, salah: 0, riwayat: [],
    tenggat: cfg.jenis === "simulasi" ? Date.now() + daftar.length * DETIK_PER_SOAL_SIMULASI * 1000 : null
  };
  tampil("layar-kuis");
  mulaiPewaktu();
  gambarSoal();
  simpanSesi();
}
function simpanSesi(){
  if (!sesi || sesi.jenis === "simulasi") { localStorage.removeItem("n4r_sesi"); return; }
  tulisJSON("n4r_sesi", {
    jenis: sesi.jenis, latihan: sesi.latihan, mode: sesi.mode, judul: sesi.judul,
    daftar: sesi.daftar, indeks: sesi.indeks, benar: sesi.benar, salah: sesi.salah, riwayat: sesi.riwayat
  });
}
function hentiPewaktu(){ if (pewaktu) { clearInterval(pewaktu); pewaktu = null; } }
function mulaiPewaktu(){
  hentiPewaktu();
  const el = $("info-waktu");
  if (!sesi || !sesi.tenggat){ el.classList.add("tersembunyi"); return; }
  el.classList.remove("tersembunyi");
  const gambar = () => {
    const sisa = Math.max(0, Math.round((sesi.tenggat - Date.now()) / 1000));
    el.textContent = String(Math.floor(sisa / 60)).padStart(2,"0") + ":" + String(sisa % 60).padStart(2,"0");
    if (sisa <= 0){ hentiPewaktu(); alert("Waktu habis! Hasil dihitung dari jawaban yang sudah masuk."); gambarHasil(); }
  };
  gambar();
  pewaktu = setInterval(gambar, 500);
}

function gambarSoal(){
  const q = sesi.daftar[sesi.indeks];
  const simulasi = sesi.jenis === "simulasi";
  $("info-soal").textContent = "Soal " + (sesi.indeks+1) + " / " + sesi.daftar.length;
  $("skor-mini").style.display = simulasi ? "none" : "";
  $("skor-benar").textContent = sesi.benar;
  $("skor-salah").textContent = sesi.salah;
  $("bilah-progres").style.width = (sesi.indeks / sesi.daftar.length * 100) + "%";
  $("tipe-soal").textContent = namaTipe(q.type).toUpperCase();
  $("tipe-soal").className = "tipe kat-" + awalanTipe(q.type);
  $("mode-soal").textContent = sesi.jenis === "srs" ? "ULASAN SRS" :
    sesi.jenis === "lemah" ? "KATEGORI LEMAH" :
    sesi.jenis === "simulasi" ? "SIMULASI" : (sesi.mode === "acak" ? "ACAK" : "BERURUTAN");
  const teks = $("teks-soal");
  teks.innerHTML = q.question;
  teks.classList.toggle("panjang", q.question.replace(/<[^>]*>/g,"").length > 190);
  const wadah = $("wadah-opsi");
  wadah.innerHTML = "";
  q.options.forEach((opsi, i) => {
    const b = document.createElement("button");
    b.className = "opsi";
    b.innerHTML = '<span class="huruf">' + HURUF[i] + '</span><span>' + opsi + '</span>';
    b.addEventListener("click", () => jawab(b, q, opsi));
    wadah.appendChild(b);
  });
  $("kartu-bahas").classList.add("tersembunyi");
  $("btn-lanjut").classList.add("tersembunyi");
  if (window.speechSynthesis) window.speechSynthesis.cancel();
}

function jawab(tombol, q, dipilih){
  const benar = dipilih === q.correctAnswer;
  if (benar) sesi.benar++; else sesi.salah++;
  sesi.riwayat.push({ soal: q, dipilih, benar });
  catatStatistik(q, benar);
  catatSRS(q, benar);
  const simulasi = sesi.jenis === "simulasi";
  $("skor-benar").textContent = sesi.benar;
  $("skor-salah").textContent = sesi.salah;
  document.querySelectorAll(".opsi").forEach(b => {
    b.disabled = true;
    const teksOpsi = b.querySelector("span:last-child").textContent;
    if (simulasi){ if (b === tombol) b.classList.add("tercatat"); else b.classList.add("redup"); }
    else if (teksOpsi === q.correctAnswer) b.classList.add("benar");
    else if (b === tombol) b.classList.add("salah");
    else b.classList.add("redup");
  });
  if (!simulasi){
    $("label-bahas").textContent = benar ? "✓ BENAR!" : "✗ BELUM TEPAT — jawaban benar: " + q.correctAnswer;
    $("isi-bahas").innerHTML = q.explanation;
    $("kartu-bahas").classList.remove("tersembunyi");
    $("kartu-bahas").scrollIntoView({behavior:"smooth", block:"nearest"});
  }
  const lanjut = $("btn-lanjut");
  lanjut.textContent = sesi.indeks === sesi.daftar.length - 1 ? "Lihat Hasil →" : "Soal Berikutnya →";
  lanjut.classList.remove("tersembunyi");
  simpanSesi();
}

$("btn-lanjut").addEventListener("click", () => {
  if (sesi.indeks < sesi.daftar.length - 1) { sesi.indeks++; gambarSoal(); simpanSesi(); }
  else gambarHasil();
});
$("btn-menu-kuis").addEventListener("click", () => {
  if (sesi && sesi.jenis !== "simulasi" && sesi.riwayat.length < sesi.daftar.length &&
      !confirm("Keluar ke menu? Sesi ini tersimpan dan bisa dilanjutkan kapan saja.")) return;
  if (sesi && sesi.jenis === "simulasi" && !confirm("Keluar dari simulasi? Sesi simulasi tidak disimpan.")) return;
  hentiPewaktu();
  sesi = null;
  bangunMenu();
  tampil("layar-menu");
});
$("btn-dengar").addEventListener("click", () => {
  if (!window.speechSynthesis){ alert("Peramban ini tidak mendukung suara."); return; }
  const q = sesi.daftar[sesi.indeks];
  const teks = q.question.replace(/<[^>]*>/g, " ").replace(/\s+/g, " ").trim();
  window.speechSynthesis.cancel();
  const u = new SpeechSynthesisUtterance(teks);
  u.lang = "ja-JP";
  u.rate = 0.92;
  const suara = window.speechSynthesis.getVoices().find(v => v.lang && v.lang.toLowerCase().startsWith("ja"));
  if (suara) u.voice = suara;
  window.speechSynthesis.speak(u);
});
$("btn-lanjutkan").addEventListener("click", () => {
  const simpanan = bacaJSON("n4r_sesi", null);
  if (!simpanan) return;
  const semua = {};
  Object.keys(BANK).forEach(n => BANK[n].forEach(q => semua[q.id] = q));
  sesi = {
    jenis: simpanan.jenis, latihan: simpanan.latihan, mode: simpanan.mode, judul: simpanan.judul,
    sumber: (simpanan.daftar || []).map(d => semua[d.id]).filter(Boolean),
    daftar: simpanan.daftar, indeks: simpanan.indeks, benar: simpanan.benar, salah: simpanan.salah,
    riwayat: simpanan.riwayat, tenggat: null
  };
  tampil("layar-kuis");
  gambarSoal();
});
$("btn-buang-sesi").addEventListener("click", () => {
  if (confirm("Buang sesi yang tersimpan?")) { localStorage.removeItem("n4r_sesi"); bangunMenu(); }
});
$("btn-srs").addEventListener("click", () => {
  const tempo = soalJatuhTempo();
  if (tempo.length) mulaiSesi({ jenis:"srs", sumber: tempo, acakSoal:true });
});
$("btn-lemah").addEventListener("click", () => {
  const st = bacaJSON("n4r_stat", { perTipe:{} });
  const lemah = kategoriTerlemah(st.perTipe || {});
  if (!lemah) return;
  const kumpulan = [];
  Object.keys(BANK).forEach(n => BANK[n].forEach(q => { if (q.type === lemah.tipe) kumpulan.push(q); }));
  mulaiSesi({ jenis:"lemah", sumber: acak(kumpulan).slice(0, 15), acakSoal:false });
});

/* ---------- Hasil ---------- */
function gambarHasil(){
  hentiPewaktu();
  localStorage.removeItem("n4r_sesi");
  const total = sesi.daftar.length;
  const persen = Math.round(sesi.benar / total * 100);
  $("bilah-progres").style.width = "100%";
  if (sesi.jenis === "latihan" && sesi.latihan){
    const kunci = "n4r_terbaik_" + sesi.latihan;
    const lama = Number(localStorage.getItem(kunci) || -1);
    if (persen > lama) localStorage.setItem(kunci, String(persen));
  }
  $("hasil-persen").textContent = persen + "%";
  $("hasil-rincian").textContent = "Benar " + sesi.benar + " dari " + total + " soal · " + sesi.judul +
    (sesi.jenis === "latihan" ? " · Mode " + (sesi.mode === "acak" ? "Acak" : "Berurutan") : "");
  $("hasil-pesan").textContent =
    persen >= 90 ? "Sugoi! Sudah sangat siap untuk N4." :
    persen >= 75 ? "Kerja bagus! Sedikit lagi menuju sempurna." :
    persen >= 60 ? "Lumayan! Ulas soal yang salah, lalu coba lagi." :
    persen >= 40 ? "Terus berlatih — ulasan di bawah adalah kuncinya." :
                   "Tidak apa-apa, semua mulai dari sini. Pelajari ulasannya ya.";
  const perTipe = {};
  sesi.riwayat.forEach(r => {
    perTipe[r.soal.type] = perTipe[r.soal.type] || { b:0, t:0 };
    perTipe[r.soal.type].t++;
    if (r.benar) perTipe[r.soal.type].b++;
  });
  $("hasil-kategori").innerHTML = Object.keys(perTipe).map(t => {
    const v = perTipe[t], p = Math.round(v.b / v.t * 100);
    return '<div class="baris-kat"><span class="nama">' + namaTipe(t) + '</span>' +
      '<span class="rel kat-' + awalanTipe(t) + '"><span class="isi-rel" style="display:block;width:' + p + '%"></span></span>' +
      '<span class="angka">' + v.b + '/' + v.t + '</span></div>';
  }).join("");
  const salahSaja = sesi.riwayat.filter(r => !r.benar);
  $("jumlah-salah").textContent = salahSaja.length;
  $("wadah-ulasan").style.display = salahSaja.length ? "" : "none";
  $("btn-ulangi-salah").style.display = salahSaja.length ? "" : "none";
  $("daftar-ulasan").innerHTML = salahSaja.map(r =>
    '<div class="ulasan"><div class="t jp">' + r.soal.question + '</div>' +
    '<div class="jwb">Jawabanmu: <span class="s jp">' + r.dipilih + '</span></div>' +
    '<div class="jwb">Jawaban benar: <span class="b jp">' + r.soal.correctAnswer + '</span></div>' +
    '<div class="bahas">' + r.soal.explanation + '</div></div>'
  ).join("");
  tampil("layar-hasil");
}

$("btn-ulangi").addEventListener("click", () => {
  mulaiSesi({ jenis: sesi.jenis, latihan: sesi.latihan, sumber: sesi.sumber, acakSoal: sesi.mode === "acak" });
});
$("btn-ulangi-salah").addEventListener("click", () => {
  const jenis = sesi.jenis, latihan = sesi.latihan, modeAcak = sesi.mode === "acak";
  const daftar = sesi.riwayat.filter(r => !r.benar).map(r => {
    const semua = {};
    Object.keys(BANK).forEach(n => BANK[n].forEach(q => semua[q.id] = q));
    return semua[r.soal.id];
  }).filter(Boolean);
  mulaiSesi({ jenis, latihan, sumber: daftar, acakSoal: modeAcak });
});
$("btn-menu-hasil").addEventListener("click", () => { sesi = null; bangunMenu(); tampil("layar-menu"); });

/* ---------- Mode malam / terang ---------- */
function pasangTema(m){
  document.documentElement.dataset.tema = m;
  try { localStorage.setItem("n4r_tema", m); } catch(e){}
}
document.querySelectorAll(".btn-tema").forEach(b => b.addEventListener("click", () => {
  pasangTema(document.documentElement.dataset.tema === "gelap" ? "terang" : "gelap");
}));

/* ---------- Mulai: ambil soal dari Firebase ---------- */
function muatSoal(){
  tampil("layar-muat");
  firebase.database().ref("latihan_jlpt_n4").once("value").then(snap => {
    const mentah = snap.val();
    if (!mentah) throw new Error("data kosong");
    BANK = {};
    [1,2,3,4,5].forEach(n => { BANK[n] = mentah[n] || []; });
    Object.keys(BANK).forEach(n => BANK[n].forEach((q, i) => { q.id = "L" + n + "Q" + i; }));
    bangunMenu();
    tampil("layar-menu");
    const param = new URLSearchParams(location.search).get("mulai");
    if (param && BANK[param]) mulaiSesi({ jenis:"latihan", latihan:Number(param), sumber:BANK[param], acakSoal:false });
  }).catch(err => {
    $("muat-teks").textContent = "Gagal mengambil soal dari Firebase. Periksa koneksi internetmu, lalu coba lagi.";
    $("btn-muat-ulang").classList.remove("tersembunyi");
    console.error(err);
  });
}
$("btn-muat-ulang").addEventListener("click", () => location.reload());
muatSoal();
