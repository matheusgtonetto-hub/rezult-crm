// opus-recorder não publica tipos. Declaração mínima com o que o app usa:
// grava direto em Ogg/Opus (o WhatsApp só reproduz nota de voz nesse
// formato — MediaRecorder nativo produz WebM/Opus, que chega mas não toca).
declare module "opus-recorder" {
  interface RecorderConfig {
    encoderPath?: string;
    mediaTrackConstraints?: boolean | MediaTrackConstraints;
    numberOfChannels?: number;
    encoderSampleRate?: number;
  }

  export default class Recorder {
    constructor(config?: RecorderConfig);
    ondataavailable: (arrayBuffer: ArrayBuffer) => void;
    onstart?: () => void;
    onstop?: () => void;
    start(): Promise<void>;
    stop(): void;
    close(): void;
    static isRecordingSupported(): boolean;
  }
}
