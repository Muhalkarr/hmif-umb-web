(() => {
  const $ = (s, root=document) => root.querySelector(s);
  const $$ = (s, root=document) => [...root.querySelectorAll(s)];
  const toast = (message) => {
    const el = $('#toast'); el.textContent = message; el.classList.add('show');
    clearTimeout(toast.timer); toast.timer = setTimeout(() => el.classList.remove('show'), 2800);
  };
  const clock = () => {
    const now = new Date();
    $('#clock').textContent = now.toLocaleTimeString('id-ID',{hour:'2-digit',minute:'2-digit',timeZone:'Asia/Jakarta'}) + ' WIB';
  };
  clock(); setInterval(clock, 30000);

  const publicView = $('#public-view'), workspaceView = $('#workspace-view');
  const modal = $('#login-modal');
  const openModal = () => { modal.hidden = false; $('#demo-role').focus(); };
  const closeModal = () => { modal.hidden = true; };
  $('#open-login').addEventListener('click', openModal);
  $('#close-login').addEventListener('click', closeModal);
  modal.addEventListener('click', e => { if (e.target === modal) closeModal(); });
  document.addEventListener('keydown', e => { if(e.key === 'Escape') closeModal(); });

  const roles = {
    chair:{name:'Manusa Kharras',label:'KETUA HIMPUNAN',greeting:'Ketua.',metric:['08/12','24/31','04','86/104'],description:'Seluruh unit organisasi berada dalam satu tampilan kendali.'},
    vice:{name:'R. Aulia',label:'WAKIL KETUA',greeting:'Wakil Ketua.',metric:['08/12','24/31','03','86/104'],description:'Pantau progres lintas departemen dan tindak lanjut koordinasi.'},
    secretary:{name:'N. Putri',label:'SEKRETARIS',greeting:'Sekretaris.',metric:['12','07','03','18'],description:'Kelola surat, notulensi, agenda, dan arsip organisasi.'},
    treasurer:{name:'D. Fikri',label:'BENDAHARA',greeting:'Bendahara.',metric:['Rp 8,4jt','Rp 3,2jt','02','06'],description:'Pantau pemasukan, pengeluaran, dan kelengkapan bukti transaksi.'},
    head:{name:'R. Aditya',label:'KEPALA DEPARTEMEN',greeting:'Kepala Departemen.',metric:['03/04','12/16','02','09'],description:'Kelola program kerja, tugas, serta kapasitas tim departemen.'},
    staff:{name:'S. Nabila',label:'STAF DEPARTEMEN',greeting:'Rekan pengurus.',metric:['02','05','01','03'],description:'Fokus pada tugas yang ditugaskan kepada Anda dan agenda tim.'}
  };
  let currentRole = 'chair';
  const metrics = [
    ['PROGRAM KERJA AKTIF','67% dari target periode',67],
    ['TUGAS SELESAI','7 tugas masih berjalan',77],
    ['PENGAJUAN MENUNGGU','2 membutuhkan tinjauan',40],
    ['ANGGOTA AKTIF','Data demo organisasi',83]
  ];
  function setRole(key){
    currentRole = roles[key] ? key : 'chair';
    const role = roles[currentRole];
    $('#user-name').textContent = role.name; $('#user-role').textContent = role.label;
    $('#workspace-greeting').innerHTML = 'Selamat datang,<br><em>' + role.greeting + '</em>';
    $('#workspace-greeting').nextElementSibling.textContent = role.description;
    $$('.metric-card').forEach((card,i)=>{
      card.querySelector('strong').textContent = role.metric[i];
      card.querySelector('small').textContent = metrics[i][1];
      card.querySelector('.metric-bar i').style.width = metrics[i][2] + '%';
    });
    $('#demo-role').value = currentRole;
  }
  function enterWorkspace(role){
    setRole(role);
    closeModal();
    publicView.hidden = true; workspaceView.hidden = false;
    window.scrollTo({top:0,behavior:'smooth'});
    toast('DEMO SESSION ACTIVE / ' + roles[role].label);
  }
  $('#enter-demo').addEventListener('click',()=>enterWorkspace($('#demo-role').value));
  $('#role-switch').addEventListener('click',openModal);
  $('#back-public').addEventListener('click',()=>{
    workspaceView.hidden = true; publicView.hidden = false; window.scrollTo({top:0,behavior:'smooth'});
  });

  $('#mobile-menu').addEventListener('click',()=>$('#main-nav').classList.toggle('open'));
  $$('#main-nav a').forEach(link=>link.addEventListener('click',()=>{
    $$('#main-nav a').forEach(a=>a.classList.toggle('active',a===link));
    $('#main-nav').classList.remove('open');
  }));
  $$('.filter-btn').forEach(button=>button.addEventListener('click',()=>{
    $$('.filter-btn').forEach(b=>b.classList.toggle('active',b===button));
    const filter=button.dataset.filter;
    $$('.program-card').forEach(card=>card.hidden=filter!=='all' && card.dataset.category!==filter);
  }));

  const workspaceTitles = {
    overview:'RINGKASAN',tasks:'TUGAS & PROGRES',programs:'PROGRAM KERJA',
    documents:'DOKUMEN & SURAT',finance:'KEUANGAN',members:'ANGGOTA',
    calendar:'KALENDER',archive:'ARSIP DIGITAL'
  };
  const workspaceData = {
    tasks:['Task board / 03 lanes','Tugas yang ditugaskan, sedang dikerjakan, menunggu review, dan selesai.','To do · 07','In progress · 05','Under review · 03','Done · 24'],
    programs:['Program kerja / periode 2026–2027','Pantau proposal, persetujuan, pelaksanaan, evaluasi, dan LPJ per program kerja.','Learning Lab · Berjalan','Leadership Camp · Draft','Technology Community Day · Review','Forum Riset · Direncanakan'],
    documents:['Pusat dokumen / 128 berkas','Surat masuk dan keluar, proposal, notulensi, keputusan, serta arsip legal.','Surat masuk · 12','Surat keluar · 34','Proposal & LPJ · 46','Dokumen organisasi · 36'],
    finance:['Ledger organisasi / demo','Ringkasan pencatatan anggaran. Data transaksi pada prototipe ini tidak terhubung ke rekening atau pembukuan nyata.','Pagu periode · Rp 12.000.000','Realisasi · Rp 8.400.000','Menunggu verifikasi · 02','Bukti belum lengkap · 06'],
    members:['Direktori anggota / 104 entri demo','Direktori terstruktur berdasarkan periode, jabatan, dan unit kerja. Hindari menampilkan data pribadi kepada publik.','Pengurus inti · 05','Kepala unit · 04','Staf departemen · 48','Anggota · 47'],
    calendar:['Kalender organisasi / November 2026','Agenda rapat, kegiatan, tenggat pengajuan, dan jadwal akademik yang dikelola sekretariat.','12 Nov · Workshop Web','15 Nov · Rapat koordinasi','19 Nov · Community Day','22 Nov · Forum Riset'],
    archive:['Arsip institusional / 2024–2027','Memori organisasi lintas periode. Berkas final memiliki metadata, pemilik, dan riwayat revisi.','AD/ART & GBHO','SK Kepengurusan','Laporan pertanggungjawaban','Dokumentasi kegiatan']
  };
  function renderWorkspace(key){
    if(key==='overview'){location.hash='workspace';toast('Menampilkan ringkasan organisasi');return;}
    const data=workspaceData[key]; if(!data)return;
    $('#workspace-crumb').textContent=workspaceTitles[key];
    $$('.workspace-link').forEach(b=>b.classList.toggle('active',b.dataset.workspace===key));
    $('#workspace-content').innerHTML = '<div class="workspace-welcome"><div><div class="eyebrow"><span class="eyebrow-line"></span> HMIF / WORKSPACE / ' + workspaceTitles[key] + '</div><h2>' + data[0] + '</h2><p>' + data[1] + '</p></div><div class="welcome-actions"><span class="system-chip"><i></i> DEMO DATA / NO LIVE BACKEND</span></div></div><div class="quick-module-grid">' + data.slice(2).map((item,i)=>'<article class="quick-module"><span>0'+(i+1)+'</span><b>'+item+'</b><small>BUKA MODUL ↗</small></article>').join('') + '</div><div class="panel-card module-note"><div class="panel-heading"><div><span class="eyebrow">MODULE STATUS</span><h3>Ruang kerja dalam tahap prototipe</h3></div><span class="counter">CONCEPT / 0.1</span></div><p>Komponen ini menggambarkan struktur modul dan navigasi yang akan dikembangkan. Data saat ini bersifat sintetis dan aksi administratif belum tersambung ke backend.</p></div>';
    toast('MODUL DIBUKA / ' + workspaceTitles[key]);
  }
  $$('.workspace-link').forEach(b=>b.addEventListener('click',()=>renderWorkspace(b.dataset.workspace)));
  $$('.table-link,.panel-footer-link').forEach(b=>b.addEventListener('click',e=>{e.preventDefault();renderWorkspace(b.dataset.workspace)}));
  $('#quick-add').addEventListener('click',()=>toast('DEMO / Form pengajuan belum terhubung ke backend.'));
  $('#agenda-more').addEventListener('click',()=>toast('Agenda contoh. Kalender produksi perlu data terverifikasi dari sekretariat.'));

  // Keep prototype navigation usable when loaded from a nested path.
  if(location.hash==='#workspace'){enterWorkspace('chair');}
})();