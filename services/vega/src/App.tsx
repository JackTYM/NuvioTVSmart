import {WebView} from '@amazon-devices/webview';
import * as React from 'react';
import {useEffect, useMemo, useRef} from 'react';
import {BackHandler, View, StyleSheet} from 'react-native';
import {
  useHideSplashScreenCallback,
  usePreventHideSplashScreen,
  useKeplerAppStateManager,
} from '@amazon-devices/react-native-kepler';
import {
  Action,
  IMediaControlHandlerAsync,
  IMediaMetadata,
  IMediaSessionId,
  ITimeValue,
  ITrack,
  MediaControlServerComponentAsync,
  MediaSessionState,
  RepeatMode,
} from '@amazon-devices/kepler-media-controls';
import {MediaId} from '@amazon-devices/kepler-media-types';
import {
  SslErrorData,
  WebViewErrorEvent,
  WebViewHttpErrorEvent,
  WebViewMessageEvent,
  WebViewMethods,
  WebViewNavigationEvent,
} from '@amazon-devices/webview/dist/types/WebViewTypes';

const INJECT_BACK_KEY_JS = `
(function () {
  try {
    // The web app's own back-key handling (js/ui/navigation/focusEngine.js)
    // latches a "back" key identity on keydown and only clears it on a
    // matching keyup. Dispatching keydown alone would permanently block
    // every back press after the first one for the rest of the session.
    function dispatchBackKey(type) {
      var evt = new KeyboardEvent(type, { bubbles: true, cancelable: true });
      Object.defineProperty(evt, "keyCode", { get: function () { return 461; } });
      Object.defineProperty(evt, "which", { get: function () { return 461; } });
      document.dispatchEvent(evt);
    }
    dispatchBackKey("keydown");
    dispatchBackKey("keyup");
  } catch (error) {
    console.error("[vega back-key injection] failed:", error);
  }
})();
true;
`;

// Matches js/i18n's sharedKeys.js media key codes (the same ones Tizen
// registers via tvinputdevice.registerKeyBatch for its own hardware remote),
// so the web app's existing media-key handling in the player screen just
// works without any web-side changes.
const MEDIA_KEY_CODES = {
  mediaPlayPause: 10252,
  mediaPlay: 415,
  mediaPause: 19,
  mediaStop: 413,
  mediaFastForward: 417,
  mediaRewind: 412,
  mediaTrackNext: 176,
  mediaTrackPrevious: 177,
} as const;

function buildInjectMediaKeyJS(keyCode: number): string {
  return `
(function () {
  try {
    function dispatchMediaKey(type) {
      var evt = new KeyboardEvent(type, { bubbles: true, cancelable: true });
      Object.defineProperty(evt, "keyCode", { get: function () { return ${keyCode}; } });
      Object.defineProperty(evt, "which", { get: function () { return ${keyCode}; } });
      document.dispatchEvent(evt);
    }
    dispatchMediaKey("keydown");
    dispatchMediaKey("keyup");
  } catch (error) {
    console.error("[vega media-key injection] failed:", error);
  }
})();
true;
`;
}

export const App = () => {
  const webRef = useRef<WebViewMethods>(null);
  // By default splash screen is shown in app launch, as the splash
  // screen images are bundled in this app (assets/raw/ folder)
  // Declare that application wants to extend splash screen lifecycle
  usePreventHideSplashScreen();
  const hideSplashScreenCallback = useHideSplashScreenCallback();
  const appStateManager = useKeplerAppStateManager();

  useEffect(() => {
    const subscription = BackHandler.addEventListener(
      'hardwareBackPress',
      () => {
        if (webRef.current) {
          webRef.current.injectJavaScript(INJECT_BACK_KEY_JS);
          return true;
        }
        BackHandler.exitApp();
        return true;
      },
    );
    return () => subscription.remove();
  }, []);

  // Vega's default media control overlay (allowsDefaultMediaControl) renders
  // its own transport UI with a broken/missing play icon on this SDK, so we
  // disable it and register our own handler covering only the commands that
  // map to something real: the physical remote's Play/Pause and the same
  // media keys Tizen already wires up for its own hardware remote. Anything
  // this app has no equivalent for (shuffle, repeat, rating, next/previous
  // track, precise seek/volume) is a safe no-op rather than invented
  // behavior -- our own in-app player controls remain fully independent of
  // this native surface and are unaffected either way.
  const mediaControlsHandler: IMediaControlHandlerAsync =
    useMemo((): IMediaControlHandlerAsync => {
      const injectMediaKey = (keyCode: number) => {
        webRef.current?.injectJavaScript(buildInjectMediaKeyJS(keyCode));
      };
      const noop = () => Promise.resolve();
      return {
        handlePlay: (_sessionId?: IMediaSessionId) => {
          injectMediaKey(MEDIA_KEY_CODES.mediaPlay);
          return Promise.resolve();
        },
        handlePause: (_sessionId?: IMediaSessionId) => {
          injectMediaKey(MEDIA_KEY_CODES.mediaPause);
          return Promise.resolve();
        },
        handleTogglePlayPause: (_sessionId?: IMediaSessionId) => {
          injectMediaKey(MEDIA_KEY_CODES.mediaPlayPause);
          return Promise.resolve();
        },
        handleStop: (_sessionId?: IMediaSessionId) => {
          injectMediaKey(MEDIA_KEY_CODES.mediaStop);
          return Promise.resolve();
        },
        handleStartOver: noop,
        handleFastForward: (_sessionId?: IMediaSessionId) => {
          injectMediaKey(MEDIA_KEY_CODES.mediaFastForward);
          return Promise.resolve();
        },
        handleRewind: (_sessionId?: IMediaSessionId) => {
          injectMediaKey(MEDIA_KEY_CODES.mediaRewind);
          return Promise.resolve();
        },
        handleSetPlaybackSpeed: (
          _speed: number,
          _sessionId?: IMediaSessionId,
        ) => noop(),
        handleSkipForward: (
          _delta: ITimeValue,
          _sessionId?: IMediaSessionId,
        ) => {
          injectMediaKey(MEDIA_KEY_CODES.mediaFastForward);
          return Promise.resolve();
        },
        handleSkipBackward: (
          _delta: ITimeValue,
          _sessionId?: IMediaSessionId,
        ) => {
          injectMediaKey(MEDIA_KEY_CODES.mediaRewind);
          return Promise.resolve();
        },
        handleSeek: (_position: ITimeValue, _sessionId?: IMediaSessionId) =>
          noop(),
        handleSetAudioVolume: (_volume: number, _sessionId?: IMediaSessionId) =>
          noop(),
        handleSetAudioTrack: (
          _audioTrack: ITrack,
          _sessionId?: IMediaSessionId,
        ) => noop(),
        handleEnableTextTrack: (
          _textTrack: ITrack,
          _sessionId?: IMediaSessionId,
        ) => noop(),
        handleDisableTextTrack: (_sessionId?: IMediaSessionId) => noop(),
        handleNext: (_sessionId?: IMediaSessionId) => {
          injectMediaKey(MEDIA_KEY_CODES.mediaTrackNext);
          return Promise.resolve();
        },
        handlePrevious: (_sessionId?: IMediaSessionId) => {
          injectMediaKey(MEDIA_KEY_CODES.mediaTrackPrevious);
          return Promise.resolve();
        },
        handleEnableShuffle: (_enable: boolean, _sessionId?: IMediaSessionId) =>
          noop(),
        handleSetRepeatMode: (
          _mode: RepeatMode,
          _sessionId?: IMediaSessionId,
        ) => noop(),
        handleSetRating: (
          _id: MediaId,
          _rating: number,
          _sessionId?: IMediaSessionId,
        ) => noop(),
        handleGetMetadataInfo: (id: MediaId): Promise<IMediaMetadata> =>
          Promise.resolve({mediaId: id, artwork: []}),
        handleCustomAction: (_action: Action, _sessionId?: IMediaSessionId) =>
          noop(),
        handleGetSessionState: (
          _sessionId?: IMediaSessionId,
        ): Promise<MediaSessionState[]> => Promise.resolve([]),
      };
    }, []);

  useEffect(() => {
    const mediaControlServer =
      MediaControlServerComponentAsync.getOrMakeServer();
    mediaControlServer.setHandlerForComponent(
      mediaControlsHandler,
      appStateManager.getComponentInstance(),
    );
  }, [appStateManager, mediaControlsHandler]);

  return (
    <View style={styles.container}>
      <WebView
        ref={webRef}
        style={styles.webview}
        allowSystemKeyEvents
        allowsDefaultMediaControl={false}
        domStorageEnabled
        hasTVPreferredFocus
        javaScriptEnabled
        mediaPlaybackRequiresUserAction={false}
        mixedContentMode="compatibility"
        // thirdPartyCookiesEnabled
        // userAgent={''}
        source={{
          // headers: {},
          uri: 'file:///pkg/assets/www/index.html',
        }}
        onLoad={(_event: WebViewNavigationEvent) => {
          console.info('Page loading completed...');
          // Hide the splash screen
          hideSplashScreenCallback();
        }}
        onLoadStart={(_event: WebViewNavigationEvent) => {
          console.info('Page loading started...');
        }}
        onError={({
          nativeEvent: {code, url, description},
        }: WebViewErrorEvent) => {
          console.error(`[onError]: (${code}: ${url}) ${description}`);
        }}
        onHttpError={({
          nativeEvent: {url, statusCode: code, description, isMainFrame},
        }: WebViewHttpErrorEvent) => {
          console.error(`[onHttpError]: (${code}: ${url}) ${description}`);
          console.error(`[onHttpError]: isMainFrame: ${isMainFrame}`);
        }}
        onSslError={({code, url, description}: SslErrorData) => {
          console.error(`[onSslError]: (${code}: ${url}) ${description}`);
        }}
        onMessage={(event: WebViewMessageEvent) => {
          let payload: unknown;
          try {
            payload = JSON.parse(event.nativeEvent.data);
          } catch (error) {
            console.error(
              `[onMessage]: failed to parse bridge message: ${error}`,
            );
            return;
          }
          const type = (payload as {type?: unknown})?.type;
          if (type === 'exitApp') {
            BackHandler.exitApp();
            return;
          }
          console.info(
            `[onMessage]: unhandled bridge message type: ${String(type)}`,
          );
        }}
      />
    </View>
  );
};

// Styles for layout, which are necessary for proper focus behavior
const styles = StyleSheet.create({
  container: {flex: 1},
  webview: {backgroundColor: '#000000'},
});
