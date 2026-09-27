import {WebView} from '@amazon-devices/webview';
import * as React from 'react';
import {useEffect, useRef} from 'react';
import {BackHandler, View, StyleSheet} from 'react-native';
import {
  useHideSplashScreenCallback,
  usePreventHideSplashScreen,
} from '@amazon-devices/react-native-kepler';
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
    var evt = new KeyboardEvent("keydown", { bubbles: true, cancelable: true });
    Object.defineProperty(evt, "keyCode", { get: function () { return 461; } });
    Object.defineProperty(evt, "which", { get: function () { return 461; } });
    document.dispatchEvent(evt);
  } catch (error) {
    console.error("[vega back-key injection] failed:", error);
  }
})();
true;
`;

export const App = () => {
  const webRef = useRef<WebViewMethods>(null);
  // By default splash screen is shown in app launch, as the splash
  // screen images are bundled in this app (assets/raw/ folder)
  // Declare that application wants to extend splash screen lifecycle
  usePreventHideSplashScreen();
  const hideSplashScreenCallback = useHideSplashScreenCallback();
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
  return (
    <View style={styles.container}>
      <WebView
        ref={webRef}
        style={styles.webview}
        allowSystemKeyEvents
        allowsDefaultMediaControl
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
