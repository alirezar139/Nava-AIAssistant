declare module 'mammoth/mammoth.browser' {
  export interface MammothMessage {
    type: string;
    message: string;
  }

  export interface RawTextResult {
    value: string;
    messages: MammothMessage[];
  }

  export function extractRawText(input: { arrayBuffer: ArrayBuffer }): Promise<RawTextResult>;
}
