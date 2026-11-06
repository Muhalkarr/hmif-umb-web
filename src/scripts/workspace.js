export const getWorkspaceConfiguration = ({ isSuperadmin = false, clearanceLevel = 0, permissions = [] } = {}) => {
  const clearance = Number.isInteger(clearanceLevel) ? clearanceLevel : 0;
  const canCurateAcademic = isSuperadmin || permissions.includes('academic_curate');
  const dashboardName = isSuperadmin
    ? 'Administrator'
    : clearance >= 3 ? 'Pengurus BPH' : clearance >= 2 ? 'Pengurus' : 'Anggota';
  const pages = [
    { id: 'home', label: 'Beranda' },
    { id: 'notifications', label: 'Notifikasi' },
    { id: 'profile', label: 'Profil & keamanan' },
    ...(canCurateAcademic ? [{ id: 'academic', label: 'Pusat Akademik' }] : []),
    ...((isSuperadmin || clearance >= 2) ? [{ id: 'operations', label: 'Operasional organisasi' }] : []),
    ...(isSuperadmin ? [{ id: 'studio', label: 'Site Studio' }] : [])
  ];

  return {
    clearance,
    canCurateAcademic,
    dashboardName,
    roleName: isSuperadmin ? 'SUPERADMIN' : `CLEARANCE ${clearance}`,
    pages
  };
};
