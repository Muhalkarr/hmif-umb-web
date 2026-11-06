export function resolveCohortOperator(operators, operatorId) {
    if (!operatorId) return null;
    return operators.find((item) => item.id === operatorId) || null;
}

export function getCohortPosts(generations, operator) {
    const posts = [];
    (generations || []).forEach((generation) => {
        Object.entries(generation.leadership || {}).forEach(([key, assignment]) => {
            if (assignment?.operatorId !== operator.id) return;
            const titles = {
                ketua: 'Ketua Angkatan (Komti)',
                wakil: 'Wakil Ketua Angkatan',
                sekretaris: 'Sekretaris Angkatan',
                bendahara: 'Bendahara Angkatan'
            };
            posts.push({ year: generation.year, title: assignment.title || titles[key] || key });
        });
        (generation.divisions || []).forEach((division) => {
            if (division.coordinatorOperatorId !== operator.id) return;
            posts.push({ year: generation.year, title: `Koordinator ${division.name}` });
        });
    });
    return posts;
}
