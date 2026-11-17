const navigationAliases = {
  'app-calendar': 'calendar',
  'learning-course': 'dashboard-lms',
  'learning-course-list': 'dashboard-lms',
  'learning-course-grid': 'dashboard-lms',
  'learning-course-details': 'dashboard-lms',
  'learning-student-overview': 'dashboard-lms',
  'learning-trainer-profile': 'tutoring',
  'learning-course-create': 'academic',
  'support-tickets': 'dashboard-support',
  'support-ticket-create': 'dashboard-support',
  'support-table': 'dashboard-support',
  'support-cards': 'dashboard-support',
  'support-contacts': 'dashboard-support',
  'support-contact-details': 'dashboard-support',
  'support-reports': 'dashboard-support',
  'support-tickets-preview': 'dashboard-support',
  'support-quick-links': 'dashboard-support',
  'operations-kanban': 'operations',
  'operations-proker': 'operations',
  'operations-letters': 'operations',
  'operations-finance': 'operations',
  'operations-aspirations': 'operations'
};

export const hasWorkspaceCapability = (user, capability) => user?.role === 'superadmin'
  || user?.permissions?.includes(capability)
  || user?.position_capabilities?.includes(capability)
  || user?.positionCapabilities?.includes(capability);

const createNavigationSections = ({ isSuperadmin, clearanceLevel, permissions, positionCapabilities }) => {
  const capabilityUser = {
    role: isSuperadmin ? 'superadmin' : 'member',
    permissions,
    positionCapabilities
  };
  const canCurateAcademic = hasWorkspaceCapability(capabilityUser, 'academic_curate')
    || permissions.includes('learning.manage');
  const canOperate = isSuperadmin || clearanceLevel >= 2;
  const canViewStudentDemographics = hasWorkspaceCapability(capabilityUser, 'student_demographics.view');
  const canVote = true;

  const dashboard = {
    id: 'dashboard',
    label: 'Dashboard',
    items: [
      { id: 'home', label: 'Beranda', workspaceView: 'home', status: 'available' }
    ]
  };

  const services = {
    id: 'hmif-services',
    label: 'Layanan HMIF',
    items: [
      {
        id: 'attendance',
        label: 'Presensi & tiket acara',
        status: 'available',
        children: [
          { id: 'attendance-checkin', label: 'Pindai kehadiran', workspaceView: 'attendance-checkin', status: 'available' },
          { id: 'attendance-tickets', label: 'Tiket acara', workspaceView: 'attendance-tickets', status: 'available' }
        ]
      },
      { id: 'delegations', label: 'Delegasi & mandat', workspaceView: 'delegations', status: 'available' },
      { id: 'meetings', label: 'Rapat HMIF', workspaceView: 'meetings', status: 'available' },
      {
        id: 'academics',
        label: 'Akademik & pembelajaran',
        status: 'available',
        children: [
          { id: 'knowledge', label: 'Pusat Akademik & Knowledge Base', workspaceView: 'public-feature', publicTab: 'knowledge', status: 'available' },
          { id: 'dashboard-lms', label: 'Ruang Belajar', badge: 'LMS', workspaceView: 'learning', status: 'available' },
          { id: 'tutoring', label: 'Klinik Koding', workspaceView: 'public-feature', publicTab: 'knowledge', publicAnchor: 'tutoring-clinic-heading', status: 'available' },
          ...(canCurateAcademic
            ? [{ id: 'academic', label: 'Kurasi akademik', workspaceView: 'academic', status: 'available' }]
            : [])
        ]
      },
      { id: 'dashboard-support', label: 'Support Desk', workspaceView: 'support', status: 'available' },
      { id: 'calendar', label: 'Kalender pendidikan', workspaceView: 'public-feature', publicTab: 'calendar', status: 'available' },
      { id: 'inventory', label: 'Inventaris digital', workspaceView: 'public-feature', publicTab: 'inventory', status: 'available' },
      ...(canVote
        ? [{ id: 'voting', label: 'Pemungutan suara', workspaceView: 'voting', status: 'available' }]
        : []),
      { id: 'showcase', label: 'Karya mahasiswa', workspaceView: 'public-feature', publicTab: 'showcase', status: 'available' },
      { id: 'career', label: 'Karier & alumni', workspaceView: 'public-feature', publicTab: 'career', status: 'available' },
      { id: 'doctrine', label: 'Dokumen organisasi', workspaceView: 'public-feature', publicTab: 'doctrine', status: 'available' },
      { id: 'governance-documents', label: 'Amandemen AD/ART/GBHO', workspaceView: 'governance-documents', status: 'available' },
      { id: 'notifications', label: 'Notifikasi', workspaceView: 'notifications', status: 'available' },
      { id: 'profile', label: 'Profil & keamanan', workspaceView: 'profile', status: 'available' }
    ]
  };

  const organizationItems = [
    ...(canOperate
      ? [{ id: 'operations', label: 'Konsol operasional', badge: 'PENGURUS', workspaceView: 'operations', status: 'available' }]
      : []),
    ...(canViewStudentDemographics
      ? [{ id: 'student-demographics', label: 'Statistik mahasiswa', badge: 'AKSES JABATAN', workspaceView: 'student-demographics', status: 'available' }]
      : []),
    ...(isSuperadmin
      ? [
        { id: 'position-access', label: 'Akses jabatan', badge: 'SUPERADMIN', workspaceView: 'position-access', status: 'available' },
        { id: 'studio', label: 'Site Studio', badge: 'SUPERADMIN', workspaceView: 'studio', status: 'available' }
      ]
      : [])
  ];

  return [
    dashboard,
    services,
    ...(organizationItems.length
      ? [{
        id: 'organization-operations',
        label: canOperate ? 'Operasional organisasi' : 'Akses jabatan',
        items: organizationItems
      }]
      : [])
  ];
};

const collectEntries = (sections) => {
  const entries = [];
  const visit = (items) => {
    for (const item of items || []) {
      entries.push(item);
      visit(item.children);
    }
  };
  for (const section of sections || []) visit(section.items);
  return entries;
};

export const getWorkspaceConfiguration = ({ isSuperadmin = false, clearanceLevel = 0, permissions = [], positionCapabilities = [] } = {}) => {
  const clearance = isSuperadmin ? 3 : clearanceLevel;
  const canOperate = isSuperadmin || clearance >= 2;
  const capabilityUser = {
    role: isSuperadmin ? 'superadmin' : 'member',
    permissions,
    positionCapabilities
  };
  const canCurateAcademic = hasWorkspaceCapability(capabilityUser, 'academic_curate')
    || permissions.includes('learning.manage');
  const pages = [
    { id: 'home', label: 'Beranda' },
    { id: 'notifications', label: 'Notifikasi' },
    { id: 'profile', label: 'Profil & keamanan' }
  ];
  if (canCurateAcademic) {
    pages.push({ id: 'academic', label: 'Pusat Akademik' });
  }
  if (canOperate) {
    pages.push({ id: 'operations', label: 'Operasional organisasi' });
  }
  if (isSuperadmin) {
    pages.push({ id: 'studio', label: 'Site Studio' });
  }

  const roleName = isSuperadmin
    ? 'SUPERADMIN'
    : clearance >= 3 ? 'Pengurus BPH' : clearance >= 2 ? 'Pengurus' : clearance === 1 ? 'Anggota aktif' : 'Anggota';
  const dashboardName = isSuperadmin
    ? 'Administrator'
    : clearance >= 3 ? 'Pengurus BPH' : clearance >= 2 ? 'Pengurus' : 'Anggota';

  return {
    clearance,
    roleName,
    dashboardName,
    canCurateAcademic,
    pages,
    sections: createNavigationSections({ isSuperadmin, clearanceLevel: clearance, permissions, positionCapabilities })
  };
};

export const getWorkspaceNavigationEntries = (sections) => collectEntries(sections);

export const findWorkspaceNavigationEntry = (sections, view) => {
  const entries = collectEntries(sections);
  const exact = entries.find((entry) => entry.id === view);
  if (exact) return { ...exact, menuId: exact.id };

  const byView = entries.filter((entry) => entry.workspaceView === view);
  if (byView.length === 1) return { ...byView[0], menuId: byView[0].id };

  const targetId = navigationAliases[view];
  if (!targetId) return undefined;
  const target = entries.find((entry) => entry.id === targetId);
  return target ? { ...target, id: view, menuId: target.id } : undefined;
};
