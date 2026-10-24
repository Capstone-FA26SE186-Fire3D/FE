/**
 * Client-side suggestions for the address Comboboxes. BE stores `city` and `district` as free strings, so these lists
 * only help typing: the 34 provinces/cities in force since 1/7/2025, and district names still used in postal addresses
 * for the five centrally governed cities (the district tier was abolished, but addresses keep using them). Anything
 * not listed can be typed as-is ("Khác…").
 */
export type Province = { code: string; name: string; districts: string[] };

export const provinces: Province[] = [
  { code: "HN", name: "Hà Nội", districts: ["Ba Đình", "Hoàn Kiếm", "Tây Hồ", "Long Biên", "Cầu Giấy", "Đống Đa", "Hai Bà Trưng", "Hoàng Mai", "Thanh Xuân", "Hà Đông", "Nam Từ Liêm", "Bắc Từ Liêm", "Sơn Tây", "Ba Vì", "Chương Mỹ", "Đan Phượng", "Đông Anh", "Gia Lâm", "Hoài Đức", "Mê Linh", "Mỹ Đức", "Phú Xuyên", "Phúc Thọ", "Quốc Oai", "Sóc Sơn", "Thạch Thất", "Thanh Oai", "Thanh Trì", "Thường Tín", "Ứng Hòa"] },
  { code: "HCM", name: "TP. Hồ Chí Minh", districts: ["Quận 1", "Quận 3", "Quận 4", "Quận 5", "Quận 6", "Quận 7", "Quận 8", "Quận 10", "Quận 11", "Quận 12", "Bình Tân", "Bình Thạnh", "Gò Vấp", "Phú Nhuận", "Tân Bình", "Tân Phú", "Thủ Đức", "Bình Chánh", "Cần Giờ", "Củ Chi", "Hóc Môn", "Nhà Bè"] },
  { code: "DN", name: "Đà Nẵng", districts: ["Hải Châu", "Thanh Khê", "Sơn Trà", "Ngũ Hành Sơn", "Liên Chiểu", "Cẩm Lệ", "Hòa Vang"] },
  { code: "HP", name: "Hải Phòng", districts: ["Hồng Bàng", "Lê Chân", "Ngô Quyền", "Kiến An", "Hải An", "Đồ Sơn", "Dương Kinh", "An Dương", "An Lão", "Kiến Thụy", "Tiên Lãng", "Vĩnh Bảo", "Thủy Nguyên", "Cát Hải"] },
  { code: "CT", name: "Cần Thơ", districts: ["Ninh Kiều", "Bình Thủy", "Cái Răng", "Ô Môn", "Thốt Nốt", "Phong Điền", "Cờ Đỏ", "Thới Lai", "Vĩnh Thạnh"] },
  { code: "HUE", name: "Huế", districts: [] },
  { code: "LCH", name: "Lai Châu", districts: [] },
  { code: "DB", name: "Điện Biên", districts: [] },
  { code: "SL", name: "Sơn La", districts: [] },
  { code: "LS", name: "Lạng Sơn", districts: [] },
  { code: "QN", name: "Quảng Ninh", districts: [] },
  { code: "TH", name: "Thanh Hóa", districts: [] },
  { code: "NA", name: "Nghệ An", districts: [] },
  { code: "HT", name: "Hà Tĩnh", districts: [] },
  { code: "CB", name: "Cao Bằng", districts: [] },
  { code: "TQ", name: "Tuyên Quang", districts: [] },
  { code: "LCA", name: "Lào Cai", districts: [] },
  { code: "TN", name: "Thái Nguyên", districts: [] },
  { code: "PT", name: "Phú Thọ", districts: [] },
  { code: "BN", name: "Bắc Ninh", districts: [] },
  { code: "HY", name: "Hưng Yên", districts: [] },
  { code: "NB", name: "Ninh Bình", districts: [] },
  { code: "QT", name: "Quảng Trị", districts: [] },
  { code: "QNG", name: "Quảng Ngãi", districts: [] },
  { code: "GL", name: "Gia Lai", districts: [] },
  { code: "KH", name: "Khánh Hòa", districts: [] },
  { code: "LD", name: "Lâm Đồng", districts: [] },
  { code: "DL", name: "Đắk Lắk", districts: [] },
  { code: "DNA", name: "Đồng Nai", districts: [] },
  { code: "TNI", name: "Tây Ninh", districts: [] },
  { code: "VL", name: "Vĩnh Long", districts: [] },
  { code: "DT", name: "Đồng Tháp", districts: [] },
  { code: "CM", name: "Cà Mau", districts: [] },
  { code: "AG", name: "An Giang", districts: [] },
];

export const provinceNames = provinces.map((province) => province.name);

export function districtsOf(provinceName: string): string[] {
  return provinces.find((province) => province.name === provinceName)?.districts ?? [];
}
