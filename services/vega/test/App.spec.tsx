import * as React from 'react';
import {render} from '@testing-library/react-native';
import {App} from '../src/App';

const mockAddEventListener = jest.fn(
  (_eventName: string, _handler: () => boolean) => ({
    remove: jest.fn(),
  }),
);
const mockExitApp = jest.fn();
const mockInjectJavaScript = jest.fn((_script: string) => undefined);
const mockWebViewProps: {
  onMessage?: (event: {nativeEvent: {data: string}}) => void;
} = {};

jest.mock('@amazon-devices/webview', () => {
  const react = require('react');
  return {
    WebView: react.forwardRef(
      (
        props: {onMessage?: (event: {nativeEvent: {data: string}}) => void},
        ref: React.Ref<{injectJavaScript: (script: string) => void}>,
      ) => {
        mockWebViewProps.onMessage = props.onMessage;
        react.useImperativeHandle(ref, () => ({
          injectJavaScript: (script: string) => mockInjectJavaScript(script),
        }));
        return null;
      },
    ),
  };
});

jest.mock('@amazon-devices/react-native-kepler', () => ({
  usePreventHideSplashScreen: jest.fn(),
  useHideSplashScreenCallback: jest.fn(() => jest.fn()),
  StyleSheet: {create: (styles: unknown) => styles},
  View: 'View',
  BackHandler: {
    addEventListener: (eventName: string, handler: () => boolean) =>
      mockAddEventListener(eventName, handler),
    exitApp: () => mockExitApp(),
  },
}));

describe('App', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('renders without crashing', () => {
    const {toJSON} = render(<App />);
    expect(toJSON()).toBeTruthy();
  });

  it('injects a back-key keydown event on hardware back press', () => {
    render(<App />);
    const handler = mockAddEventListener.mock.calls[0][1];
    handler();
    expect(mockInjectJavaScript).toHaveBeenCalledWith(
      expect.stringContaining('keyCode'),
    );
  });

  it('exits the app when the page posts an exitApp message', () => {
    render(<App />);
    mockWebViewProps.onMessage?.({
      nativeEvent: {data: JSON.stringify({type: 'exitApp'})},
    });
    expect(mockExitApp).toHaveBeenCalled();
  });
});
