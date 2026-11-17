import {
  governanceDocumentText,
  parseLegacyGovernanceArticle,
  validateGovernanceContentDocument
} from '../shared/governanceDocumentContent.js';

export class GovernanceDocumentValidationError extends Error {
  constructor(message) {
    super(message);
    this.name = 'GovernanceDocumentValidationError';
  }
}

const text = (value, { label, maxLength, required = false }) => {
  if (typeof value !== 'string' || value.length > maxLength || (required && !value.trim())) {
    throw new GovernanceDocumentValidationError(`${label} tidak valid.`);
  }
  return value;
};

export const validateGovernanceDocuments = (input) => {
  if (!Array.isArray(input) || input.length === 0 || input.length > 80) {
    throw new GovernanceDocumentValidationError('Naskah harus berisi 1 sampai 80 bab.');
  }
  let totalArticles = 0;
  const documents = input.map((chapter, chapterIndex) => {
    if (!chapter || typeof chapter !== 'object' || Array.isArray(chapter) || !Array.isArray(chapter.pasalList)) {
      throw new GovernanceDocumentValidationError(`Struktur bab ${chapterIndex + 1} tidak valid.`);
    }
    if (chapter.pasalList.length === 0 || chapter.pasalList.length > 100) {
      throw new GovernanceDocumentValidationError(`Bab ${chapterIndex + 1} harus berisi 1 sampai 100 pasal.`);
    }
    totalArticles += chapter.pasalList.length;
    if (totalArticles > 1000) throw new GovernanceDocumentValidationError('Naskah tidak boleh berisi lebih dari 1.000 pasal.');
    const bab = text(chapter.bab, { label: `Nama bab ${chapterIndex + 1}`, maxLength: 120, required: true });
    const title = text(chapter.title, { label: `Judul bab ${chapterIndex + 1}`, maxLength: 240, required: true });
    return {
      bab,
      title,
      pasalList: chapter.pasalList.map((article, articleIndex) => {
        const label = `Pasal ${articleIndex + 1} pada bab ${chapterIndex + 1}`;
        if (!article || typeof article !== 'object' || Array.isArray(article)) {
          throw new GovernanceDocumentValidationError(`${label} tidak valid.`);
        }
        const pasal = text(article.pasal, { label: `${label}: nomor`, maxLength: 120, required: true });
        let heading;
        let contentDocument;
        if (article.contentDocument === undefined) {
          const legacyContent = text(article.content, { label: `${label}: isi`, maxLength: 100000, required: true });
          const legacy = parseLegacyGovernanceArticle({ ...article, content: legacyContent });
          heading = legacy.heading;
          contentDocument = legacy.contentDocument;
        } else {
          heading = article.heading === undefined
            ? ''
            : text(article.heading, { label: `${label}: judul`, maxLength: 240 });
          try {
            contentDocument = validateGovernanceContentDocument(article.contentDocument, `${label}: isi`);
          } catch (error) {
            throw new GovernanceDocumentValidationError(error.message);
          }
        }
        const content = governanceDocumentText(contentDocument);
        if (content.length > 100000 || !content.trim()) {
          throw new GovernanceDocumentValidationError(`${label}: isi tidak valid.`);
        }
        return { pasal, heading, content, contentDocument };
      })
    };
  });
  if (Buffer.byteLength(JSON.stringify(documents), 'utf8') > 900 * 1024) {
    throw new GovernanceDocumentValidationError('Ukuran naskah melebihi batas 900 KB.');
  }
  return documents;
};

export const validateGovernanceDocumentTitle = (value) => text(value, {
  label: 'Nama forum MUBES',
  maxLength: 150,
  required: true
}).trim();

export const validateGovernanceDocumentNote = (value, label = 'Catatan') => {
  if (value === undefined) return '';
  return text(value, { label, maxLength: 500 }).trim();
};
