const cleanText = (value, field, limit, required = false) => {
  if (typeof value !== 'string' || value.length > limit || (required && !value.trim())) {
    throw new Error(`${field} wajib diisi dan maksimal ${limit} karakter.`);
  }
  return value.trim();
};

const normalizeHttpsUrl = (value, field, optional = true) => {
  if (optional && (value === undefined || value === null || value === '')) return '';
  if (typeof value !== 'string' || value.length > 2000) throw new Error(`${field} tidak valid.`);
  let url;
  try {
    url = new URL(value);
  } catch {
    throw new Error(`${field} harus berupa URL HTTPS.`);
  }
  if (url.protocol !== 'https:' || url.username || url.password) throw new Error(`${field} harus HTTPS dan tidak boleh memuat kredensial.`);
  return url.toString();
};

export const extractGithubRepository = (value) => {
  const url = normalizeHttpsUrl(value, 'URL GitHub', false);
  const match = /^https:\/\/github\.com\/([A-Za-z0-9-]+)\/([A-Za-z0-9_.-]+)\/?$/.exec(url);
  if (!match || match[2] === '.' || match[2] === '..') throw new Error('URL repositori harus berupa repositori publik GitHub owner/repo.');
  return { owner: match[1], repo: match[2].replace(/\.git$/i, '') };
};

export const normalizeYoutubeEmbedUrl = (value) => {
  if (value === undefined || value === null || value === '') return '';
  const url = normalizeHttpsUrl(value, 'URL video');
  const host = new URL(url).hostname.toLowerCase();
  const parsed = new URL(url);
  let videoId = '';
  if (host === 'youtu.be') videoId = parsed.pathname.slice(1);
  else if (['youtube.com', 'www.youtube.com', 'm.youtube.com'].includes(host)) {
    videoId = parsed.pathname === '/watch' ? parsed.searchParams.get('v') || '' : parsed.pathname.split('/')[2] || '';
  }
  if (!/^[A-Za-z0-9_-]{11}$/.test(videoId)) throw new Error('URL video harus mengarah ke video YouTube yang valid.');
  return `https://www.youtube-nocookie.com/embed/${videoId}`;
};

export const validateTechArticle = (input = {}) => {
  if (input.public_author_consent !== true) throw new Error('Persetujuan publikasi nama penulis wajib dikonfirmasi.');
  const tags = input.tags ?? [];
  if (!Array.isArray(tags) || tags.length > 8 || tags.some((tag) => typeof tag !== 'string' || tag.length > 40)) {
    throw new Error('Tag artikel maksimal 8 item dan 40 karakter per item.');
  }
  const body = cleanText(input.body, 'Isi artikel', 12000, true);
  if (body.length < 300) throw new Error('Isi artikel minimal 300 karakter.');
  return {
    title: cleanText(input.title, 'Judul artikel', 160, true),
    summary: cleanText(input.summary, 'Ringkasan artikel', 500, true),
    category: cleanText(input.category, 'Kategori artikel', 80, true),
    body,
    source_url: normalizeHttpsUrl(input.source_url, 'URL referensi'),
    tags: [...new Set(tags.map((tag) => tag.trim()).filter(Boolean))]
  };
};

export const validateProjectCall = (input = {}) => {
  if (input.public_owner_consent !== true) throw new Error('Persetujuan publikasi nama pemilik open project wajib dikonfirmasi.');
  const allowedTypes = ['Gemastik', 'PKM', 'Hackathon', 'Lomba lainnya', 'Proyek komersial', 'Riset'];
  const roles = input.roles ?? [];
  if (!Array.isArray(roles) || roles.length < 1 || roles.length > 8
    || roles.some((role) => typeof role !== 'string' || !role.trim() || role.length > 80)) {
    throw new Error('Cantumkan 1-8 peran tim, maksimal 80 karakter per peran.');
  }
  const type = cleanText(input.type, 'Jenis kegiatan', 40, true);
  if (!allowedTypes.includes(type)) throw new Error('Jenis kegiatan tidak valid.');
  const deadline = cleanText(input.deadline, 'Tenggat pendaftaran', 10, true);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(deadline)
    || Number.isNaN(Date.parse(`${deadline}T00:00:00Z`))
    || new Date(`${deadline}T00:00:00Z`).toISOString().slice(0, 10) !== deadline) {
    throw new Error('Tanggal tenggat tidak valid.');
  }
  return {
    title: cleanText(input.title, 'Judul open project', 160, true),
    type,
    event_name: cleanText(input.event_name, 'Nama lomba/proyek', 120, true),
    description: cleanText(input.description, 'Deskripsi', 1200, true),
    roles: [...new Set(roles.map((role) => role.trim()))],
    deadline,
    commitment: cleanText(input.commitment, 'Komitmen waktu', 120)
  };
};

export const validateProjectCallApplication = (input = {}, availableRoles = []) => {
  const role = cleanText(input.role, 'Peran yang diminati', 80, true);
  if (!availableRoles.includes(role)) throw new Error('Peran yang dipilih tidak tersedia pada open project ini.');
  return {
    role,
    message: cleanText(input.message, 'Pesan untuk pemilik proyek', 800, true)
  };
};