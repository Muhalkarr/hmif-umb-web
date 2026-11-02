/* ==========================================================================
   HMIF UNIVERSITAS MAYASARI BAKTI - PRTS CENTRAL DATA REPOSITORY
   ========================================================================== */

export const HMIF_DATA = {
  identity: {
    name: 'Himpunan Mahasiswa Informatika',
    abbreviation: 'HMIF UMB',
    university: 'Universitas Mayasari Bakti',
    faculty: 'Fakultas Teknik dan Ilmu Komputer (FTIK)',
    established: '2018',
    location: 'Kota Tasikmalaya, Jawa Barat',
    tagline: 'Logic with Integrity, Vanguard of Innovation',
    logo: '/assets/hmif_umb_logo.jpg',
    prtsCode: 'PRTS-HMIF-SEC04 // UMB',
    clearanceLevel: 'LEVEL 4 PRIVILEGED',
    activeCadets: '185+',
    divisionsCount: 5,
    prokerCount: 14,
    complianceRate: '100%'
  },

  visionMission: {
    vision: 'Terwujudnya Himpunan Mahasiswa Informatika Universitas Mayasari Bakti sebagai wadah kolaboratif yang adaptif, unggul dalam penguasaan sains data dan teknologi komputasi cerdas, berintegritas tinggi, serta berjiwa kepemimpinan yang berlandaskan Tridharma Perguruan Tinggi dan AD/ART organisasi.',
    mission: [
      'Menyelenggarakan ekosistem riset, pelatihan, dan inovasi teknologi informasi yang aplikatif bagi kemajuan sivitas akademika dan masyarakat umum.',
      'Membangun kultur kaderisasi yang kokoh, inklusif, beretika moral, dan berkarakter kepemimpinan yang berakar kuat pada AD/ART dan GBHO HMIF UMB.',
      'Memperluas jejaring strategis dan sinergi kolaboratif dengan lembaga kemahasiswaan internal kampus, alumni, serta industri teknologi regional dan nasional.',
      'Mewadahi, mengawal, dan memperjuangkan aspirasi mahasiswa Informatika Universitas Mayasari Bakti secara transparan, solutif, dan profesional.'
    ],
    sambutanKahim: {
      leaderName: 'Arkan Raihan Pratama',
      role: 'Ketua Himpunan (Kahim)',
      period: 'Periode 2026 / 2027',
      operatorCode: 'VANGUARD-01 // FALCON',
      quote: 'Di era transformasi digital yang bergerak secepat kilat, mahasiswa Informatika bukan sekadar penonton algoritma, melainkan arsitek peradaban teknologi. Melalui HMIF UMB, setiap kader ditempa menjadi pribadi yang berintegritas moral, tajam dalam berpikir komputasional, dan tangguh dalam mengemban amanah Tridharma Perguruan Tinggi. Selamat datang di portal resmi PRTS HMIF UMB.'
    }
  },

  operators: [
    {
      id: 'kahim',
      name: 'Arkan Raihan Pratama',
      codeName: 'FALCON',
      role: 'Ketua Himpunan (Kahim)',
      division: 'BPH',
      rarity: 6,
      operatorClass: 'VANGUARD / LEADER',
      avatar: '/assets/silhouette_male.jpg',
      nim: '22040101',
      generation: '2022',
      specialty: 'Systems Leadership & Strategic AI Architecture',
      stats: {
        leadership: 96,
        coding: 88,
        strategy: 92,
        integrity: 95
      },
      quote: 'Integritas kode mencerminkan martabat sang pembuatnya.'
    },
    {
      id: 'wakahim',
      name: 'Dimas Aditya Saputra',
      codeName: 'AEGIS',
      role: 'Wakil Ketua Himpunan',
      division: 'BPH',
      rarity: 6,
      operatorClass: 'GUARD / COORDINATOR',
      avatar: '/assets/silhouette_male.jpg',
      nim: '22040115',
      generation: '2022',
      specialty: 'Internal Governance, Conflict Resolution & CyberSec',
      stats: {
        leadership: 90,
        coding: 85,
        strategy: 89,
        integrity: 94
      },
      quote: 'Pertahanan organisasi terkuat adalah soliditas antar-kader.'
    },
    {
      id: 'sekum',
      name: 'Nadia Putri Maharani',
      codeName: 'SCRIBE',
      role: 'Sekretaris Umum',
      division: 'BPH',
      rarity: 5,
      operatorClass: 'SPECIALIST / ARCHIVIST',
      avatar: '/assets/silhouette_female.jpg',
      nim: '23040108',
      generation: '2023',
      specialty: 'Executive Administration & Constitutional Database',
      stats: {
        leadership: 84,
        coding: 78,
        strategy: 90,
        integrity: 96
      },
      quote: 'Tertib administrasi adalah pondasi keteraturan konstitusional.'
    },
    {
      id: 'bendum',
      name: 'Rifka Nur Syifa',
      codeName: 'TREASURY',
      role: 'Bendahara Umum',
      division: 'BPH',
      rarity: 5,
      operatorClass: 'MEDIC / RESOURCE ALLOCATOR',
      avatar: '/assets/silhouette_female.jpg',
      nim: '23040122',
      generation: '2023',
      specialty: 'Financial Logistics, Auditing & Transparent Budgeting',
      stats: {
        leadership: 82,
        coding: 75,
        strategy: 94,
        integrity: 98
      },
      quote: 'Transparansi sumber daya adalah wujud amanah tertinggi.'
    },
    {
      id: 'kadiv_litbang',
      name: 'Fauzan Akbar Rabbani',
      codeName: 'CIPHER',
      role: 'Kepala Divisi Litbang',
      division: 'Litbang',
      rarity: 5,
      operatorClass: 'CASTER / SOFTWARE ARCHITECT',
      avatar: '/assets/silhouette_male.jpg',
      nim: '22040140',
      generation: '2022',
      specialty: 'Fullstack Engineering, Distributed Cloud & Machine Learning',
      stats: {
        leadership: 86,
        coding: 97,
        strategy: 88,
        integrity: 91
      },
      quote: 'Algoritma yang baik tidak hanya efisien, tetapi juga bermakna bagi sesama.'
    },
    {
      id: 'kadiv_psdm',
      name: 'Muhammad Haidar Al-Farisi',
      codeName: 'MENTOR',
      role: 'Kepala Divisi PSDM & Kaderisasi',
      division: 'PSDM',
      rarity: 5,
      operatorClass: 'SUPPORTER / CADET EDUCATOR',
      avatar: '/assets/silhouette_male.jpg',
      nim: '22040133',
      generation: '2022',
      specialty: 'Human Capital Engineering, AD/ART Pedagogy & Character Building',
      stats: {
        leadership: 93,
        coding: 80,
        strategy: 91,
        integrity: 95
      },
      quote: 'Kader hari ini adalah pemimpin masa depan informatika nusantara.'
    },
    {
      id: 'kadiv_kominfo',
      name: 'Zahra Anindya Kusuma',
      codeName: 'BROADCAST',
      role: 'Kepala Divisi Kominfo',
      division: 'Kominfo',
      rarity: 5,
      operatorClass: 'SNIPER / EXTERNAL COMMUNICATOR',
      avatar: '/assets/silhouette_female.jpg',
      nim: '23040150',
      generation: '2023',
      specialty: 'Creative Media Direction, Digital PR & Cyber Journalism',
      stats: {
        leadership: 85,
        coding: 82,
        strategy: 87,
        integrity: 92
      },
      quote: 'Satu narasi yang tepat dapat menginspirasi ribuan insan.'
    },
    {
      id: 'kadiv_mikat',
      name: 'Rian Bagus Perkasa',
      codeName: 'NEXUS',
      role: 'Kepala Divisi Minat & Bakat',
      division: 'Minat & Bakat',
      rarity: 5,
      operatorClass: 'STRIKER / COMPETITIVE STRATEGIST',
      avatar: '/assets/silhouette_male.jpg',
      nim: '23040165',
      generation: '2023',
      specialty: 'Competitive Programming, Esports Management & Game Dev',
      stats: {
        leadership: 88,
        coding: 89,
        strategy: 86,
        integrity: 90
      },
      quote: 'Kemenangan sejati lahir dari kedisiplinan dan sportivitas tanpa batas.'
    },
    {
      id: 'kadiv_kwu',
      name: 'Ilham Kurniawan',
      codeName: 'FORGE',
      role: 'Kepala Divisi Kewirausahaan',
      division: 'Kewirausahaan',
      rarity: 5,
      operatorClass: 'MERCHANT / TECHNOPRENEUR',
      avatar: '/assets/silhouette_male.jpg',
      nim: '23040177',
      generation: '2023',
      specialty: 'Startup Incubation, Tech Merchandising & Revenue Pipeline',
      stats: {
        leadership: 84,
        coding: 81,
        strategy: 93,
        integrity: 93
      },
      quote: 'Kemandirian finansial memperkokoh kebebasan berkarya organisasi.'
    }
  ],

  proker: [
    {
      id: 'proker-1',
      title: 'Informatics Welcome & Orientation (IN-FLOW 2026)',
      division: 'PSDM',
      category: 'Kaderisasi',
      status: 'completed',
      date: '10 - 12 Oktober 2026',
      target: '120 Mahasiswa Baru Informatika Angkatan 2026',
      desc: 'Pengenalan awal kultur akademik program studi Teknik Informatika UMB, pembagian kakak asuh, sosialisasi etika laboratorium, dan pengenalan profil himpunan.',
      kpi: 'Tingkat kehadiran 98%, pemahaman dasar tools perkuliahan.'
    },
    {
      id: 'proker-2',
      title: 'DevLab: Intensive Fullstack & Cloud Workshop',
      division: 'Litbang',
      category: 'Akademik & Riset',
      status: 'active',
      date: '24 Oktober - 15 November 2026',
      target: 'Seluruh Kader HMIF UMB & Mahasiswa Aktif',
      desc: 'Bootcamp coding akhir pekan terstruktur mencakup Git, modern web ecosystem, REST API design, dan containerization dengan Docker.',
      kpi: 'Output 25 prototype aplikasi web open-source siap hosting.'
    },
    {
      id: 'proker-3',
      title: 'Latihan Dasar Kepemimpinan Mahasiswa (LDKM) Informatika',
      division: 'PSDM',
      category: 'Kaderisasi',
      status: 'upcoming',
      date: '28 - 29 November 2026',
      target: 'Calon Pengurus & Kader Angkatan 2026',
      desc: 'Kaderisasi wajib berlandaskan AD/ART dan GBHO HMIF UMB. Menempa kepemimpinan manajerial, simulasi sidang komisi, analisis SWOT organisasi, dan ketahanan mental.',
      kpi: 'Kelulusan 100% peserta dengan predikat Kader Terlatih.'
    },
    {
      id: 'proker-4',
      title: 'Informatics Hackathon & Innovation Summit (IHIS 2026)',
      division: 'Litbang',
      category: 'Kompetisi & Inovasi',
      status: 'upcoming',
      date: '18 - 20 Desember 2026',
      target: 'Mahasiswa Informatika se-Priangan Timur',
      desc: 'Kompetisi ideasi dan perancangan solusi cerdas 48 jam bertema Smart Campus & Digital Sustainability di Universitas Mayasari Bakti.',
      kpi: '30 tim peserta, pameran poster karya, dan publikasi media.'
    },
    {
      id: 'proker-5',
      title: 'Cyber Security & AI National Tech Talkshow',
      division: 'Kominfo',
      category: 'Seminar Publik',
      status: 'upcoming',
      date: '16 Januari 2027',
      target: '300 Peserta Umum & Sivitas Akademika',
      desc: 'Diskusi panel interaktif menghadirkan praktisi industri cybersecurity dan machine learning nasional mengenai lanskap karier digital masa depan.',
      kpi: '300 peserta daring/luring, liputan pers kampus, dan relasi mitra industri.'
    },
    {
      id: 'proker-6',
      title: 'Informatics League: Competitive Gaming & Coding Battle',
      division: 'Minat & Bakat',
      category: 'Minat & Bakat',
      status: 'upcoming',
      date: '06 - 08 Februari 2027',
      target: 'Komunitas Mahasiswa FTIK UMB',
      desc: 'Turnamen internal yang menggabungkan adu cepat algoritma pemrograman (Competitive Programming) serta turnamen e-sports Mobile Legends dan Valorant.',
      kpi: '16 tim e-sport, 40 peserta coding battle, peningkatan keakraban antar-angkatan.'
    },
    {
      id: 'proker-7',
      title: 'Official Merch Drop & Tech Store HMIF',
      division: 'Kewirausahaan',
      category: 'Technopreneur',
      status: 'active',
      date: 'Sepanjang Semester',
      target: 'Sivitas Akademika UMB & Alumni',
      desc: 'Pengadaan atribut resmi himpunan (jaket himpunan/PDH, kaos tactical, lencana bordir, stiker die-cut, dan jasa instalasi software berlisensi edukasi).',
      kpi: 'Pendanaan mandiri organisasi 15% dari omset penjualan.'
    },
    {
      id: 'proker-8',
      title: 'Musyawarah Besar (MUBES) & LPJ Kepengurusan HMIF',
      division: 'BPH',
      category: 'Permusyawaratan',
      status: 'upcoming',
      date: '20 - 22 Maret 2027',
      target: 'Seluruh Anggota Biasa & Kader HMIF UMB',
      desc: 'Forum tertinggi mahasiswa informatika UMB untuk mengevaluasi laporan pertanggungjawaban BPH, mengamandemen AD/ART, merumuskan GBHO baru, dan suksesi ketua himpunan.',
      kpi: 'Korum sidang terpenuhi, LPJ diterima, regenerasi kepemimpinan mulus.'
    }
  ],

  // Integrated Academic & Department Calendar for UMB
  calendarSchedule: [
    {
      date: '2026-09-15',
      day: 15,
      month: 9,
      year: 2026,
      title: 'Awal Periode KRS Semester Ganjil 2026/2027',
      type: 'academic',
      division: 'Akademik Kampus',
      location: 'Portal SIAKAD UMB',
      desc: 'Pengisian rencana studi online bagi seluruh mahasiswa Teknik Informatika.',
      integratedWith: 'BPH (Bimbingan Konsultasi KRS Maba)'
    },
    {
      date: '2026-09-22',
      day: 22,
      month: 9,
      year: 2026,
      title: 'Kuliah Perdana Semester Ganjil 2026/2027',
      type: 'academic',
      division: 'Akademik Kampus',
      location: 'Gedung Rektorat & FTIK UMB',
      desc: 'Hari pertama perkuliahan tatap muka dan praktikum laboratorium.',
      integratedWith: 'Litbang (Pengecekan Kesiapan Lab Komputer)'
    },
    {
      date: '2026-10-10',
      day: 10,
      month: 10,
      year: 2026,
      title: 'IN-FLOW 2026: Welcoming Maba Informatika',
      type: 'psdm',
      division: 'PSDM',
      location: 'Aula Utama Universitas Mayasari Bakti',
      desc: 'Pengenalan kultur prodi dan kaderisasi awal mahasiswa baru angkatan 2026.',
      integratedWith: 'Akademik UMB (Masa Bimbingan Mahasiswa)'
    },
    {
      date: '2026-10-24',
      day: 24,
      month: 10,
      year: 2026,
      title: 'Kick-off DevLab Weekend Coding Workshop',
      type: 'litbang',
      division: 'Litbang',
      location: 'Lab Komputasi Cerdas Gedung B',
      desc: 'Sesi perdana pelatihan Fullstack Web & Git Version Control.',
      integratedWith: 'Akademik (Pengayaan Praktikum Pemrograman Web)'
    },
    {
      date: '2026-11-09',
      day: 9,
      month: 11,
      year: 2026,
      title: 'Pekan Ujian Tengah Semester (UTS) Ganjil',
      type: 'academic',
      division: 'Akademik Kampus',
      location: 'Seluruh Ruang Kuliah FTIK',
      desc: 'Evaluasi tengah semester mata kuliah teori dan praktikum.',
      integratedWith: 'BPH (Sterilisasi Kegiatan Organisasi Masa Ujian)'
    },
    {
      date: '2026-11-28',
      day: 28,
      month: 11,
      year: 2026,
      title: 'Latihan Dasar Kepemimpinan Mahasiswa (LDKM)',
      type: 'psdm',
      division: 'PSDM',
      location: 'Bumi Perkemahan / Villa Konstitusi UMB',
      desc: 'Kaderisasi formal landasan AD/ART & GBHO bagi kader baru.',
      integratedWith: 'BPH & Dosen Pembina Kemahasiswaan'
    },
    {
      date: '2026-12-18',
      day: 18,
      month: 12,
      year: 2026,
      title: 'Informatics Hackathon 48-Hour Challenge',
      type: 'litbang',
      division: 'Litbang',
      location: 'Hall Co-Working Space Kampus UMB',
      desc: 'Kompetisi perancangan solusi digital Smart Campus.',
      integratedWith: 'Mitra Industri & FTIK UMB'
    },
    {
      date: '2027-01-11',
      day: 11,
      month: 1,
      year: 2027,
      title: 'Ujian Akhir Semester (UAS) Ganjil',
      type: 'academic',
      division: 'Akademik Kampus',
      location: 'Kampus Universitas Mayasari Bakti',
      desc: 'Evaluasi akhir capaian pembelajaran semester ganjil.',
      integratedWith: 'BPH (Masa Tenang Organisasi)'
    },
    {
      date: '2027-01-16',
      day: 16,
      month: 1,
      year: 2027,
      title: 'Cyber Security & AI National Tech Talkshow',
      type: 'kominfo',
      division: 'Kominfo',
      location: 'Auditorium UMB & Zoom Live',
      desc: 'Seminar nasional penutup semester ganjil.',
      integratedWith: 'Humas Kampus UMB'
    },
    {
      date: '2027-02-06',
      day: 6,
      month: 2,
      year: 2027,
      title: 'Informatics League & Esports Championship',
      type: 'mikat',
      division: 'Minat & Bakat',
      location: 'Gedung Olahraga & Lab FTIK',
      desc: 'Ajang rekreasi dan kompetisi bakat di masa libur semester.',
      integratedWith: 'UKM Olahraga & FTIK'
    },
    {
      date: '2027-03-20',
      day: 20,
      month: 3,
      year: 2027,
      title: 'Musyawarah Besar (MUBES) HMIF UMB',
      type: 'bph',
      division: 'BPH',
      location: 'Ruang Sidang Utama FTIK UMB',
      desc: 'Sidang pleno evaluasi AD/ART, GBHO, dan pemilihan Kahim baru.',
      integratedWith: 'DPM FTIK & Dewan Penasihat Organisasi'
    }
  ],

  // Constitution & Cadre Education Doctrine
  doctrine: {
    adArt: [
      {
        bab: 'BAB I',
        title: 'NAMA, WAKTU, KEDUDUKAN & KEDAULATAN',
        pasalList: [
          {
            pasal: 'Pasal 1 (Nama & Kedudukan)',
            content: 'Organisasi ini bernama Himpunan Mahasiswa Informatika Universitas Mayasari Bakti, disingkat HMIF UMB, berkedudukan di lingkungan Program Studi Teknik Informatika, Fakultas Teknik dan Ilmu Komputer Universitas Mayasari Bakti, Kota Tasikmalaya.'
          },
          {
            pasal: 'Pasal 2 (Waktu Didirikan)',
            content: 'HMIF UMB didirikan di Tasikmalaya untuk jangka waktu yang tidak ditentukan dan berstatus sebagai lembaga eksekutif kemahasiswaan tingkat program studi.'
          },
          {
            pasal: 'Pasal 3 (Kedaulatan)',
            content: 'Kedaulatan tertinggi organisasi berada di tangan seluruh anggota biasa yang diwujudkan melalui mekanisme Musyawarah Besar (MUBES) HMIF UMB.'
          }
        ]
      },
      {
        bab: 'BAB II',
        title: 'ASAS, LANDASAN & SIFAT ORGANISASI',
        pasalList: [
          {
            pasal: 'Pasal 4 (Asas & Landasan)',
            content: 'HMIF UMB berazaskan Pancasila dan berlandaskan pada Undang-Undang Dasar Negara Republik Indonesia 1945, Tridharma Perguruan Tinggi, serta Statuta Universitas Mayasari Bakti.'
          },
          {
            pasal: 'Pasal 5 (Sifat)',
            content: 'HMIF UMB bersifat independen, demokratis, kekeluargaan, egaliter, akademis, dan profesional yang menjunjung tinggi kebenaran ilmiah dan kode etik moral kemahasiswaan.'
          }
        ]
      },
      {
        bab: 'BAB III',
        title: 'STATUS, HAK & KEWAJIBAN ANGGOTA / KADER',
        pasalList: [
          {
            pasal: 'Pasal 6 (Jenjang Keanggotaan)',
            content: 'Keanggotaan HMIF UMB terdiri atas: (1) Anggota Muda: Mahasiswa aktif Informatika yang belum menyelesaikan seluruh tahapan kaderisasi formal. (2) Anggota Biasa: Mahasiswa aktif yang telah dinyatakan lulus LDKM dan inisiasi kaderisasi. (3) Anggota Luar Biasa / Kehormatan: Alumni pengurus dan pihak yang berjasa luar biasa bagi organisasi.'
          },
          {
            pasal: 'Pasal 7 (Hak Anggota)',
            content: 'Anggota Muda berhak memperoleh advokasi, edukasi, dan pembinaan. Anggota Biasa memiliki hak bicara, hak memilih dan dipilih dalam permusyawaratan, serta hak mengajukan usulan pembaruan kebijakan himpunan.'
          },
          {
            pasal: 'Pasal 8 (Kewajiban Kader)',
            content: 'Setiap kader wajib: (1) Menjunjung tinggi nama baik almamater Universitas Mayasari Bakti dan HMIF. (2) Menjaga etika, integritas, dan kejujuran akademis. (3) Mentaati AD/ART, GBHO, dan keputusan musyawarah himpunan.'
          }
        ]
      },
      {
        bab: 'BAB IV',
        title: 'GARIS-GARIS BESAR HALUAN ORGANISASI (GBHO)',
        pasalList: [
          {
            pasal: 'Pasal 9 (Fungsi & Hakikat GBHO)',
            content: 'GBHO merupakan pedoman operasional dan arah strategis himpunan dalam jangka menengah untuk memastikan keberlanjutan program kerja, regenerasi kepemimpinan, dan relevansi terhadap kemajuan teknologi informasi masa depan.'
          },
          {
            pasal: 'Pasal 10 (Pilar Haluan Program Kerja)',
            content: 'Setiap divisi wajib menyelaraskan rencana program kerja tahunan pada empat pilar: (1) Penguatan Mutu Keilmuan & Riset Coding; (2) Pengembangan Karakter & Kaderisasi Berjenjang; (3) Pelayanan Aspirasi & Kesejahteraan Mahasiswa; (4) Publikasi Citra Positif & Kemitraan Eksternal.'
          }
        ]
      },
      {
        bab: 'BAB V',
        title: 'PERMUSYAWARATAN & PENGAMBILAN KEPUTUSAN',
        pasalList: [
          {
            pasal: 'Pasal 11 (Musyawarah Besar / MUBES)',
            content: 'MUBES diadakan satu kali dalam satu periode kepengurusan untuk mengevaluasi LPJ Pengurus, membahas amandemen AD/ART & GBHO, serta menetapkan Ketua Himpunan terpilih secara jujur, adil, dan transparan.'
          },
          {
            pasal: 'Pasal 12 (Musyawarah Luar Biasa)',
            content: 'Musyawarah Luar Biasa dapat diselenggarakan jika Ketua Himpunan melanggar AD/ART atau berhalangan tetap, atas usulan minimal 2/3 dari jumlah anggota biasa yang sah.'
          }
        ]
      }
    ],

    cadetRoadmap: [
      {
        step: 1,
        title: 'Fase I: Welcoming & Orientasi Dasar (IN-FLOW)',
        desc: 'Mengenal lingkungan kampus UMB, kurikulum Informatika, etika mahasiswa, dan fondasi awal kebersamaan angkatan.'
      },
      {
        step: 2,
        title: 'Fase II: Latihan Dasar Kepemimpinan (LDKM)',
        desc: 'Pembekalan materi kepemimpinan, simulasi sidang parlementer, pemahaman konstitusi AD/ART & GBHO, serta manajemen konflik.'
      },
      {
        step: 3,
        title: 'Fase III: Inisiasi & Pengukuhan Status Kader',
        desc: 'Penyematan slayer/pin resmi HMIF UMB sebagai penanda pengesahan status Anggota Biasa dengan hak suara penuh.'
      },
      {
        step: 4,
        title: 'Fase IV: Magang & Pengabdian Divisi',
        desc: 'Praktik langsung mengelola program kerja riil di bawah bimbingan kepala divisi (Litbang, PSDM, Kominfo, Mikat, Kwu).'
      },
      {
        step: 5,
        title: 'Fase V: Suksesi & Musyawarah Besar (MUBES)',
        desc: 'Puncak regenerasi organisasi: menyusun laporan pertanggungjawaban, mengawal suksesi, dan melahirkan estafet kepemimpinan baru.'
      }
    ],

    // Interactive Quiz / Aptitude Test for Cadets
    cadetQuiz: [
      {
        id: 1,
        question: 'Apakah landasan kedaulatan tertinggi dalam organisasi HMIF Universitas Mayasari Bakti?',
        options: [
          'Keputusan sepihak Ketua Himpunan',
          'Musyawarah Besar (MUBES) yang melibatkan seluruh anggota biasa',
          'Instruksi dosen pembina kemahasiswaan',
          'Voting terbatas di media sosial himpunan'
        ],
        correctIndex: 1,
        explanation: 'Sesuai dengan AD/ART BAB I Pasal 3, kedaulatan tertinggi organisasi berada di tangan seluruh anggota biasa yang diwujudkan melalui mekanisme Musyawarah Besar (MUBES).'
      },
      {
        id: 2,
        question: 'Apa perbedaan mendasar antara Anggota Muda dan Anggota Biasa dalam HMIF UMB?',
        options: [
          'Anggota Muda hanya membayar iuran tanpa hak mengikuti kegiatan',
          'Anggota Biasa telah lulus proses kaderisasi formal (LDKM) dan memiliki hak suara untuk memilih serta dipilih',
          'Anggota Muda memiliki hak merombak struktur pengurus kapan saja',
          'Tidak ada perbedaan hak dan status antar keduanya'
        ],
        correctIndex: 1,
        explanation: 'Sesuai AD/ART BAB III Pasal 6, Anggota Biasa adalah mereka yang telah lulus kaderisasi formal sehingga berhak memilih dan dipilih dalam MUBES.'
      },
      {
        id: 3,
        question: 'Apa fungsi utama dari Garis-Garis Besar Haluan Organisasi (GBHO) bagi pengurus divisi?',
        options: [
          'Sebagai pedoman strategis jangka menengah agar seluruh program kerja terarah dan berkesinambungan',
          'Sebagai dokumen pelengkap arsip tanpa konsekuensi praktis',
          'Sebagai buku sanksi untuk menjatuhkan denda finansial',
          'Sebagai pengganti silabus mata kuliah perkuliahan'
        ],
        correctIndex: 0,
        explanation: 'GBHO berfungsi sebagai pedoman arah kebijakan dan pilar haluan program kerja agar setiap kepengurusan memiliki kesinambungan visi.'
      },
      {
        id: 4,
        question: 'Divisi manakah dalam struktur HMIF UMB yang bertanggung jawab langsung atas riset teknologi, coding workshop, dan open source software development?',
        options: [
          'Divisi Kewirausahaan',
          'Divisi Kominfo',
          'Divisi Litbang (Penelitian & Pengembangan)',
          'Divisi Minat & Bakat'
        ],
        correctIndex: 2,
        explanation: 'Divisi Litbang memegang peranan sentral dalam riset komputasi, rekayasa perangkat lunak, bootcamp coding, dan inovasi teknologi mahasiswa.'
      },
      {
        id: 5,
        question: 'Bagaimana sikap etis seorang kader mahasiswa informatika ketika menemukan celah keamanan (vulnerability) pada sistem informasi kampus?',
        options: [
          'Menyebarkannya ke publik di forum internet demi popularitas',
          'Melakukan deface dan meminta uang tebusan ke pihak universitas',
          'Melaporkannya secara bertanggung jawab (Responsible Disclosure) kepada pengelola sistem/prodi demi perbaikan',
          'Membiarkannya tanpa berbuat apa-apa'
        ],
        correctIndex: 2,
        explanation: 'Kader informatika yang berintegritas menjunjung tinggi etika white-hat: melaporkan kerentanan secara rahasia dan bertanggung jawab demi keamanan bersama.'
      }
    ]
  },

  news: [
    {
      id: 'news-1',
      title: 'Pelaksanaan Workshop Fullstack Web & Cloud Computing HMIF UMB Sukses Digelar',
      category: 'Workshop & Tech',
      date: '28 September 2026',
      thumbnail: '/assets/hmif_prts_bridge.jpg',
      author: 'Divisi Kominfo HMIF',
      excerpt: 'Lebih dari 90 mahasiswa informatika memadati auditorium kampus untuk mempelajari arsitektur microservices, containerization Docker, dan modern frontend framework.',
      content: 'Divisi Litbang HMIF Universitas Mayasari Bakti sukses menggelar workshop intensif "Fullstack Web & Cloud Computing" pada akhir pekan kemarin. Menghadirkan software engineer alumni dan mentor praktisi, peserta diajak langsung mempraktikkan live coding pembuatan sistem informasi terdistribusi dengan standard industri.'
    },
    {
      id: 'news-2',
      title: 'Delegasi Mahasiswa Informatika UMB Raih Juara 2 Hackathon Nasional',
      category: 'Prestasi Mahasiswa',
      date: '15 September 2026',
      thumbnail: '/assets/hmif_prts_bridge.jpg',
      author: 'Biro Prestasi FTIK',
      excerpt: 'Tim mahasiswa perwakilan HMIF UMB berhasil menciptakan inovasi platform pemantauan kualitas udara cerdas berbasis IoT dan machine learning.',
      content: 'Kabar membanggakan datang dari kompetisi teknologi tingkat nasional. Tim mahasiswa Teknik Informatika Universitas Mayasari Bakti yang dimentori oleh Divisi Litbang berhasil menyabet podium kedua berkat karya prototype sistem pemantau emisi berbasis neural network.'
    },
    {
      id: 'news-3',
      title: 'Sosialisasi Amandemen AD/ART & Panduan Kaderisasi Mahasiswa Baru 2026',
      category: 'Kaderisasi & Konstitusi',
      date: '02 September 2026',
      thumbnail: '/assets/hmif_umb_logo.jpg',
      author: 'Divisi PSDM HMIF',
      excerpt: 'Panduan kurikulum pengaderan baru mengintegrasikan nilai etika kepemimpinan, kepatuhan konstitusi, serta keahlian riset digital mutakhir.',
      content: 'Divisi PSDM bersama Badan Pengurus Harian resmi merilis naskah sosialisasi amandemen AD/ART dan GBHO teranyar. Pedoman ini bertujuan memastikan regenerasi kader HMIF UMB berjalan transparan, humanis, dan adaptif terhadap tantangan revolusi industri 5.0.'
    }
  ]
};
