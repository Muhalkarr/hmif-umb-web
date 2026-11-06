/* ==========================================================================
   HMIF UNIVERSITAS MAYASARI BAKTI - PRTS CENTRAL DATA REPOSITORY
   ========================================================================== */

const createDepartmentDivisions = (departmentId, duties) => [
  { id: `${departmentId}-div-1`, code: 'DIV-1', name: 'Divisi 1', description: duties[0], order: 1 },
  { id: `${departmentId}-div-2`, code: 'DIV-2', name: 'Divisi 2', description: duties[1], order: 2 }
];

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
    divisionsCount: 10,
    prokerCount: 14,
    complianceRate: '100%'
  },

  knowledgeResources: [
    {
      id: 'kb-python-tutorial',
      title: 'The Python Tutorial',
      course: 'Algoritma & Pemrograman',
      semester: '1',
      kind: 'reference',
      summary: 'Dokumentasi resmi Python tentang sintaks, struktur data, modul, dan penanganan error.',
      url: 'https://docs.python.org/3/tutorial/',
      tags: ['python', 'algoritma', 'dasar'],
      published: true
    },
    {
      id: 'kb-git-book',
      title: 'Pro Git Book',
      course: 'Tools Pengembangan',
      semester: 'Semua',
      kind: 'learning_path',
      summary: 'Buku resmi Git untuk memahami version control, branching, dan kolaborasi repositori.',
      url: 'https://git-scm.com/book/en/v2',
      tags: ['git', 'kolaborasi', 'tools'],
      published: true
    },
    {
      id: 'kb-mdn-html',
      title: 'Structuring content with HTML',
      course: 'Pemrograman Web',
      semester: '3',
      kind: 'module',
      summary: 'Panduan MDN untuk membangun struktur dokumen web yang semantik dan mudah diakses.',
      url: 'https://developer.mozilla.org/en-US/docs/Learn_web_development/Core/Structuring_content',
      tags: ['html', 'aksesibilitas', 'web'],
      published: true
    },
    {
      id: 'kb-postgresql-tutorial',
      title: 'PostgreSQL Tutorial',
      course: 'Basis Data',
      semester: '4',
      kind: 'reference',
      summary: 'Tutorial resmi PostgreSQL mulai dari konsep relasional hingga query dan fungsi SQL.',
      url: 'https://www.postgresql.org/docs/current/tutorial.html',
      tags: ['database', 'sql', 'postgresql'],
      published: true
    },
    {
      id: 'kb-tensorflow-tutorials',
      title: 'TensorFlow Tutorials',
      course: 'Kecerdasan Buatan',
      semester: '6',
      kind: 'learning_path',
      summary: 'Tutorial resmi untuk memulai machine learning dan membangun model dengan TensorFlow.',
      url: 'https://www.tensorflow.org/tutorials',
      tags: ['ai', 'machine learning', 'python'],
      published: true
    },
    {
      id: 'kb-arduino-docs',
      title: 'Arduino Documentation',
      course: 'Internet of Things',
      semester: '5',
      kind: 'reference',
      summary: 'Dokumentasi resmi board, bahasa pemrograman, library, dan ekosistem Arduino.',
      url: 'https://docs.arduino.cc/',
      tags: ['iot', 'embedded', 'mikrokontroler'],
      published: true
    }
  ],

  visionMission: {
    vision: 'Terwujudnya HMIF UMB sebagai wadah pengembangan mahasiswa informatika yang unggul dalam teknologi, profesional dalam berkarya, serta membentuk insan akademis yang bertakwa kepada Tuhan Yang Maha Esa.',
    mission: [
      'Membangun karakter mahasiswa yang berlandaskan nilai-nilai ketuhanan, moralitas, dan integritas yang tinggi.',
      'Menyelenggarakan sistem kaderisasi yang bertingkat dan berkelanjutan guna mencetak kepemimpinan yang adaptif berakar pada AD/ART dan GBHO.',
      'Mengembangkan potensi akademik dan non-akademik anggota dalam bidang Teknologi Informasi yang berdaya saing global.',
      'Mempererat rasa kekeluargaan, solidaritas, dan kepedulian sosial antar sivitas akademika serta mengawal aspirasi mahasiswa secara profesional.'
    ],
    sambutanKahim: {
      leaderName: 'Arkan Raihan Pratama',
      role: 'Ketua Himpunan (Kahim)',
      period: 'Periode 2026 / 2027',
      operatorCode: 'VANGUARD-01 // FALCON',
      quote: 'Di era transformasi digital yang bergerak secepat kilat, mahasiswa Informatika bukan sekadar penonton algoritma, melainkan arsitek peradaban teknologi. Melalui HMIF UMB, setiap kader ditempa menjadi pribadi yang berintegritas moral, tajam dalam berpikir komputasional, dan tangguh dalam mengemban amanah Tridharma Perguruan Tinggi. Selamat datang di portal resmi PRTS HMIF UMB.'
    }
  },

  departments: [
    {
      id: 'dept-litbang',
      code: 'LITBANG',
      name: 'Departemen Penelitian & Pengembangan',
      description: 'Pusat riset teknologi informasi, rekayasa perangkat lunak modern, arsitektur data cerdas, dan inovasi komputasi.',
      responsibilities: [
        'Merancang riset, prototipe, dan adopsi teknologi untuk kebutuhan organisasi dan kampus.',
        'Menjaga standar rekayasa perangkat lunak, dokumentasi, repositori, dan mutu implementasi sistem.',
        'Menyelenggarakan lokakarya dan pendampingan kompetensi teknologi bagi anggota.'
      ],
      emblem: '/assets/faction/1.png',
      kadepTitle: 'Kepala Departemen',
      sekdepTitle: 'Sekretaris Departemen',
      divisions: createDepartmentDivisions('dept-litbang', [
        'Mengembangkan aplikasi, infrastruktur digital, otomasi, dan menjaga repositori proyek HMIF.',
        'Melakukan riset teknologi, data, kecerdasan buatan, eksperimen, dan rekomendasi penerapannya.'
      ]),
      order: 1
    },
    {
      id: 'dept-psdm',
      code: 'PSDM',
      name: 'Departemen Pengembangan Sumber Daya Mahasiswa',
      description: 'Pengawal kaderisasi bertingkat, pembinaan karakter moral, kepemimpinan organisasi, dan pemahaman AD/ART & GBHO.',
      responsibilities: [
        'Merancang kurikulum kaderisasi bertahap yang berlandaskan AD/ART dan GBHO.',
        'Membina karakter, kepemimpinan, kapasitas, dan kesejahteraan anggota.',
        'Mengelola pendampingan kader, evaluasi pembelajaran, dan regenerasi pengurus.'
      ],
      emblem: '/assets/faction/2.png',
      kadepTitle: 'Kepala Departemen',
      sekdepTitle: 'Sekretaris Departemen',
      divisions: createDepartmentDivisions('dept-psdm', [
        'Menyusun materi kaderisasi, orientasi, pelatihan dasar, dan evaluasi setiap jenjang.',
        'Menjalankan mentoring, pengembangan kapasitas, apresiasi, dan pendampingan anggota.'
      ]),
      order: 2
    },
    {
      id: 'dept-kominfo',
      code: 'KOMINFO',
      name: 'Departemen Komunikasi & Informasi',
      description: 'Pusat publikasi siber, dokumentasi multimedia kreatif, penyiaran humas publik, dan transmisi warta strategis.',
      responsibilities: [
        'Mengelola komunikasi publik, identitas visual, dan publikasi resmi organisasi.',
        'Mendokumentasikan kegiatan dan menjaga arsip foto, video, serta materi komunikasi.',
        'Menyampaikan informasi organisasi secara akurat, konsisten, dan tepat waktu.'
      ],
      emblem: '/assets/faction/3.png',
      kadepTitle: 'Kepala Departemen',
      sekdepTitle: 'Sekretaris Departemen',
      divisions: createDepartmentDivisions('dept-kominfo', [
        'Merencanakan publikasi, penulisan berita, pengelolaan kanal digital, dan hubungan masyarakat.',
        'Memproduksi desain, fotografi, video, dokumentasi kegiatan, dan arsip multimedia.'
      ]),
      order: 3
    },
    {
      id: 'dept-mikat',
      code: 'MIKAT',
      name: 'Departemen Minat & Bakat',
      description: 'Eksplorasi potensi dan prestasi mahasiswa di ranah competitive programming, esports, game dev, dan karya kreatif.',
      responsibilities: [
        'Memetakan minat dan bakat anggota serta menyelenggarakan ruang pengembangan yang inklusif.',
        'Membina kompetisi teknologi, olahraga elektronik, olahraga, dan karya kreatif.',
        'Menghubungkan anggota dengan komunitas, kompetisi, dan peluang prestasi.'
      ],
      emblem: '/assets/faction/4.png',
      kadepTitle: 'Kepala Departemen',
      sekdepTitle: 'Sekretaris Departemen',
      divisions: createDepartmentDivisions('dept-mikat', [
        'Membina competitive programming, pengembangan gim, dan kompetisi teknologi.',
        'Mengelola esports, olahraga, seni, komunitas hobi, dan kegiatan apresiasi bakat.'
      ]),
      order: 4
    },
    {
      id: 'dept-kwu',
      code: 'KWU',
      name: 'Departemen Kewirausahaan',
      description: 'Inkubator technopreneurship, penguatan kemandirian finansial organisasi, dan manajemen produk/merchandise resmi.',
      responsibilities: [
        'Mengembangkan unit usaha dan produk yang relevan dengan kebutuhan sivitas akademika.',
        'Menjaga inventaris, pencatatan transaksi, dan pelaporan usaha secara akuntabel.',
        'Membangun kemitraan serta mengembangkan kemampuan kewirausahaan anggota.'
      ],
      emblem: '/assets/faction/5.png',
      kadepTitle: 'Kepala Departemen',
      sekdepTitle: 'Sekretaris Departemen',
      divisions: createDepartmentDivisions('dept-kwu', [
        'Merancang produk, layanan, promosi, dan kanal penjualan usaha HMIF.',
        'Mengelola stok, pengadaan, pencatatan arus kas, dan evaluasi kinerja usaha.'
      ]),
      order: 5
    }
  ],

  generations: [
    {
      id: 'gen-2024',
      year: '2024',
      name: 'ALGORITHM BATTALION',
      tagline: 'Precision in Algorithms, United in Execution',
      description: 'Batalion angkatan 2024 yang aktif dalam pengembangan piranti lunak, kecerdasan buatan, dan kompetisi competitive programming.',
      status: 'ACTIVE CADETS // 2ND YEAR',
      emblem: '/assets/faction/4.png',
      order: 1,
      socials: {
        instagram: 'https://instagram.com/hmif24_umb',
        tiktok: 'https://tiktok.com/@algorithm24_umb',
        whatsapp: 'https://chat.whatsapp.com/hmif2024',
        linkedin: 'https://linkedin.com/company/hmif24-umb',
        github: 'https://github.com/hmif24-umb'
      },
      leadership: {
        ketua: {
          title: 'Ketua Angkatan (Komti)',
          operatorId: '',
          name: 'Bima Arya Pratama',
          nim: '',
          avatar: '/assets/silhouette_male.jpg'
        },
        wakil: {
          title: 'Wakil Ketua Angkatan',
          operatorId: '',
          name: 'Devi Maharani',
          nim: '',
          avatar: '/assets/silhouette_female.jpg'
        },
        sekretaris: {
          title: 'Sekretaris Angkatan',
          operatorId: '',
          name: 'Nadia Utami',
          nim: '',
          avatar: '/assets/silhouette_female.jpg'
        },
        bendahara: {
          title: 'Bendahara Angkatan',
          operatorId: '',
          name: 'Kevin Sanjaya',
          nim: '',
          avatar: '/assets/silhouette_male.jpg'
        }
      },
      divisions: [
        {
          id: 'div-akademik-24',
          name: 'Divisi Akademik & Mentoring Riset',
          coordinator: 'Rian Hidayat',
          coordinatorNim: '',
          members: ['Arief Wicaksana', 'Siti Nurhaliza', 'Budi Hartono']
        },
        {
          id: 'div-humas-24',
          name: 'Divisi Humas & Multimedia Siber',
          coordinator: 'Clara Amanda',
          coordinatorNim: '',
          members: ['Tio Prakoso', 'Fadhil Akbar', 'Zaskia Rahma']
        },
        {
          id: 'div-mikat-24',
          name: 'Divisi Minat, Bakat & E-Sport',
          coordinator: 'Gilang Ramadhan',
          coordinatorNim: '',
          members: ['Randi Pangestu', 'Eka Saputra', 'Dian Prasetyo']
        }
      ]
    },
    {
      id: 'gen-2023',
      year: '2023',
      name: 'SYNTAX FLEET',
      tagline: 'Parsing Logic, Compiling Dreams',
      description: 'Batalion angkatan 2023 dengan fokus riset arsitektur jaringan, sistem operasi, rekayasa piranti lunak, dan keamanan siber.',
      status: 'SENIOR SQUAD // 3RD YEAR',
      emblem: '/assets/faction/3.png',
      order: 2,
      socials: {
        instagram: 'https://instagram.com/hmif23_umb',
        tiktok: 'https://tiktok.com/@syntax23_umb',
        whatsapp: 'https://chat.whatsapp.com/hmif2023',
        linkedin: '',
        github: 'https://github.com/hmif23-umb'
      },
      leadership: {
        ketua: {
          title: 'Ketua Angkatan (Komti)',
          operatorId: '',
          name: 'Farhan Mahendra',
          nim: '',
          avatar: '/assets/silhouette_male.jpg'
        },
        wakil: {
          title: 'Wakil Ketua Angkatan',
          operatorId: '',
          name: 'Zahra Salsabila',
          nim: '',
          avatar: '/assets/silhouette_female.jpg'
        },
        sekretaris: {
          title: 'Sekretaris Angkatan',
          operatorId: '',
          name: 'Annisa Larasati',
          nim: '',
          avatar: '/assets/silhouette_female.jpg'
        },
        bendahara: {
          title: 'Bendahara Angkatan',
          operatorId: '',
          name: 'Muhammad Rizky',
          nim: '',
          avatar: '/assets/silhouette_male.jpg'
        }
      },
      divisions: [
        {
          id: 'div-akademik-23',
          name: 'Divisi Akademik & Tutorial Sejawat',
          coordinator: 'Aditya Pratama',
          coordinatorNim: '',
          members: ['Ilham Maulana', 'Dina Safitri']
        },
        {
          id: 'div-humas-23',
          name: 'Divisi Humas & Hubungan Luar',
          coordinator: 'Maya Anggraini',
          coordinatorNim: '',
          members: ['Fikri Haikal', 'Rangga Wijaya']
        },
        {
          id: 'div-sosial-23',
          name: 'Divisi Sosial & Kekeluargaan',
          coordinator: 'Bagus Setiawan',
          coordinatorNim: '',
          members: ['Putri Ayu', 'Ghani Alfarisi']
        }
      ]
    },
    {
      id: 'gen-2025',
      year: '2025',
      name: 'BYTE PIONEER',
      tagline: 'First Byte, Infinite Possibilities',
      description: 'Batalion kader muda angkatan 2025 yang sedang menempuh tahap pembinaan dasar, adaptasi kurikulum, dan kultur kemahasiswaan.',
      status: 'FRESH CADETS // 1ST YEAR',
      emblem: '/assets/faction/1.png',
      order: 3,
      socials: {
        instagram: 'https://instagram.com/hmif25_umb',
        tiktok: 'https://tiktok.com/@byte25_umb',
        whatsapp: 'https://chat.whatsapp.com/hmif2025',
        linkedin: '',
        github: ''
      },
      leadership: {
        ketua: {
          title: 'Ketua Angkatan (Komti)',
          operatorId: '',
          name: 'Yusuf Al-Faridzi',
          nim: '',
          avatar: '/assets/silhouette_male.jpg'
        },
        wakil: {
          title: 'Wakil Ketua Angkatan',
          operatorId: '',
          name: 'Tiara Maulida',
          nim: '',
          avatar: '/assets/silhouette_female.jpg'
        },
        sekretaris: {
          title: 'Sekretaris Angkatan',
          operatorId: '',
          name: 'Riska Melani',
          nim: '',
          avatar: '/assets/silhouette_female.jpg'
        },
        bendahara: {
          title: 'Bendahara Angkatan',
          operatorId: '',
          name: 'Fathir Rahman',
          nim: '',
          avatar: '/assets/silhouette_male.jpg'
        }
      },
      divisions: [
        {
          id: 'div-study-25',
          name: 'Divisi Kelompok Belajar & Dasar Coding',
          coordinator: 'Wildan Hakim',
          coordinatorNim: '',
          members: ['Hafiz Anshori', 'Nurul Hidayah']
        },
        {
          id: 'div-silaturahmi-25',
          name: 'Divisi Silaturahmi & Komunikasi',
          coordinator: 'Sarah Az-Zahra',
          coordinatorNim: '',
          members: ['Iqbal Tawakal', 'Vina Panduwinata']
        }
      ]
    },
    {
      id: 'gen-2022',
      year: '2022',
      name: 'QUANTUM CORPS',
      tagline: 'Beyond Limits, Forging Legacy',
      description: 'Batalion tingkat akhir angkatan 2022 dalam penuntasan tugas akhir, skripsi, magang industri, dan pembimbingan adik tingkat.',
      status: 'FINAL YEAR // SKRIPSI & CAPSTONE',
      emblem: '/assets/faction/2.png',
      order: 4,
      socials: {
        instagram: 'https://instagram.com/hmif22_umb',
        tiktok: '',
        whatsapp: '',
        linkedin: 'https://linkedin.com/company/hmif22-umb',
        github: 'https://github.com/hmif22-umb'
      },
      leadership: {
        ketua: {
          title: 'Ketua Angkatan (Komti)',
          operatorId: '',
          name: 'Alif Baihaqi',
          nim: '',
          avatar: '/assets/silhouette_male.jpg'
        },
        wakil: {
          title: 'Wakil Ketua Angkatan',
          operatorId: '',
          name: 'Firdha Rahmania',
          nim: '',
          avatar: '/assets/silhouette_female.jpg'
        },
        sekretaris: {
          title: 'Sekretaris Angkatan',
          operatorId: '',
          name: 'Cindy Permata',
          nim: '',
          avatar: '/assets/silhouette_female.jpg'
        },
        bendahara: {
          title: 'Bendahara Angkatan',
          operatorId: '',
          name: 'Rendi Kurniawan',
          nim: '',
          avatar: '/assets/silhouette_male.jpg'
        }
      },
      divisions: [
        {
          id: 'div-karir-22',
          name: 'Divisi Karir, Skripsi & Jaringan Alumni',
          coordinator: 'Bayu Wicaksono',
          coordinatorNim: '',
          members: ['Rio Dewanto', 'Ratna Sari']
        }
      ]
    }
  ],

  operators: [
    {
      id: 'kahim',
      departmentId: 'bph',
      roleLevel: 'bph_leader',
      bphRoleId: 'kahim',
      name: 'Arkan Raihan Pratama',
      codeName: 'FALCON',
      role: 'Ketua Himpunan (Kahim)',
      division: 'BPH',
      rarity: 6,
      operatorClass: 'VANGUARD / LEADER',
      avatar: '/assets/silhouette_male.jpg',
      nim: '',
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
      departmentId: 'bph',
      roleLevel: 'bph_leader',
      bphRoleId: 'wakahim',
      name: 'Dimas Aditya Saputra',
      codeName: 'AEGIS',
      role: 'Wakil Ketua Himpunan',
      division: 'BPH',
      rarity: 6,
      operatorClass: 'GUARD / COORDINATOR',
      avatar: '/assets/silhouette_male.jpg',
      nim: '',
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
      departmentId: 'bph',
      roleLevel: 'bph_executive',
      bphRoleId: 'sekum',
      name: 'Nadia Putri Maharani',
      codeName: 'SCRIBE',
      role: 'Sekretaris Umum',
      division: 'BPH',
      rarity: 5,
      operatorClass: 'SPECIALIST / ARCHIVIST',
      avatar: '/assets/silhouette_female.jpg',
      nim: '',
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
      departmentId: 'bph',
      roleLevel: 'bph_executive',
      bphRoleId: 'bendum',
      name: 'Rifka Nur Syifa',
      codeName: 'TREASURY',
      role: 'Bendahara Umum',
      division: 'BPH',
      rarity: 5,
      operatorClass: 'MEDIC / RESOURCE ALLOCATOR',
      avatar: '/assets/silhouette_female.jpg',
      nim: '',
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
      departmentId: 'dept-litbang',
      roleLevel: 'kadep',
      name: 'Fauzan Akbar Rabbani',
      codeName: 'CIPHER',
      role: 'Kepala Departemen Litbang',
      division: 'Litbang',
      rarity: 5,
      operatorClass: 'CASTER / SOFTWARE ARCHITECT',
      avatar: '/assets/silhouette_male.jpg',
      nim: '',
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
      id: 'sekdep_litbang',
      departmentId: 'dept-litbang',
      roleLevel: 'sekdep',
      name: 'Siti Rahma Fauziah',
      codeName: 'LOGIC-SCRIBE',
      role: 'Sekretaris Departemen Litbang',
      division: 'Litbang',
      rarity: 5,
      operatorClass: 'SPECIALIST / TECH ARCHIVIST',
      avatar: '/assets/silhouette_female.jpg',
      nim: '',
      generation: '2023',
      specialty: 'R&D Documentation, Code Auditing & Research Administration',
      stats: {
        leadership: 83,
        coding: 86,
        strategy: 89,
        integrity: 95
      },
      quote: 'Dokumentasi riset yang rapi adalah kunci replikasi inovasi yang berkelanjutan.'
    },
    {
      id: 'staff_litbang_01',
      departmentId: 'dept-litbang',
      roleLevel: 'staff',
      name: 'Alif Ramadhan Kusuma',
      codeName: 'BYTE',
      role: 'Staff Rekayasa Perangkat Lunak',
      division: 'Litbang',
      rarity: 4,
      operatorClass: 'CASTER / FULLSTACK JUNIOR',
      avatar: '/assets/silhouette_male.jpg',
      nim: '',
      generation: '2024',
      specialty: 'Web Application Development & REST API Implementation',
      stats: {
        leadership: 75,
        coding: 88,
        strategy: 78,
        integrity: 90
      },
      quote: 'Menulis kode bersih untuk kemudahan pemeliharaan sistem masa depan.'
    },
    {
      id: 'kadiv_psdm',
      departmentId: 'dept-psdm',
      roleLevel: 'kadep',
      name: 'Muhammad Haidar Al-Farisi',
      codeName: 'MENTOR',
      role: 'Kepala Departemen PSDM & Kaderisasi',
      division: 'PSDM',
      rarity: 5,
      operatorClass: 'SUPPORTER / CADET EDUCATOR',
      avatar: '/assets/silhouette_male.jpg',
      nim: '',
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
      id: 'sekdep_psdm',
      departmentId: 'dept-psdm',
      roleLevel: 'sekdep',
      name: 'Anisa Nurul Aini',
      codeName: 'REGISTRAR',
      role: 'Sekretaris Departemen PSDM',
      division: 'PSDM',
      rarity: 5,
      operatorClass: 'SPECIALIST / CADET RECORDS',
      avatar: '/assets/silhouette_female.jpg',
      nim: '',
      generation: '2023',
      specialty: 'Cadet Database Management, Attendance Telemetry & Mubes Protocol',
      stats: {
        leadership: 85,
        coding: 76,
        strategy: 88,
        integrity: 96
      },
      quote: 'Kerapian data kaderisasi menjamin regenerasi kepemimpinan yang objektif.'
    },
    {
      id: 'kadiv_kominfo',
      departmentId: 'dept-kominfo',
      roleLevel: 'kadep',
      name: 'Zahra Anindya Kusuma',
      codeName: 'BROADCAST',
      role: 'Kepala Departemen Kominfo',
      division: 'Kominfo',
      rarity: 5,
      operatorClass: 'SNIPER / EXTERNAL COMMUNICATOR',
      avatar: '/assets/silhouette_female.jpg',
      nim: '',
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
      id: 'sekdep_kominfo',
      departmentId: 'dept-kominfo',
      roleLevel: 'sekdep',
      name: 'Dafa Arya Pratama',
      codeName: 'DISPATCH',
      role: 'Sekretaris Departemen Kominfo',
      division: 'Kominfo',
      rarity: 5,
      operatorClass: 'SPECIALIST / MEDIA DISPATCHER',
      avatar: '/assets/silhouette_male.jpg',
      nim: '',
      generation: '2023',
      specialty: 'Media Archiving, Content Scheduling & Press Release Coordination',
      stats: {
        leadership: 82,
        coding: 79,
        strategy: 86,
        integrity: 93
      },
      quote: 'Transmisi warta yang akurat membangun kepercayaan publik terhadap organisasi.'
    },
    {
      id: 'kadiv_mikat',
      departmentId: 'dept-mikat',
      roleLevel: 'kadep',
      name: 'Rian Bagus Perkasa',
      codeName: 'NEXUS',
      role: 'Kepala Departemen Minat & Bakat',
      division: 'Minat & Bakat',
      rarity: 5,
      operatorClass: 'STRIKER / COMPETITIVE STRATEGIST',
      avatar: '/assets/silhouette_male.jpg',
      nim: '',
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
      id: 'sekdep_mikat',
      departmentId: 'dept-mikat',
      roleLevel: 'sekdep',
      name: 'Tiara Salsabila',
      codeName: 'ORBIT',
      role: 'Sekretaris Departemen Minat & Bakat',
      division: 'Minat & Bakat',
      rarity: 5,
      operatorClass: 'SPECIALIST / TALENT COORDINATOR',
      avatar: '/assets/silhouette_female.jpg',
      nim: '',
      generation: '2023',
      specialty: 'Tournament Administration, Delegation Logistics & Talent Scoring',
      stats: {
        leadership: 81,
        coding: 78,
        strategy: 87,
        integrity: 94
      },
      quote: 'Setiap bakat mahasiswa berhak mendapat panggung dan dukungan maksimal.'
    },
    {
      id: 'kadiv_kwu',
      departmentId: 'dept-kwu',
      roleLevel: 'kadep',
      name: 'Ilham Kurniawan',
      codeName: 'FORGE',
      role: 'Kepala Departemen Kewirausahaan',
      division: 'Kewirausahaan',
      rarity: 5,
      operatorClass: 'MERCHANT / TECHNOPRENEUR',
      avatar: '/assets/silhouette_male.jpg',
      nim: '',
      generation: '2023',
      specialty: 'Startup Incubation, Tech Merchandising & Revenue Pipeline',
      stats: {
        leadership: 84,
        coding: 81,
        strategy: 93,
        integrity: 93
      },
      quote: 'Kemandirian finansial memperkokoh kebebasan berkarya organisasi.'
    },
    {
      id: 'sekdep_kwu',
      departmentId: 'dept-kwu',
      roleLevel: 'sekdep',
      name: 'Nabila Zahra',
      codeName: 'LEDGER-DEP',
      role: 'Sekretaris Departemen Kewirausahaan',
      division: 'Kewirausahaan',
      rarity: 5,
      operatorClass: 'SPECIALIST / INVENTORY AUDITOR',
      avatar: '/assets/silhouette_female.jpg',
      nim: '',
      generation: '2023',
      specialty: 'Merchandise Stock Invoicing, Cashflow Telemetry & Vendor Liaison',
      stats: {
        leadership: 80,
        coding: 77,
        strategy: 91,
        integrity: 96
      },
      quote: 'Akuntabilitas usaha himpunan adalah fondasi kemandirian operasional.'
    }
  ],

  proker: [
    {
      id: 'proker-1',
      title: 'Informatics Welcome & Orientation (IN-FLOW 2026)',
      division: 'PSDM',
      divisionId: 'dept-psdm-div-1',
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
      divisionId: 'dept-litbang-div-1',
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
      divisionId: 'dept-psdm-div-1',
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
      divisionId: 'dept-litbang-div-2',
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
      divisionId: 'dept-kominfo-div-1',
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
      divisionId: 'dept-mikat-div-2',
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
      divisionId: 'dept-kwu-div-1',
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
      divisionId: 'dept-psdm-div-1',
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
      divisionId: 'dept-litbang-div-1',
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
      divisionId: 'dept-psdm-div-1',
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
      divisionId: 'dept-litbang-div-2',
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
      divisionId: 'dept-kominfo-div-1',
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
      divisionId: 'dept-mikat-div-2',
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

  // Constitution & Cadre Education Doctrine (Draft Amandemen AD, ART & GBHO)
  doctrine: {
    adArt: [
      {
        bab: 'BAB I (AD)',
        title: 'NAMA, WAKTU & TEMPAT KEDUDUKAN',
        pasalList: [
          {
            pasal: 'Pasal 1 (Nama)',
            content: 'Organisasi ini bernama Himpunan Mahasiswa Informatika Universitas Mayasari Bakti, selanjutnya disingkat HMIF UMB.'
          },
          {
            pasal: 'Pasal 2 (Waktu)',
            content: '1. Organisasi ini pertama kali dibentuk pada tanggal 16 Februari 2012 (dahulu HIMATIF).\n2. Organisasi ini diresmikan kembali (reborn) pada tanggal 26 Agustus 2017.\n3. Organisasi ini berdiri sampai waktu yang tidak ditentukan lamanya.'
          },
          {
            pasal: 'Pasal 3 (Kedudukan)',
            content: 'Organisasi ini berkedudukan di Program Studi Informatika, Fakultas Teknik, Universitas Mayasari Bakti, Kota Tasikmalaya.'
          }
        ]
      },
      {
        bab: 'BAB II (AD)',
        title: 'LAMBANG DAN ATRIBUT ORGANISASI',
        pasalList: [
          {
            pasal: 'Pasal 4 (Lambang Organisasi)',
            content: '1. HMIF UMB memiliki lambang organisasi yang mencerminkan identitas, visi, dan semangat pergerakan mahasiswa informatika.\n2. Komponen lambang meliputi: USB Melingkar (persatuan & transmisi pemikiran), Bunga Tulip Biru & Hijau (pertumbuhan & etika), dan Simbol Sinyal/Jaringan Merah (konektivitas & keberanian pergerakan).\n3. Ketentuan rinci bentuk, warna, dan makna filosofis diatur dalam ART.'
          },
          {
            pasal: 'Pasal 5 (Atribut Organisasi)',
            content: '1. Kelengkapan atribut organisasi terdiri dari: Bendera Organisasi, Pakaian Dinas Harian (PDH), Pakaian Dinas Umum (PDU), Jaket Himpunan, Kartu Tanda Anggota (KTA), dan kelengkapan administrasi lainnya.\n2. Pengadaan dan tata tertib pemakaian atribut diatur dalam Anggaran Rumah Tangga (ART).'
          }
        ]
      },
      {
        bab: 'BAB III & IV (AD)',
        title: 'ASAS, LANDASAN, VISI & MISI',
        pasalList: [
          {
            pasal: 'Pasal 6 & 7 (Asas & Landasan)',
            content: 'HMIF UMB berasaskan Ketuhanan Yang Maha Esa, Pancasila, dan Tri Dharma Perguruan Tinggi, serta menjunjung tinggi nilai-nilai kekeluargaan dan integritas. Landasan operasional organisasi adalah Anggaran Dasar (AD), Anggaran Rumah Tangga (ART), dan Garis Besar Haluan Organisasi (GBHO).'
          },
          {
            pasal: 'Pasal 8 & 9 (Visi & Misi)',
            content: 'Visi: Terwujudnya HMIF UMB sebagai wadah pengembangan mahasiswa informatika yang unggul dalam teknologi, profesional dalam berkarya, serta membentuk insan akademis yang bertakwa kepada Tuhan Yang Maha Esa.\nMisi: (1) Membangun karakter mahasiswa berlandaskan nilai ketuhanan, moralitas, dan integritas; (2) Menyelenggarakan sistem kaderisasi bertingkat dan berkelanjutan; (3) Mengembangkan potensi akademik dan non-akademik di bidang TI; (4) Mempererat kekeluargaan, solidaritas, dan kepedulian sosial.'
          },
          {
            pasal: 'Pasal 10 (Sifat & Status)',
            content: '1. HMIF UMB bersifat independen, ilmiah, dan kekeluargaan.\n2. HMIF UMB berstatus sebagai organisasi kemahasiswaan tingkat program studi yang sah dan berdaulat di lingkungan Fakultas Teknik Universitas Mayasari Bakti.'
          }
        ]
      },
      {
        bab: 'BAB VI (AD) & BAB II (ART)',
        title: 'KEANGGOTAAN, HAK & KEWAJIBAN',
        pasalList: [
          {
            pasal: 'Klasifikasi Keanggotaan (Pasal 11 AD / Pasal 7 ART)',
            content: 'Keanggotaan HMIF UMB terdiri atas:\n1. Anggota Muda: Mahasiswa aktif Teknik Informatika UMB yang telah lulus kaderisasi tahap awal (PRASASTI/PKKMB Prodi) namun belum menyelesaikan kaderisasi dasar.\n2. Anggota Biasa: Mahasiswa aktif Teknik Informatika UMB yang telah dinyatakan LULUS kaderisasi tingkat dasar (Masa Bimbingan / MABIM) dan dilantik resmi.\n3. Anggota Kehormatan: Alumni atau perseorangan di luar prodi yang berjasa luar biasa bagi organisasi dan diangkat forum tertinggi.'
          },
          {
            pasal: 'Hak & Kewajiban (Pasal 13 AD / Pasal 9-10 ART)',
            content: '1. Anggota Muda memiliki hak bicara dan hak partisipasi, namun tidak memiliki hak suara (voting).\n2. Anggota Biasa memiliki hak bicara, hak partisipasi, hak suara penuh (active vote) dalam permusyawaratan, hak memilih dan hak dipilih.\n3. Setiap anggota berkewajiban menjunjung tinggi nama baik almamater, mematuhi AD/ART & GBHO, membayar Iuran Wajib Anggota (IWA), dan berpartisipasi aktif dalam kegiatan.'
          },
          {
            pasal: 'Kartu Tanda Anggota / KTA (Pasal 6 ART)',
            content: '1. KTA adalah dokumen otentik bukti keanggotaan HMIF UMB yang memuat foto, nama/NIM, jabatan, dan masa berlaku.\n2. KTA diberikan HANYA kepada anggota yang telah memenuhi syarat administratif dan dinyatakan LULUS Masa Bimbingan (MABIM).'
          }
        ]
      },
      {
        bab: 'BAB VII (AD) & BAB III (ART)',
        title: 'SISTEM PENDIDIKAN DAN KADERISASI',
        pasalList: [
          {
            pasal: 'Prinsip & Jenjang (Pasal 15 AD / Pasal 13 ART)',
            content: 'Kaderisasi dilaksanakan dengan prinsip: Sistematis, Berjenjang (tanpa lompatan), Terukur (output-based), dan Berkelanjutan. Jenjang formal wajib terdiri atas 3 tahapan hierarkis yang bersifat prasyarat mutlak (sistem gugur):\n1. Tahap I: PRASASTI (Pra-Kaderisasi / PKKMB Tingkat Prodi).\n2. Tahap II: MABIM (Masa Bimbingan / Kaderisasi Tingkat Dasar).\n3. Tahap III: LKM (Latihan Kepemimpinan Mahasiswa / Advance Training).'
          },
          {
            pasal: 'Tahap I: PRASASTI (Pasal 14 ART)',
            content: 'Mandat khusus pengenalan budaya akademik, struktur, kultur, dan fungsi HMIF UMB bagi seluruh mahasiswa baru. Kelulusan PRASASTI menjadi syarat pengakuan status Anggota Muda dan syarat mutlak mengikuti MABIM.'
          },
          {
            pasal: 'Tahap II: MABIM (Pasal 15 ART)',
            content: 'Kaderisasi tingkat dasar untuk menanamkan doktrin perjuangan, rasa memiliki (sense of belonging), konstitusi AD/ART/GBHO, dan persaudaraan. Lulusan MABIM dilantik menjadi Anggota Biasa, berhak menerima PDU, KTA, dan hak suara penuh.'
          },
          {
            pasal: 'Tahap III: LKM (Pasal 16 ART)',
            content: 'Kaderisasi tingkat lanjut untuk mencetak kader pemimpin berkapasitas manajerial strategis, analisis sosial, dan kepersidangan. Lulusan LKM memperoleh hak dipilih (passive vote) menjadi BPH atau DPA, serta hak memakai Jaket Himpunan dan PDH saat menjabat.'
          }
        ]
      },
      {
        bab: 'BAB IX, XI & XII (AD)',
        title: 'STRUKTUR KEKUASAAN: LEGISLATIF (DPA) & EKSEKUTIF (BPH)',
        pasalList: [
          {
            pasal: 'Kedaulatan & Pembagian Kekuasaan (Pasal 17-18 AD)',
            content: 'Kedaulatan tertinggi berada di tangan Anggota Biasa melalui Musyawarah Besar (MUBES). Pembagian kekuasaan terdiri dari:\n1. Legislatif & Pengawasan: Dewan Perwakilan Anggota (DPA).\n2. Eksekutif: Badan Pengurus Harian (BPH).\n3. Badan Ad-Hoc / Kepanitiaan khusus.'
          },
          {
            pasal: 'Dewan Perwakilan Anggota / DPA (Pasal 20 AD / Pasal 24 ART)',
            content: 'DPA adalah lembaga legislatif, pengawasan, dan yudikatif kolektif-kolegial yang dipilih dalam MUBES. Berfungsi mengawasi kinerja BPH, mengaudit keuangan berkala (triwulan), menyerap aspirasi anggota, menginterpretasikan konstitusi, dan menggelar Sidang Istimewa jika terjadi pelanggaran berat.'
          },
          {
            pasal: 'Badan Pengurus Harian & Departemen (Pasal 21 AD / Pasal 27 & 29 ART)',
            content: '1. BPH Inti terdiri dari: Ketua Himpunan, Sekretaris Jenderal, dan Bendahara Umum.\n2. Badan Pengurus Departemen (BPD) sekurang-kurangnya meliputi: Departemen Litbang (akademik & riset), Departemen Internal (kaderisasi & keharmonisan), Departemen Eksternal (humas & relasi kampus/Permikomnas), dan Departemen Kerohanian (mental spiritual), dengan opsi departemen pendukung (Kominfo, Minat Bakat, Kewirausahaan).'
          }
        ]
      },
      {
        bab: 'BAB XIII (AD) & BAB VII (ART)',
        title: 'KEUANGAN, ONE GATE POLICY & PERSURATAN',
        pasalList: [
          {
            pasal: 'Pengelolaan Keuangan One Gate Policy (Pasal 22 AD / Pasal 47 ART)',
            content: '1. Otoritas tunggal perbendaharaan berada di Bendahara Umum yang bertanggung jawab kepada Ketua Himpunan.\n2. Seluruh penerimaan dana wajib masuk ke kas/rekening resmi organisasi terlebih dahulu sebelum didistribusikan. Dilarang keras membuat kas gelap/dana liar.\n3. Rekening organisasi wajib terpisah mutlak dari rekening pribadi pengurus.\n4. Pembukuan Buku Kas Umum (General Ledger) dilakukan secara real-time dengan bukti transaksi valid, petty cash sistem reimbursement, dan audit berkala triwulan oleh Komisi Anggaran DPA.'
          },
          {
            pasal: 'Tata Laksana Persuratan & Kodifikasi (Pasal 52 ART)',
            content: 'Format penomoran surat baku: Kode.NomorUrut/HMIF-UMB/RomawiBulan/Tahun.\nKode Klasifikasi: 01 (Produk Hukum/SK), 02 (Kekuasaan/Mandat/Tugas), 03 (Pengawasan/Memorandum/SP), 04 (Perikatan/MoU/PKS), 05 (Pernyataan/Berita Acara), 06 (Legalitas/Perizinan/Peminjaman), 07 (Administrasi/Undangan/Edaran), 08 (Pelayanan/Keterangan/Rekomendasi).'
          }
        ]
      },
      {
        bab: 'BAB XIV (AD) & BAB VI (ART)',
        title: 'PERMUSYAWARATAN, KUORUM & GBHO',
        pasalList: [
          {
            pasal: 'Forum Permusyawaratan (Pasal 24 AD / Pasal 35-43 ART)',
            content: 'Permusyawaratan meliputi:\n1. Musyawarah Besar (MUBES): Forum kedaulatan tertinggi 1 kali di akhir periode untuk LPJ BPH, amandemen AD/ART/GBHO, dan suksesi Kahim/DPA.\n2. Musyawarah Luar Biasa (MUSLUB): Forum darurat keadaan genting atau pemakzulan.\n3. Rapat Kerja (RAKER): Perencanaan program kerja & anggaran maksimal 30 hari pasca pelantikan.\n4. Sidang Pleno: Evaluasi paruh waktu minimal 1 kali di tengah periode.\n5. Rapat Koordinasi Pengurus (RKP), RDP (DPA), dan Sidang Istimewa.'
          },
          {
            pasal: 'Kuorum & GBHO (Pasal 25-26 AD)',
            content: '1. Kuorum sah dihadiri sekurang-kurangnya 50% + 1 dari peserta berhak suara (Anggota Biasa). Jika tidak terpenuhi, skorsing 2x15 menit.\n2. Garis Besar Haluan Organisasi (GBHO) adalah pedoman strategis jangka panjang 3-5 tahun yang menjadi haluan gerak dan kesinambungan program kerja organisasi.'
          }
        ]
      }
    ],

    cadetRoadmap: [
      {
        step: 1,
        title: 'Tahap I: PRASASTI (Pra-Kaderisasi / PKKMB Prodi)',
        desc: 'Pengenalan budaya akademik Prodi Teknik Informatika, kultur riset, etika mahasiswa, dan orientasi peran HMIF UMB. Kelulusan tahapan ini mengesahkan status sebagai Anggota Muda HMIF UMB.'
      },
      {
        step: 2,
        title: 'Tahap II: MABIM (Masa Bimbingan / Basic Training)',
        desc: 'Internalisasi doktrin perjuangan, konstitusi AD/ART & GBHO, sejarah mahasiswa informatika, manajemen aksi, dan pembinaan karakter. Kelulusan mengesahkan status Anggota Biasa dengan hak kepemilikan PDU, KTA, dan hak suara penuh.'
      },
      {
        step: 3,
        title: 'Tahap III: LKM (Latihan Kepemimpinan Mahasiswa / Advance Training)',
        desc: 'Pembekalan kepemimpinan strategis, teknik persidangan parlementer, analisis sosial, dan tata kelola perbendaharaan/kesekretariatan. Menjadi prasyarat mutlak untuk memiliki hak dipilih sebagai BPH/DPA dan hak mengenakan PDH serta Jaket Himpunan.'
      },
      {
        step: 4,
        title: 'Tahap IV: Pengabdian Fungsionaris & Kepanitiaan Ad-Hoc',
        desc: 'Praktik manajerial operasional dalam kepengurusan BPH, badan perwakilan DPA, atau badan ad-hoc kepanitiaan program kerja untuk merealisasikan mandat GBHO dan pelayanan mahasiswa.'
      },
      {
        step: 5,
        title: 'Tahap V: Musyawarah Besar (MUBES) & Regenerasi',
        desc: 'Puncak siklus kedaulatan organisasi: audit laporan pertanggungjawaban BPH & DPA, pengawalan amandemen AD/ART & GBHO, serta estafet kepemimpinan baru yang demokratis dan konstitusional.'
      }
    ],

    // Interactive Quiz / Aptitude Test for Cadets (Updated to Draft Amandemen AD/ART)
    cadetQuiz: [
      {
        id: 1,
        question: 'Kapan hari lahir (milad) pertama kali organisasi mahasiswa informatika ini dibentuk dan kapan momentum peresmian kembali (reborn)?',
        options: [
          'Dibentuk 1 Januari 2015 dan diresmikan 17 Agustus 2020',
          'Dibentuk 16 Februari 2012 (HIMATIF) dan diresmikan kembali (reborn) 26 Agustus 2017',
          'Dibentuk 10 November 2010 dan diresmikan 2 Mei 2016',
          'Dibentuk 20 Oktober 2018 tanpa adanya proses peresmian ulang'
        ],
        correctIndex: 1,
        explanation: 'Sesuai Penjelasan Pasal 2 AD, tanggal 16 Februari 2012 adalah hari kelahiran pertama (dahulu HIMATIF) dan tanggal 26 Agustus 2017 adalah tonggak kebangkitan kembali (reborn) HMIF UMB.'
      },
      {
        id: 2,
        question: 'Berdasarkan Pasal 11 AD dan Pasal 7 ART, apa kriteria status keanggotaan Anggota Biasa?',
        options: [
          'Seluruh mahasiswa baru yang baru saja mendaftar kuliah di Prodi Informatika UMB',
          'Mahasiswa yang telah dinyatakan LULUS kaderisasi tingkat dasar Masa Bimbingan (MABIM)',
          'Hanya mahasiswa yang menjadi ketua divisi atau pengurus inti BPH',
          'Alumni yang telah diwisuda dari program studi teknik informatika'
        ],
        correctIndex: 1,
        explanation: 'Sesuai Pasal 11 ayat 2 AD dan Pasal 7 ayat 1b ART, Anggota Biasa adalah mahasiswa aktif Teknik Informatika UMB yang telah dinyatakan LULUS Masa Bimbingan (MABIM) dan dilantik resmi.'
      },
      {
        id: 3,
        question: 'Lembaga kelengkapan organisasi manakah yang menjalankan fungsi legislatif, pengawasan kinerja BPH, dan audit keuangan berkala?',
        options: [
          'Badan Pengurus Harian (BPH)',
          'Dewan Perwakilan Anggota (DPA)',
          'Kepanitiaan Ad-Hoc Pemilihan Raya',
          'Badan Eksekutif Mahasiswa Fakultas'
        ],
        correctIndex: 1,
        explanation: 'Sesuai Bab XI Pasal 20 AD dan Bab V Pasal 24 ART, Dewan Perwakilan Anggota (DPA) memegang kekuasaan legislatif, yudikatif, serta pengawasan dan audit terhadap BPH.'
      },
      {
        id: 4,
        question: 'Apakah persyaratan mutlak bagi seorang kader agar berhak menerima Kartu Tanda Anggota (KTA) digital dan fisik resmi HMIF UMB?',
        options: [
          'Cukup mengisi formulir pendaftaran di website tanpa mengikuti kaderisasi',
          'Telah memenuhi syarat administratif dan dinyatakan LULUS Masa Bimbingan (MABIM)',
          'Wajib menjabat sebagai anggota Dewan Perwakilan Anggota (DPA)',
          'Membayar biaya cetak kartu tanpa verifikasi status keanggotaan'
        ],
        correctIndex: 1,
        explanation: 'Sesuai Pasal 6 ayat 4 ART, KTA hanya diberikan kepada anggota yang telah memenuhi syarat administratif dan dinyatakan kelulusannya dalam Masa Bimbingan (MABIM).'
      },
      {
        id: 5,
        question: 'Bagaimana prinsip pengelolaan keuangan organisasi yang diatur dalam Pasal 47 ART (One Gate Policy)?',
        options: [
          'Setiap departemen bebas menyimpan uang masuk secara rahasia untuk kas taktis masing-masing',
          'Seluruh uang masuk dari sumber mana pun wajib disetorkan melalui satu pintu ke rekening/kas resmi di bawah otoritas Bendahara Umum',
          'Pengeluaran kegiatan tidak perlu melampirkan nota kwitansi asli atau bukti digital',
          'Bendahara kepanitiaan tidak perlu berkoordinasi dengan Bendahara Umum himpunan'
        ],
        correctIndex: 1,
        explanation: 'Pasal 47 ART menetapkan One Gate Policy: seluruh penerimaan dana wajib masuk ke kas resmi di bawah otoritas tunggal Bendahara Umum, larangan keras dana kas gelap, dan kewajiban bukti transaksi valid.'
      },
      {
        id: 6,
        question: 'Berdasarkan Pasal 52 ART, berapakah kode klasifikasi baku untuk Surat Keputusan (SK) dan Surat Tugas/Mandat?',
        options: [
          'Kode 01 untuk Produk Hukum (SK) dan Kode 02 untuk Kekuasaan/Mandat/Tugas',
          'Kode 07 untuk SK dan Kode 08 untuk Surat Tugas',
          'Kode 09 untuk SK dan Kode 00 untuk Surat Mandat',
          'Tidak ada kode penomoran khusus dalam administrasi HMIF'
        ],
        correctIndex: 0,
        explanation: 'Pasal 52 ayat 2 ART mengkodifikasikan: Kode 01 untuk Produk Hukum (SK/SKB) dan Kode 02 untuk Kekuasaan (Surat Perintah, Mandat, Delegasi, Tugas) dalam format Kode.NomorUrut/HMIF-UMB/RomawiBulan/Tahun.'
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
