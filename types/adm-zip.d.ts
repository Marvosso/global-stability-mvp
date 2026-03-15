declare module "adm-zip" {
  interface ZipEntry {
    entryName: string;
    getData(): Buffer;
  }
  export default class AdmZip {
    constructor(buffer?: Buffer);
    getEntries(): ZipEntry[];
  }
}
