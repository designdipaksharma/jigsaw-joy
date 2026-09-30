/**
 * Type declarations for the official YouTube Playables SDK, transcribed from
 * https://www.youtube.com/playablesportal/static/youtube_ytgame_web_deploy_mpm_files/index.d.ts
 * (Copyright 2024 Google LLC, Apache-2.0). Only the members this game uses are
 * declared; names and signatures match the official definitions.
 * The SDK is loaded by <script src="https://www.youtube.com/game_api/v1">
 * (injected only in the `playables` build — see vite.config.ts).
 */
declare global {
  interface YtGameSdk {
    SDK_VERSION: string;
    IN_PLAYABLES_ENV: boolean;
    game: {
      firstFrameReady(): void;
      gameReady(): void;
      loadData(): Promise<string>;
      saveData(data: string): Promise<void>;
    };
    system: {
      isAudioEnabled(): boolean;
      onAudioEnabledChange(callback: (isAudioEnabled: boolean) => void): () => void;
      onPause(callback: () => void): () => void;
      onResume(callback: () => void): () => void;
      getLanguage(): Promise<string>;
    };
    engagement: {
      sendScore(score: { value: number }): Promise<void>;
    };
    health: {
      logError(): void;
      logWarning(): void;
    };
  }
  interface Window {
    ytgame?: YtGameSdk;
  }
}
export {};
