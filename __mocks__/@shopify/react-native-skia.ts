// Mock for @shopify/react-native-skia — Jest/node environment
// Canvas passes through children so React tree is renderable in tests.
// All drawing primitives (Rect, Path, Circle, Line) return null — no canvas output in Jest.
// useDerivedValue is mocked to synchronously return { value: fn() } for test predictability.

const React = require('react');

/** Shared mock path object factory — includes trim() for 04-victory-charts FR4 */
function makeMockPath() {
  return {
    moveTo: jest.fn().mockReturnThis(),
    lineTo: jest.fn().mockReturnThis(),
    cubicTo: jest.fn().mockReturnThis(),
    quadTo: jest.fn().mockReturnThis(),
    addArc: jest.fn().mockReturnThis(),
    arcTo: jest.fn().mockReturnThis(),
    close: jest.fn().mockReturnThis(),
    copy: jest.fn(function() { return makeMockPath(); }),
    reset: jest.fn().mockReturnThis(),
    trim: jest.fn().mockReturnThis(),
  };
}

module.exports = {
  Canvas: ({ children, width, height, style, onLayout }: any) =>
    React.createElement('Canvas', { width, height, style, onLayout }, children),

  // BackdropFilter — renders as host element so render tree contains "BackdropFilter"
  BackdropFilter: ({ children, filter }: any) =>
    React.createElement('BackdropFilter', { filter }, children),

  // Blur — ImageFilter used inside BackdropFilter
  Blur: (_props: any) => null,

  Rect: (_props: any) => null,
  Path: (_props: any) => null,
  Circle: (_props: any) => null,
  Line: (_props: any) => null,
  Text: (_props: any) => null,
  Group: ({ children }: any) => children ?? null,
  Paint: (_props: any) => null,
  Fill: (_props: any) => null,
  RoundedRect: (_props: any) => null,

  // Paint effects — null in test environment
  SweepGradient: (_props: any) => null,
  LinearGradient: (_props: any) => null,
  RadialGradient: (_props: any) => null,
  BlurMask: (_props: any) => null,
  BlurMaskFilter: (_props: any) => null,

  // Blend modes — used by AnimatedMeshBackground (02-animated-mesh)
  BlendMode: {
    Screen: 'screen',
    Multiply: 'multiply',
    Overlay: 'overlay',
    SrcOver: 'src-over',
  },

  // Geometry helpers
  vec: (x: number, y: number) => ({ x, y }),

  // matchFont — returns a mock font object (non-null) for test predictability
  // measureText returns a fixed width so positioning calculations don't crash in tests
  matchFont: jest.fn((_descriptor: any) => ({
    size: _descriptor?.fontSize ?? 10,
    measureText: jest.fn((_text: string) => ({
      width: 50,
      height: _descriptor?.fontSize ?? 10,
    })),
  })),

  // Reanimated-Skia bridge — synchronous in test environment
  useDerivedValue: (fn: () => any) => ({ value: fn() }),
  useSharedValueEffect: (_effect: any, ..._deps: any[]) => {},

  Skia: {
    // Path supports both Skia.Path() (legacy factory) and Skia.Path.Make() (canonical API)
    // MakeFromSVGString added for 04-victory-charts FR4 (AIArcHero Skia rebuild)
    Path: Object.assign(
      () => makeMockPath(),
      {
        Make: () => makeMockPath(),
        MakeFromSVGString: (_svgStr: string) => makeMockPath(),
      },
    ),
    XYWHRect: jest.fn((x: number, y: number, w: number, h: number) => ({ x, y, w, h })),
    Color: jest.fn((color: string) => color),
  },
};
