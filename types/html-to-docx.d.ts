declare module "html-to-docx" {
  /**
   * HTML → .docx (Word) 二进制转换。
   * 入参为完整 HTML 字符串(建议包含 <meta charset="utf-8">),
   * 返回 Node Buffer。无官方类型,此处按实际 API 声明。
   */
  const htmlToDocx: (
    html: string,
    header?: string | Buffer | null,
    footer?: string | Buffer | null,
    options?: Record<string, unknown>,
  ) => Promise<Buffer>;

  export default htmlToDocx;
}
