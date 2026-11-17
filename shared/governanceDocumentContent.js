const IMAGE_ASSET_PATH = /^\/api\/site\/assets\/[a-f0-9-]{36}\/file$/i;
const alignments = new Set(['left', 'center', 'right', 'justify']);
const listTypes = new Set(['decimal', 'lower-alpha', 'lower-roman']);
const marks = new Set(['bold', 'italic', 'underline', 'strike']);
const romanValues = new Map([
  ['i', 1], ['ii', 2], ['iii', 3], ['iv', 4], ['v', 5], ['vi', 6], ['vii', 7],
  ['viii', 8], ['ix', 9], ['x', 10], ['xi', 11], ['xii', 12], ['xiii', 13],
  ['xiv', 14], ['xv', 15], ['xvi', 16], ['xvii', 17], ['xviii', 18], ['xix', 19], ['xx', 20]
]);

const escapeHtml = (value) => String(value ?? '')
  .replaceAll('&', '&amp;')
  .replaceAll('<', '&lt;')
  .replaceAll('>', '&gt;')
  .replaceAll('"', '&quot;')
  .replaceAll("'", '&#39;');

const inlineText = (node) => (node.content || []).map((child) => {
  if (child.type === 'text') return child.text;
  if (child.type === 'hardBreak') return '\n';
  if (child.type === 'image') return child.attrs.alt || '';
  return '';
}).join('');

const romanNumeral = (value) => {
  const entries = [[10, 'x'], [9, 'ix'], [5, 'v'], [4, 'iv'], [1, 'i']];
  let remainder = value;
  let result = '';
  for (const [amount, numeral] of entries) {
    while (remainder >= amount) {
      result += numeral;
      remainder -= amount;
    }
  }
  return result;
};

const alphaNumeral = (value) => {
  let remainder = value;
  let result = '';
  while (remainder > 0) {
    remainder -= 1;
    result = String.fromCharCode(97 + (remainder % 26)) + result;
    remainder = Math.floor(remainder / 26);
  }
  return result;
};

const nodeText = (node) => {
  if (node.type === 'text') return node.text;
  if (node.type === 'hardBreak') return '\n';
  if (node.type === 'image') return node.attrs.alt || '';
  if (node.type === 'doc') return (node.content || []).map(nodeText).filter(Boolean).join('\n');
  if (node.type === 'paragraph' || node.type === 'heading') return inlineText(node);
  if (node.type === 'orderedList' || node.type === 'bulletList') {
    return (node.content || []).map((item, index) => {
      const value = (node.attrs?.start || 1) + index;
      const label = node.type === 'bulletList'
        ? '•'
        : node.attrs?.type === 'lower-alpha'
          ? `${alphaNumeral(value)}.`
          : node.attrs?.type === 'lower-roman'
            ? `${romanNumeral(value)}.`
            : `${value}.`;
      return `${label} ${nodeText(item)}`.trim();
    }).join('\n');
  }
  if (node.type === 'listItem') return (node.content || []).map(nodeText).filter(Boolean).join('\n');
  if (node.type === 'blockquote') return (node.content || []).map(nodeText).filter(Boolean).join('\n');
  return '';
};

const normalizeText = (value) => String(value ?? '')
  .replace(/\u00a0/g, ' ')
  .replace(/\s+/g, ' ')
  .trim();

const cleanLegacyText = (value) => normalizeText(value)
  .replace(/\bU\s+mun\b/gi, 'Umum')
  .replace(/\bM\s+ahasiswa\b/gi, 'Mahasiswa')
  .replace(/\s+BAB\s+(?:(?:I|V|X)\s*){1,6}\s+[A-Z][A-Z\s&/()-]*$/i, '')
  .replace(/^\d{1,2}\s+(?=\d{1,2}\.\s)/, '')
  .replace(/([.!?;:])\s*\d{1,3}\s+(?=(?:\d{1,2}|[a-z])\.\s)/gi, '$1 ');

const findListMarkers = (value) => {
  const markers = [];
  const pattern = /(^|[\s:;])(\d{1,2}|(?:xviii|xvii|xvi|xv|xiv|xiii|xii|xi|xx|ix|iv|viii|vii|vi|iii|ii|x|v|i|[a-z]))\.\s+/g;
  let match;
  while ((match = pattern.exec(value))) {
    if (/^\d+$/.test(match[2]) && value[match.index - 1] === '-') continue;
    const token = match[2].toLowerCase();
    const isNumber = /^\d+$/.test(token);
    const romanValue = romanValues.get(token);
    markers.push({
      index: match.index + match[1].length,
      contentIndex: pattern.lastIndex,
      token,
      kind: isNumber ? 'number' : romanValue && token.length > 1 ? 'roman' : 'alpha',
      value: isNumber ? Number(token) : romanValue && token.length > 1 ? romanValue : token
    });
  }
  markers.forEach((marker, index) => {
    if (marker.kind !== 'alpha' || !romanValues.has(marker.token)) return;
    const value = romanValues.get(marker.token);
    const followedByRoman = markers[index + 1]?.kind === 'roman' && markers[index + 1].value === value + 1;
    const precededByRoman = markers[index - 1]?.kind === 'roman' && markers[index - 1].value === value - 1;
    const previousAlpha = markers[index - 1];
    const next = markers[index + 1];
    const isNestedFirstRoman = marker.token === 'i'
      && previousAlpha?.kind === 'alpha'
      && previousAlpha.value !== 'h'
      && (next?.kind === 'number' && next.value === 1
        || next?.kind === 'alpha'
          && next.value === String.fromCharCode(previousAlpha.value.charCodeAt(0) + 1));
    if (followedByRoman || precededByRoman || isNestedFirstRoman) {
      marker.kind = 'roman';
      marker.value = value;
    }
  });
  return markers;
};

const getListMarkerDepths = (markers) => {
  if (!markers.length) return false;
  const first = markers[0];
  if (first.kind === 'number' && (first.value < 1 || first.value > 99)) return false;
  if (first.kind === 'alpha' && first.value !== 'a') return false;
  if (first.kind === 'roman' && first.value !== 1) return false;
  if (markers[0].index > 400) return false;
  if (markers.length === 1) {
    return markers[0].index <= 80 ? { depths: [0], validCount: 1 } : false;
  }
  let orderedValue = null;
  let nestedOrderedValue = null;
  let nestedOrderedDepth = null;
  let alphaValue = null;
  let romanValue = null;
  let previousKind = null;
  const depths = [];
  const partialResult = () => depths.length >= 2 ? { depths, validCount: depths.length } : false;
  for (const current of markers) {
    let depth;
    if (current.kind === 'number') {
      if (previousKind === 'roman' && current.value === 1) {
        depth = depths.at(-1) + 1;
        nestedOrderedDepth = depth;
        nestedOrderedValue = current.value;
      } else if (nestedOrderedDepth !== null && depths.at(-1) === nestedOrderedDepth
        && current.value === nestedOrderedValue + 1) {
        depth = nestedOrderedDepth;
        nestedOrderedValue = current.value;
      } else {
        if (orderedValue !== null && current.value !== orderedValue + 1) return partialResult();
        depth = 0;
        orderedValue = current.value;
        nestedOrderedDepth = null;
        nestedOrderedValue = null;
        alphaValue = null;
        romanValue = null;
      }
    } else if (current.kind === 'alpha') {
      const expected = alphaValue === null ? 'a' : String.fromCharCode(alphaValue.charCodeAt(0) + 1);
      if (current.value !== expected) return partialResult();
      depth = orderedValue === null ? 0 : 1;
      alphaValue = current.value;
      romanValue = null;
      nestedOrderedDepth = null;
      nestedOrderedValue = null;
    } else {
      const expected = romanValue === null ? 1 : romanValue + 1;
      if (current.value !== expected) return partialResult();
      depth = alphaValue !== null ? 2 : orderedValue === null ? 0 : 1;
      romanValue = current.value;
      nestedOrderedDepth = null;
      nestedOrderedValue = null;
    }
    depths.push(depth);
    previousKind = current.kind;
  }
  return { depths, validCount: depths.length };
};

const paragraph = (text) => ({
  type: 'paragraph',
  content: text ? [{ type: 'text', text }] : []
});

const parseLegacyBody = (text) => {
  const markers = findListMarkers(text);
  const sequence = getListMarkerDepths(markers);
  if (!sequence || (markers.length === 1 && text.slice(0, markers[0].index).trim() !== '')) {
    return { content: [paragraph(text)], heading: '' };
  }
  const validMarkers = markers.slice(0, sequence.validCount);

  const firstPrefix = text.slice(0, markers[0].index).trim();
  const isShortHeading = firstPrefix.length > 0
    && /[a-z]/i.test(firstPrefix)
    && firstPrefix.length <= 36
    && firstPrefix.split(/\s+/).length <= 4
    && !/[.!?:;]$/.test(firstPrefix);
  const heading = isShortHeading ? firstPrefix : '';
  const content = [];
  if (firstPrefix && !isShortHeading) content.push(paragraph(firstPrefix));

  const lastItemAtDepth = [];
  validMarkers.forEach((marker, index) => {
    const end = markers[index + 1]?.index ?? markers[sequence.validCount]?.index ?? text.length;
    const itemText = text.slice(marker.contentIndex, end).trim();
    const item = { type: 'listItem', content: [paragraph(itemText)] };
    const depth = sequence.depths[index];
    const type = marker.kind === 'number'
      ? 'decimal'
      : marker.kind === 'alpha'
        ? 'lower-alpha'
        : 'lower-roman';
    const parentItem = depth > 0 ? lastItemAtDepth[depth - 1] : null;
    const siblings = parentItem ? parentItem.content : content;
    let list = siblings.at(-1);
    if (!list || list.type !== 'orderedList' || list.attrs.type !== type) {
      const start = marker.kind === 'alpha' ? marker.value.charCodeAt(0) - 96 : marker.value;
      list = { type: 'orderedList', attrs: { type, start }, content: [] };
      siblings.push(list);
    }
    list.content.push(item);
    lastItemAtDepth[depth] = item;
    lastItemAtDepth.length = depth + 1;
  });
  if (sequence.validCount < markers.length) {
    content.push(paragraph(text.slice(markers[sequence.validCount].index).trim()));
  }
  return { content, heading };
};

export const parseLegacyGovernanceArticle = (article = {}) => {
  const pasal = String(article.pasal ?? '');
  let text = cleanLegacyText(article.content);
  const number = pasal.match(/^Pasal\s+(\d+)/i)?.[1];
  if (number) {
    text = text.replace(new RegExp('^Pasal\\s+' + number + '\\b\\s*', 'i'), '');
    if (number.length === 2) {
      text = text.replace(new RegExp('^' + number[0] + '\\s+' + number[1] + '(?=\\s)'), '');
    }
  }
  const parsed = parseLegacyBody(text);
  const suppliedHeading = normalizeText(article.heading);
  const heading = parsed.heading || (
    suppliedHeading && suppliedHeading !== normalizeText(article.content)
      ? suppliedHeading.replace(/^Pasal\s+\d+\s*/i, '').slice(0, 240)
      : ''
  );
  const document = { type: 'doc', content: parsed.content.length ? parsed.content : [paragraph('')] };
  return { heading, contentDocument: document, content: nodeText(document) };
};

const validateInlineContent = (content, label) => {
  if (!Array.isArray(content)) throw new Error(`${label} tidak valid.`);
  return content.map((node) => {
    if (node?.type === 'text') {
      if (typeof node.text !== 'string' || node.text.length > 100000) throw new Error(`${label} memuat teks yang tidak valid.`);
      const nodeMarks = node.marks ?? [];
      if (!Array.isArray(nodeMarks) || nodeMarks.some((mark) => !marks.has(mark?.type))) {
        throw new Error(`${label} memuat format teks yang tidak diizinkan.`);
      }
      return {
        type: 'text',
        text: node.text,
        ...(nodeMarks.length ? { marks: nodeMarks.map(({ type }) => ({ type })) } : {})
      };
    }
    if (node?.type === 'hardBreak') return { type: 'hardBreak' };
    if (node?.type === 'image') {
      if (typeof node.attrs?.src !== 'string' || !IMAGE_ASSET_PATH.test(node.attrs.src)) {
        throw new Error(`${label} hanya boleh memuat gambar yang diunggah ke penyimpanan situs.`);
      }
      const alt = String(node.attrs.alt ?? '');
      const title = String(node.attrs.title ?? '');
      if (alt.length > 240 || title.length > 240) throw new Error(`${label} memiliki keterangan gambar terlalu panjang.`);
      return { type: 'image', attrs: { src: node.attrs.src, alt, title } };
    }
    throw new Error(`${label} memuat elemen teks yang tidak diizinkan.`);
  });
};

const validateRichNode = (node, label, depth, counter) => {
  counter.count += 1;
  if (counter.count > 3000 || depth > 12 || !node || typeof node !== 'object' || Array.isArray(node)) {
    throw new Error(`${label} memiliki struktur terlalu besar atau tidak valid.`);
  }
  switch (node.type) {
    case 'doc':
      if (depth !== 0 || !Array.isArray(node.content)) throw new Error(`${label} tidak valid.`);
      return { type: 'doc', content: node.content.map((child) => validateRichNode(child, label, depth + 1, counter)) };
    case 'paragraph':
    case 'heading': {
      const result = { type: node.type, content: validateInlineContent(node.content ?? [], label) };
      if (node.type === 'heading') {
        if (![2, 3].includes(node.attrs?.level)) throw new Error(`${label} memiliki tingkat judul yang tidak valid.`);
        result.attrs = { level: node.attrs.level };
      }
      if (node.attrs?.textAlign !== undefined) {
        if (!alignments.has(node.attrs.textAlign)) throw new Error(`${label} memiliki perataan teks yang tidak valid.`);
        result.attrs = { ...result.attrs, textAlign: node.attrs.textAlign };
      }
      return result;
    }
    case 'bulletList':
      if (!Array.isArray(node.content)) throw new Error(`${label} memiliki daftar yang tidak valid.`);
      return { type: 'bulletList', content: node.content.map((child) => validateRichNode(child, label, depth + 1, counter)) };
    case 'orderedList':
      if (!Array.isArray(node.content) || !listTypes.has(node.attrs?.type ?? 'decimal')) {
        throw new Error(`${label} memiliki daftar bernomor yang tidak valid.`);
      }
      if (node.attrs?.start !== undefined && (!Number.isInteger(node.attrs.start) || node.attrs.start < 1 || node.attrs.start > 1000)) {
        throw new Error(`${label} memiliki nomor awal daftar yang tidak valid.`);
      }
      return {
        type: 'orderedList',
        attrs: { type: node.attrs?.type ?? 'decimal', start: node.attrs?.start ?? 1 },
        content: node.content.map((child) => validateRichNode(child, label, depth + 1, counter))
      };
    case 'listItem':
    case 'blockquote':
      if (!Array.isArray(node.content)) throw new Error(`${label} memiliki blok yang tidak valid.`);
      return { type: node.type, content: node.content.map((child) => validateRichNode(child, label, depth + 1, counter)) };
    case 'horizontalRule':
      return { type: 'horizontalRule' };
    case 'image': {
      if (typeof node.attrs?.src !== 'string' || !IMAGE_ASSET_PATH.test(node.attrs.src)) {
        throw new Error(`${label} hanya boleh memuat gambar yang diunggah ke penyimpanan situs.`);
      }
      const alt = String(node.attrs.alt ?? '');
      const title = String(node.attrs.title ?? '');
      if (alt.length > 240 || title.length > 240) throw new Error(`${label} memiliki keterangan gambar terlalu panjang.`);
      return { type: 'image', attrs: { src: node.attrs.src, alt, title } };
    }
    default:
      throw new Error(`${label} memuat blok yang tidak diizinkan.`);
  }
};

export const validateGovernanceContentDocument = (input, label = 'Isi pasal') => {
  if (new TextEncoder().encode(JSON.stringify(input ?? null)).length > 300 * 1024) {
    throw new Error(`${label} melebihi batas ukuran 300 KB.`);
  }
  return validateRichNode(input, label, 0, { count: 0 });
};

export const governanceDocumentText = (document) => nodeText(document);

const renderInline = (content = []) => content.map((node) => {
  if (node.type === 'hardBreak') return '<br>';
  let html = node.type === 'image'
    ? `<img src="${escapeHtml(node.attrs.src)}" alt="${escapeHtml(node.attrs.alt)}" title="${escapeHtml(node.attrs.title)}" loading="lazy">`
    : escapeHtml(node.text);
  for (const mark of node.marks || []) {
    const tag = { bold: 'strong', italic: 'em', underline: 'u', strike: 's' }[mark.type];
    html = `<${tag}>${html}</${tag}>`;
  }
  return html;
}).join('');

export const renderGovernanceContentHtml = (input) => {
  const document = input
    ? validateGovernanceContentDocument(input)
    : { type: 'doc', content: [paragraph('')] };
  const renderNode = (node) => {
    if (node.type === 'doc') return node.content.map(renderNode).join('');
    if (node.type === 'paragraph' || node.type === 'heading') {
      const tag = node.type === 'heading' ? `h${node.attrs.level}` : 'p';
      const align = node.attrs?.textAlign ? ` style="text-align:${node.attrs.textAlign}"` : '';
      return `<${tag}${align}>${renderInline(node.content)}</${tag}>`;
    }
    if (node.type === 'bulletList' || node.type === 'orderedList') {
      const tag = node.type === 'bulletList' ? 'ul' : 'ol';
      const type = node.type === 'orderedList' && node.attrs.type !== 'decimal'
        ? ` type="${node.attrs.type === 'lower-alpha' ? 'a' : 'i'}"`
        : '';
      const start = node.type === 'orderedList' && node.attrs.start > 1
        ? ` start="${node.attrs.start}"`
        : '';
      return `<${tag}${type}${start}>${node.content.map(renderNode).join('')}</${tag}>`;
    }
    if (node.type === 'listItem' || node.type === 'blockquote') {
      const tag = node.type === 'listItem' ? 'li' : 'blockquote';
      return `<${tag}>${node.content.map(renderNode).join('')}</${tag}>`;
    }
    if (node.type === 'horizontalRule') return '<hr>';
    if (node.type === 'image') {
      return `<img src="${escapeHtml(node.attrs.src)}" alt="${escapeHtml(node.attrs.alt)}" title="${escapeHtml(node.attrs.title)}" loading="lazy">`;
    }
    return '';
  };
  return renderNode(document);
};

export const governanceDocumentReferencesAsset = (documents, assetId) => {
  return governanceDocumentAssetIds(documents).includes(assetId);
};

export const governanceDocumentAssetIds = (documents) => {
  const assetIds = new Set();
  const visit = (node) => {
    if (node?.type === 'image' && typeof node.attrs?.src === 'string') {
      const match = node.attrs.src.match(IMAGE_ASSET_PATH);
      if (match) assetIds.add(node.attrs.src.split('/')[4]);
    }
    if (Array.isArray(node?.content)) node.content.forEach(visit);
  };
  for (const chapter of Array.isArray(documents) ? documents : []) {
    for (const article of chapter.pasalList || []) visit(article.contentDocument);
  }
  return [...assetIds];
};
