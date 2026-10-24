/** Accent-insensitive text for matching ("truong" finds "Trường học"); shared by the combobox, the palette and list filters. */
export function stripAccents(text: string) {
  return text.normalize("NFD").replace(/[̀-ͯ]/g, "").replace(/đ/g, "d").replace(/Đ/g, "D").toLowerCase();
}
