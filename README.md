# Latihan JLPT N4 — Renshuu

Aplikasi latihan soal JLPT N4 (tema Neo-Brutal): 274 soal dari 5 set ujian asli (2014, 2016, 2017, 2018, 2021).

## Struktur
- `index.html` — rangka halaman
- `gaya.css` — tampilan Neo-Brutal
- `app.js` — logika kuis (skor, SRS, statistik, simulasi, suara)
- Bank soal TIDAK ada di repo ini: soal dimuat dari Firebase Realtime Database (proyek `kas-ac289`, node `latihan_jlpt_n4`).

Fitur: mode Berurutan/Acak, progres tersimpan, pengulangan soal salah terjadwal (SRS 1/3/7 hari), target 10 soal/hari + streak, latihan kategori lemah, simulasi ujian berwaktu, tombol dengar (TTS).
Progres & statistik tersimpan lokal di peramban (localStorage).
