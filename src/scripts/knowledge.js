const normalizedValue = (value) => String(value ?? '').trim().toLocaleLowerCase('id');

export const getKnowledgeLecturers = (resources) => {
  const lecturers = new Map();
  for (const resource of resources) {
    const lecturer = String(resource.lecturer ?? '').trim();
    const key = normalizedValue(lecturer);
    if (key && !lecturers.has(key)) lecturers.set(key, lecturer);
  }
  return [...lecturers.values()].sort((first, second) => first.localeCompare(second, 'id', { sensitivity: 'base' }));
};

export const filterKnowledgeResources = (resources, filters = {}) => {
  const query = normalizedValue(filters.query);
  const lecturer = normalizedValue(filters.lecturer);
  return resources.filter((resource) => {
    const searchable = [
      resource.title,
      resource.course,
      resource.lecturer,
      resource.academicYear,
      resource.examType,
      resource.summary,
      ...(resource.tags || [])
    ].join(' ').toLocaleLowerCase('id');
    return (!query || searchable.includes(query))
      && (!filters.course || filters.course === 'all' || resource.course === filters.course)
      && (!filters.semester || filters.semester === 'all' || resource.semester === filters.semester)
      && (!lecturer || filters.lecturer === 'all' || normalizedValue(resource.lecturer) === lecturer)
      && (!filters.kind || filters.kind === 'all' || resource.kind === filters.kind);
  });
};
