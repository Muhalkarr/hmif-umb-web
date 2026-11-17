export const POSITION_CAPABILITY_OPTIONS = [
    { id: 'constitution.edit', label: 'Sunting draf AD/ART/GBHO', description: 'Membuat dan menyunting draf amandemen dokumen organisasi.' },
    { id: 'constitution.ratify', label: 'Sahkan naskah AD/ART/GBHO', description: 'Mempublikasikan naskah setelah disahkan dalam MUBES.' },
    { id: 'academic_curate', label: 'Kurasi akademik', description: 'Membuat dan mengelola referensi serta jalur belajar.' },
    { id: 'meeting_organize', label: 'Penyelenggara rapat', description: 'Membuat dan mengelola rapat yang diselenggarakan akun.' },
    { id: 'student_demographics.view', label: 'Statistik mahasiswa', description: 'Melihat statistik akun mahasiswa agregat.' },
    { id: 'finance.manage', label: 'Buku kas', description: 'Melihat transaksi dan bukti serta mencatat transaksi keuangan.' },
    { id: 'proker_lpj.view', label: 'Ringkasan LPJ', description: 'Melihat ringkasan program kerja dan pertanggungjawaban anggaran.' },
    { id: 'cadets.manage', label: 'Jenjang kaderisasi', description: 'Mengubah jenjang kaderisasi anggota.' },
    { id: 'delegations.manage', label: 'Delegasi & mandat', description: 'Melihat seluruh permohonan dan mengelola status serta mandat.' },
    { id: 'aspirations.manage', label: 'Aspirasi & RDP', description: 'Melihat aspirasi privat, memberi tanggapan, dan mengatur agenda RDP.' },
    { id: 'portfolio_review', label: 'Peer review karya', description: 'Meninjau artikel teknis dan panggilan proyek.' },
    { id: 'voting.manage', label: 'Kelola pemungutan suara', description: 'Membuat polling serta mengelola kandidat dan statusnya.' }
];

export const POSITION_CAPABILITY_IDS = new Set(POSITION_CAPABILITY_OPTIONS.map(({ id }) => id));

const activeOnDate = (record, date) => record?.startDate <= date
    && (!record.endDate || record.endDate >= date);

export const getActiveTermPositionAccess = (organizationStructure, capabilityMappings = [], today = new Date().toISOString().slice(0, 10)) => {
    const term = organizationStructure?.terms?.find((candidate) => candidate.status === 'active'
        && candidate.startDate <= today
        && (!candidate.endDate || candidate.endDate >= today));
    if (!term) return { term: null, positions: [] };

    const peopleById = new Map((organizationStructure.people || []).map((person) => [person.id, person]));
    const unitsById = new Map((term.units || []).map((unit) => [unit.id, unit]));
    const mappingsByPosition = new Map();
    for (const mapping of capabilityMappings) {
        if (mapping.term_id !== term.id || !POSITION_CAPABILITY_IDS.has(mapping.capability)) continue;
        mappingsByPosition.set(mapping.position_id, [...(mappingsByPosition.get(mapping.position_id) || []), mapping.capability]);
    }
    const currentAssignments = (term.assignments || []).filter((assignment) => activeOnDate(assignment, today));

    return {
        term: { id: term.id, name: term.name, startDate: term.startDate, endDate: term.endDate || null },
        positions: (term.positions || []).map((position) => ({
            id: position.id,
            title: position.title,
            unitName: unitsById.get(position.unitId)?.name || 'Unit tidak diketahui',
            capabilities: [...new Set(mappingsByPosition.get(position.id) || [])],
            holders: currentAssignments
                .filter((assignment) => assignment.positionId === position.id)
                .map((assignment) => {
                    const person = peopleById.get(assignment.personId);
                    return person ? {
                        name: person.name,
                        accountId: person.accountId || null,
                        assignmentKind: assignment.kind,
                        startDate: assignment.startDate,
                        endDate: assignment.endDate || null
                    } : null;
                })
                .filter(Boolean)
        }))
    };
};

export const getPositionCapabilitiesForAccount = (positionAccess, accountId) => [...new Set(
    (positionAccess?.positions || [])
        .filter((position) => position.holders.some((holder) => holder.accountId === accountId))
        .flatMap((position) => position.capabilities)
)];
