import { normalizeKeyEvent, isBackEvent } from "../sharedKeys.js";

const BACK_KEY_CODES = [461, 10009, 27, 8];

function postToNativeShell(message) {
  try {
    globalThis.ReactNativeWebView?.postMessage?.(JSON.stringify(message));
  } catch (_) {
    // The native bridge is absent when previewing the build in a plain browser; ignore.
  }
}

export const vegaAdapter = {
  name: "vega",

  init() {},

  exitApp() {
    postToNativeShell({ type: "exitApp" });
  },

  isBackEvent(event) {
    return isBackEvent(event, BACK_KEY_CODES);
  },

  normalizeKey(event) {
    return normalizeKeyEvent(event, BACK_KEY_CODES);
  },

  getDeviceLabel() {
    return "Fire TV (Vega)";
  },

  getCapabilities() {
    return {
      hlsJs: Boolean(globalThis.Hls?.isSupported?.()),
      dashJs: Boolean(globalThis.dashjs?.MediaPlayer),
      nativeVideo: true,
      webosAvplay: false,
      tizenAvplay: false
    };
  },

  prepareVideoElement() {}
};
