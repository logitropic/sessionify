import stringWidth from 'string-width';

const graphemeSegmenter = new Intl.Segmenter(undefined, { granularity: 'grapheme' });

export function truncateToWidth(text: string, maxWidth: number): string {
  if (maxWidth <= 0) {
    return '';
  }

  if (stringWidth(text) <= maxWidth) {
    return text;
  }

  if (maxWidth === 1) {
    return '…';
  }

  let width = 0;
  let result = '';
  for (const { segment } of graphemeSegmenter.segment(text)) {
    const segmentWidth = stringWidth(segment);
    if (width + segmentWidth > maxWidth - 1) {
      break;
    }

    result += segment;
    width += segmentWidth;
  }

  return `${result}…`;
}

export function fitSingleLine(text: string, maxWidth: number): string {
  return truncateToWidth(text.replace(/\r?\n/g, ' '), maxWidth);
}

export function clamp(value: number, min: number, max: number): number {
  return Math.min(Math.max(value, min), max);
}
