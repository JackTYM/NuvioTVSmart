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

const mockGetComponentInstance = jest.fn(() => ({}));
const mockSetHandlerForComponent = jest.fn();

jest.mock('@amazon-devices/react-native-kepler', () => ({
  usePreventHideSplashScreen: jest.fn(),
  useHideSplashScreenCallback: jest.fn(() => jest.fn()),
  useKeplerAppStateManager: jest.fn(() => ({
    getComponentInstance: mockGetComponentInstance,
  })),
  StyleSheet: {create: (styles: unknown) => styles},
  View: 'View',
  BackHandler: {
    addEventListener: (eventName: string, handler: () => boolean) =>
      mockAddEventListener(eventName, handler),
    exitApp: () => mockExitApp(),
  },
}));

jest.mock('@amazon-devices/kepler-media-controls', () => ({
  Action: {},
  RepeatMode: {},
  MediaControlServerComponentAsync: {
    getOrMakeServer: jest.fn(() => ({
      setHandlerForComponent: mockSetHandlerForComponent,
    })),
  },
}));

jest.mock('@amazon-devices/kepler-media-types', () => ({
  MediaId: class MediaId {},
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

  it("injects both a keydown and a matching keyup, so the web app's back-key debounce latch clears", () => {
    // js/ui/navigation/focusEngine.js latches a "back" key identity on keydown
    // and only clears it on a matching keyup (activeBackKeyIdentities). A
    // keydown-only injection permanently blocks every back press after the
    // first one, for the rest of the app session.
    render(<App />);
    const handler = mockAddEventListener.mock.calls[0][1];
    handler();
    const injectedScript = mockInjectJavaScript.mock.calls[0][0];
    expect(injectedScript).toEqual(expect.stringContaining('"keydown"'));
    expect(injectedScript).toEqual(expect.stringContaining('"keyup"'));
  });

  it('exits the app when the page posts an exitApp message', () => {
    render(<App />);
    mockWebViewProps.onMessage?.({
      nativeEvent: {data: JSON.stringify({type: 'exitApp'})},
    });
    expect(mockExitApp).toHaveBeenCalled();
  });

  it('registers a media control handler, replacing the broken default overlay', () => {
    render(<App />);
    expect(mockSetHandlerForComponent).toHaveBeenCalledTimes(1);
    const [handler, componentInstance] =
      mockSetHandlerForComponent.mock.calls[0];
    expect(componentInstance).toBe(
      mockGetComponentInstance.mock.results[0].value,
    );
    expect(typeof handler.handlePlay).toBe('function');
    expect(typeof handler.handleGetSessionState).toBe('function');
  });

  it('injects the Play media key on a handlePlay request', async () => {
    render(<App />);
    const handler = mockSetHandlerForComponent.mock.calls[0][0];
    await handler.handlePlay();
    expect(mockInjectJavaScript).toHaveBeenCalledWith(
      expect.stringContaining('415'),
    );
  });

  it('injects the Pause media key on a handlePause request', async () => {
    render(<App />);
    const handler = mockSetHandlerForComponent.mock.calls[0][0];
    await handler.handlePause();
    expect(mockInjectJavaScript).toHaveBeenCalledWith(
      expect.stringContaining('19'),
    );
  });

  it('safely no-ops handleSetRating, which this app has no use for', async () => {
    render(<App />);
    const handler = mockSetHandlerForComponent.mock.calls[0][0];
    await expect(handler.handleSetRating({}, 5)).resolves.toBeUndefined();
  });
});
