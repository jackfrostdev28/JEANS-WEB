export const SIZE_OPTIONS = ['S', 'M', 'L', 'XL'];

export const SIZE_ORDER = ['XS', 'S', 'M', 'L', 'XL', 'XXL', 'XXXL'];

export const getSizeSelectOptions = (currentSize = '') => {
  const normalized = currentSize?.trim();
  if (normalized && !SIZE_OPTIONS.includes(normalized)) {
    return [normalized, ...SIZE_OPTIONS];
  }
  return SIZE_OPTIONS;
};
