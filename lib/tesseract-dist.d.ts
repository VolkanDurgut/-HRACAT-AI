// Tesseract tarayici paketi (lib/cuval-ocr.ts): yalniz varsayilan disa aktarim var; tipler ana paketten.
declare module "tesseract.js/dist/tesseract.esm.min.js" {
  const Tesseract: typeof import("tesseract.js");
  export default Tesseract;
}
